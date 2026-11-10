// Rust backend. Appended to upstream comp.ts (see tools/build.ts), like the
// Java one, and shaped like js_def/js_func/js_match/js_expr. Bend values are
// affine, which Rust moves model directly: a variable used more than once is
// cloned at each use (a datatype is an Rc, so a clone is a count bump); an
// Array or closure is never used twice, so it is never cloned. What it cannot
// translate exactly it refuses (die), it never approximates.
import * as Bend from "../../vendor/bend/bend2/bend.ts";

type RT = string; // a Rust type, or "?" (unknown: Rust infers it)
type RE = [string, RT];
type RScope = Scope & { rret: RT; rtv: string[]; rpc?: boolean; rps?: string[] };

let RV: {
  tv: Map<number, string>;
  ty: Map<number, RT>;
  lt: Map<string, RT>;
  multi: Map<number, boolean>; // probe -> used more than once
  adts: Set<Name>;
  params: Map<Name, { i: number; name: string; ar: number }[]>;
  cnames: Map<Name, string>;
  mnames: Map<Name, string>;
  taken: Set<string>;
  adtNames: Set<string>;
  sigs: Map<Name, { tps: string[]; params: [string, RT][]; ret: RT }>;
  fields: Map<Name, [string, RT][]>;
  cur: Name | null;
  tvpos: Map<Name, Map<number, [Name, string]>>;
  outs: Set<Name>;
  defNames: Set<string>;
} = null!;

function r_tvar(t: Of<"Var">): string | undefined {
  const p = RV.cur ? RV.tvpos.get(RV.cur)?.get(t.i) : undefined;
  return p && p[0] === t.k ? p[1] : RV.tv.get(t.i);
}

const R_RESERVED = new Set(("as break const continue crate else enum extern false fn"
  + " for if impl in let loop match mod move mut pub ref return self Self static"
  + " struct super trait true type unsafe use where while async await dyn abstract"
  + " become box do final macro override priv typeof unsized virtual yield try"
  + " union gen Rc Nat Str Arr Fun Cmp Any rt Option Some None Box Vec String"
  + " PhantomData std core alloc").split(" "));

const R_NATIVE: Record<Name, RT> = Object.setPrototypeOf({
  U32: "u32", F32: "f32", Char: "u32", Nat: "Nat", Bool: "bool",
  String: "Str", Unit: "()", Cmp: "Cmp",
}, null);

const R_COPY = new Set(["u32", "f32", "bool", "()", "Cmp"]);

function r_ident(k: string): string {
  let s = name_clean(k);
  if (/^[0-9]/.test(s)) s = "_" + s;
  return R_RESERVED.has(s) ? s + "_" : s;
}

function r_cname(k: Name): string {
  return memo(RV.cnames, k, () => {
    let id = r_ident(js_tag(k));
    while (RV.taken.has("c:" + id)) id += "_";
    RV.taken.add("c:" + id);
    return id;
  });
}

function r_mname(k: Name): string {
  return memo(RV.mnames, k, () => {
    let id = r_ident(k);
    while (RV.taken.has("m:" + id)) id += "_";
    RV.taken.add("m:" + id);
    return id;
  });
}

function r_tvname(k: Name, used: Set<string>): string {
  let id = r_ident(k.replace(/^[^A-Za-z]+/, "") || "T");
  id = id[0].toUpperCase() + id.slice(1);
  while (used.has(id) || RV.adtNames.has(id) || R_RESERVED.has(id)) id += "_";
  used.add(id);
  return id;
}

function r_vname(k: Name): string {
  return r_ident(js_tag(k));
}

function r_adt_params(k: Name) {
  return memo(RV.params, k, () => {
    const tld = tld_of(k);
    if (tld?.$ !== "ADT") return [];
    const used = new Set<string>();
    const out: { i: number; name: string; ar: number }[] = [];
    tele_unbind(tld.T).doms.forEach(([, nm, A], i) => {
      const ar = j_kind_arity(A);
      if (ar >= 0) out.push({ i, name: r_tvname(nm, used), ar });
    });
    return out;
  });
}

function r_targs(t: Of<"ADT">): string[] {
  return r_adt_params(t.k).map((p) => {
    let a: HTerm | undefined = t.x[p.i];
    if (a === undefined) return "Any";
    for (let j = 0; j < p.ar; j++) a = Bend.App(a, DUMMY);
    return rt(a);
  });
}

// A type that applies a type family (a def that matches on a value, as
// upstream facts_hot finds one). Its values are Any, never the reduced type:
// Sigma(Nat, Vec(0n)) and Sigma(Nat, Unit) are one Bend type, and rt::Dy
// gives both one dynamic form (see runtime/rust).
function r_family(T: HTerm | null): boolean {
  if (!T) return false;
  let t = Bend.term_strip(T);
  for (let n = 0; n < 64; n++) {
    const [h0, xs] = Bend.term_unapply(t);
    const h = Bend.term_strip(h0);
    if (h.$ === "Lam" && xs.length > 0) {
      t = Bend.term_strip(xs.reduce((b, x) => Bend.term_apply(b, x), h as HTerm));
      continue;
    }
    if (h.$ !== "Ref" || xs.length === 0) return false;
    const d = tld_of(h.k);
    if (d?.$ !== "Def" || !d.v) return false;
    const b = Bend.term_strip(Bend.term_unapply(xs.reduce((b, x) => Bend.term_apply(b, x), d.v))[0]);
    if (b.$ === "Mat") return true;
    if (b.$ === "Ref" || b.$ === "App") {
      t = Bend.term_strip(xs.reduce((b, x) => Bend.term_apply(b, x), d.v));
      continue;
    }
    return false;
  }
  return false;
}

// a family whose every result is a proposition (Unit, Empty, an equality or
// another such family) holds no runtime data: its values are (), as its
// reduced forms are, so both spellings agree
const R_PROP = new Map<Name, boolean>();
function r_prop_body(t0: HTerm, seen: Set<Name>, d = 0): boolean {
  if (d > 256) return false;
  const t = Bend.term_strip(t0);
  switch (t.$) {
    case "Lam": return r_prop_body(t.f(DUMMY), seen, d + 1);
    case "Mat": return r_prop_body(t.h, seen, d + 1) && r_prop_body(t.m, seen, d + 1);
    case "Efq": case "Eql": return true;
    case "ADT": return t.k === "Unit" || t.k === "Empty";
    case "Ref": case "App": {
      const h = Bend.term_strip(Bend.term_unapply(t)[0]);
      return h.$ === "Ref" && (h.k === "Unit" || h.k === "Empty" || r_prop_def(h.k, seen));
    }
    default: return false;
  }
}
function r_prop_def(k: Name, seen = new Set<Name>()): boolean {
  if (R_PROP.has(k)) return R_PROP.get(k)!;
  if (seen.has(k)) return true; // a recursive family: its other leaves decide
  const d = tld_of(k);
  if (d?.$ !== "Def" || !d.v) return false;
  seen.add(k);
  const r = r_prop_body(d.v, seen);
  if (seen.size === 1) R_PROP.set(k, r);
  seen.delete(k);
  return r;
}
function r_family_head(T: HTerm): Name | null {
  let t = Bend.term_strip(T);
  for (;;) {
    const [h0, xs] = Bend.term_unapply(t);
    const h = Bend.term_strip(h0);
    if (h.$ === "Lam" && xs.length > 0) {
      t = Bend.term_strip(xs.reduce((b, x) => Bend.term_apply(b, x), h as HTerm));
      continue;
    }
    return h.$ === "Ref" ? h.k : null;
  }
}

function rt(T: HTerm | null): RT {
  if (r_family(T)) {
    const k = r_family_head(T!);
    if (k && r_prop_def(k)) return "()";
    return "Any";
  }
  const t = ty_wnf(T);
  if (!t) return "Any";
  switch (t.$) {
    case "ADT": {
      const nat = R_NATIVE[t.k];
      if (nat) return nat;
      if (t.k === "Array") return `Arr<${rt(t.x[0])}>`;
      if (t.k === "Sigma") return `(${r_targs(t).join(", ")})`;
      if (t.k === "IO" || t.k === "IO.OP") die("an IO type in pure Rust output");
      if (t.k.startsWith("Word.")) die("a raw Word (the bits of a U32/F32) in Rust output");
      if (t.k === "Empty") return "()";
      RV.adts.add(t.k);
      const as = r_targs(t);
      return `Rc<${r_cname(t.k)}${as.length ? `<${as.join(", ")}>` : ""}>`;
    }
    case "All": {
      return t.q.$ === "None" ? rt(t.B(DUMMY)) : `Fun<${rt(t.A)}, ${rt(t.B(DUMMY))}>`;
    }
    case "Var": {
      return r_tvar(t) ?? "Any";
    }
    case "App": {
      const h = term_force(Bend.term_unapply(t)[0]);
      return (h.$ === "Var" && r_tvar(h)) || "Any";
    }
    case "Eql":
    case "Typ":
    case "Qnt":
    case "Qua":
    case "Min":
      return "()";
    default:
      return "Any";
  }
}

function r_args_of(t: RT): string[] {
  const at = t.indexOf("<");
  if (at < 0) return [];
  const out: string[] = [];
  let d = 0, s = "";
  for (const c of t.slice(at + 1, -1)) {
    if (c === "," && d === 0) {
      out.push(s.trim());
      s = "";
      continue;
    }
    d += c === "<" || c === "(" ? 1 : c === ">" || c === ")" ? -1 : 0;
    s += c;
  }
  out.push(s.trim());
  return out;
}

// the components of a Rust tuple type "(A, B)", else null
function r_tuple_of(t: RT): string[] | null {
  if (!t.startsWith("(") || !t.endsWith(")") || t === "()") return null;
  const out: string[] = [];
  let d = 0, s = "";
  for (const c of t.slice(1, -1)) {
    if (c === "," && d === 0) {
      out.push(s.trim());
      s = "";
      continue;
    }
    d += c === "<" || c === "(" ? 1 : c === ">" || c === ")" ? -1 : 0;
    s += c;
  }
  if (d !== 0) return null;
  out.push(s.trim());
  return out.length === 2 ? out : null;
}

let R_TMP = 0;

// convert e (of Rust type from) to Rust type to. A pair converts by
// component and a closure by wrapping, so a value whose type names a type
// variable on one side and Any on the other still converts.
function r_conv(e: string, from: RT, to: RT): string {
  if (from === to || to === "?" || from === "?") return e;
  if (to === "Any") return `rt::up(${e})`;
  if (from === "Any") return `rt::down::<${to}>(${e})`;
  if (to === "()") return `{ let _ = ${e}; }`;
  const [ft, tt] = [r_tuple_of(from), r_tuple_of(to)];
  if (ft && tt) {
    const [a, b] = [`__a${R_TMP}`, `__b${R_TMP++}`];
    return `{ let (${a}, ${b}) = ${e}; (${r_conv(a, ft[0], tt[0])}, ${r_conv(b, ft[1], tt[1])}) }`;
  }
  if (from.startsWith("Fun<") && to.startsWith("Fun<")) {
    const [[fa, fb], [ta, tb]] = [r_args_of(from), r_args_of(to)];
    const [f, x] = [`__f${R_TMP}`, `__x${R_TMP++}`];
    return `{ let ${f} = ${e}; Fun::new(move |${x}: ${ta}| -> ${tb} { ${r_conv(`${f}.call(${r_conv(x, ta, fa)})`, fb, tb)} }) }`;
  }
  die(`a value of Rust type ${from} where ${to} is expected` + (process.env.BW_DEBUG ? " in " + e : ""));
}

function r_hold(sc: Scope, e: string, t: RT, k: string): string {
  const al = name_local(sc, k);
  file_push(sc, `let ${al}${t === "?" ? "" : ": " + t} = ${e};`);
  RV.lt.set(al, t);
  return al;
}

function r_bare(e: string): boolean {
  return FL.locals.has(e) || /^[\w.:]+$/.test(e);
}

function r_codes(t: HTerm): number[] {
  const s = Bend.term_strip(t);
  return s.$ === "Lit" ? [...String(s.v)].map((c) => c.codePointAt(0)!)
    : s.$ !== "Ctr" || s.k === "SNil" ? []
    : s.k === "Chr" ? [Bend.u32_from_term(s.x[0])!]
    : [...r_codes(s.x[0]), ...r_codes(s.x[1])];
}

function r_str(cs: number[]): string {
  if (cs.every((c) => c < 0xD800 || (c >= 0xE000 && c <= 0x10FFFF))) {
    let out = "\"";
    for (const c of cs) {
      out += c === 34 ? "\\\"" : c === 92 ? "\\\\" : c === 10 ? "\\n"
        : c === 13 ? "\\r" : c === 9 ? "\\t"
        : c >= 32 && c < 127 ? String.fromCharCode(c) : `\\u{${c.toString(16)}}`;
    }
    return `Str::from(${out}")`;
  }
  return `Str::from_codes(&[${cs.map((c) => c + "u32").join(", ")}])`;
}

function r_u32(u: number): string {
  return u >= 2 ** 31 ? "0x" + u.toString(16).toUpperCase() + "u32" : u + "u32";
}

function r_f32(u: number): string {
  const v = Bend.f32_from_bits(u);
  if (Number.isNaN(v)) return `f32::from_bits(${r_u32(u)})`;
  if (v === Infinity) return "f32::INFINITY";
  if (v === -Infinity) return "f32::NEG_INFINITY";
  if (Object.is(v, -0)) return "-0.0f32";
  return `${v}f32`;
}

function r_nat(n: number): string {
  return `rt::nat(${n})`;
}

// Native datatypes: builder, test, and fields (one expression, or a
// destructured tuple when two).
const R_OPT: Record<Name, Record<Name, { intr: string; cond?: string; one?: string; two?: string }>> =
  Object.setPrototypeOf({
    Bool: { False: { intr: "false", cond: "!$0" }, True: { intr: "true", cond: "$0" } },
    Unit: { Unit: { intr: "()", cond: "true" } },
    Cmp: {
      LT: { intr: "Cmp::LT", cond: "$0 == Cmp::LT" },
      EQ: { intr: "Cmp::EQ", cond: "$0 == Cmp::EQ" },
      GT: { intr: "Cmp::GT", cond: "$0 == Cmp::GT" },
    },
    Sigma: { Tuple: { intr: "($0, $1)", cond: "true", two: "$0" } },
    Char: { Chr: { intr: "$0", cond: "true", one: "$0" } },
    String: {
      SNil: { intr: "Str::empty()", cond: "$0.is_empty()" },
      SCon: { intr: "Str::cons($0, $1)", cond: "!$0.is_empty()", two: "$0.uncons()" },
    },
    Array: {
      ALeaf: { intr: "Arr::leaf($0)", cond: "$0.len() == 1", one: "$0.into_leaf()" },
      ANode: { intr: "Arr::node($0, $1)", cond: "$0.len() != 1", two: "$0.split()" },
    },
  }, null);

const R_CMPS: Record<string, string> = { is_eq: "==", is_ne: "!=", is_lt: "<", is_le: "<=", is_gt: ">", is_ge: ">=" };
const R_OPS: Record<string, string> = Object.setPrototypeOf({
  u32_add: "($0).wrapping_add($1)", u32_sub: "($0).wrapping_sub($1)", u32_mul: "($0).wrapping_mul($1)",
  u32_and: "($0 & $1)", u32_or: "($0 | $1)", u32_xor: "($0 ^ $1)",
  ...Object.fromEntries(Object.entries(R_CMPS).map(([k, o]) => ["u32_" + k, `($0 ${o} $1)`])),
  u32_div: "rt::u32_div($0, $1)", u32_mod: "rt::u32_mod($0, $1)",
  u32_inc: "($0).wrapping_add(1)", u32_shl: "($0 << 1)", u32_shr: "($0 >> 1)",
  u32_shln: "rt::u32_shln($0, $1)", u32_shrn: "rt::u32_shrn($0, $1)",
  u32_not: "(!$0)", u32_is_zero: "($0 == 0)", u32_cmp: "rt::cmp(($0).cmp(&$1))",
  u32_to_f32: "(($0) as f32)", f32_from_nat: "rt::nat_to_f32($0)",
  u32_to_nat: "Nat::from($0)", u32_from_nat: "rt::nat_low32($0)",
  f32_add: "($0 + $1)", f32_sub: "($0 - $1)", f32_mul: "($0 * $1)", f32_div: "($0 / $1)",
  f32_neg: "(-$0)",
  ...Object.fromEntries(Object.entries(R_CMPS).map(([k, o]) => ["f32_" + k, `($0 ${o} $1)`])),
  ...Object.fromEntries("exp log2 log10 sin cos tan asin acos atan sinh cosh tanh".split(" ")
    .map((k) => ["f32_" + k, `rt::f::${k}($0)`])),
  f32_log: "rt::f::ln($0)", f32_sqrt: "($0).sqrt()", f32_floor: "($0).floor()",
  f32_ceil: "($0).ceil()", f32_trunc: "($0).trunc()", f32_abs: "($0).abs()",
  f32_atan2: "rt::f::atan2($0, $1)", f32_pow: "rt::f::pow($0, $1)", f32_mod: "($0 % $1)",
  f32_to_u32: "rt::f32_to_u32($0)", f32_bits: "($0).to_bits()",
  f32_show: "rt::f32_show($0)",
  f32_read: "rt::opt(rt::f32_read($0), || Rc::new($M::None {}), |v| Rc::new($M::Some { value: v }))",
  nat_add: "($0 + $1)", nat_double: "($0 << 1usize)", nat_mul: "($0 * $1)",
  nat_cmp: "rt::cmp(($0).cmp(&$1))", nat_sub: "rt::nat_sub($0, $1)",
  nat_is_lt: "($0 < $1)", nat_min: "std::cmp::min($0, $1)", nat_max: "std::cmp::max($0, $1)",
  nat_divmod: "rt::nat_divmod($0, $1)",
  bool_or: "($0 || $1)", bool_xor: "($0 != $1)",
  string_append: "($0).append($1)", string_contains: "($0).contains($1)",
  string_length: "($0).len_nat()",
  array_new: "Arr::make($0, $1)", array_set: "($0).set($1, $2)", array_get: "($0).get_t($1)",
  array_get_unchecked: "($0).get_t($1)", array_swap: "($0).swap_t($1, $2)", array_size: "($0).size_t()",
  array_clone: "($0).clone_t()",
}, null);

function r_subst(t: RT, m: Map<string, RT>): RT {
  return m.size === 0 ? t : t.replace(/[A-Za-z_][\w]*/g, (w) => m.get(w) ?? w);
}

function rust_sig(k: Name) {
  return memo(RV.sigs, k, () => {
    const tld = tld_of(k) as Bend.Def;
    const used = new Set<string>();
    const tps: string[] = [];
    const params: [string, RT][] = [];
    let tel: HTerm = tld.T;
    const n = fun_of(k).n;
    const pos = new Map<number, [Name, string]>();
    RV.tvpos.set(k, pos);
    for (let i = 0; i < n; i++) {
      const a = Bend.tele_open(FL.book, tel)!;
      const p = probe(a.k);
      if (a.q.$ === "None") {
        if (j_kind_arity(a.A) >= 0) {
          const nm = r_tvname(a.k, used);
          RV.tv.set(p.i, nm);
          pos.set(i, [a.k, nm]);
          tps.push(nm);
        }
      } else {
        params.push([a.k, rt(a.A)]);
      }
      tel = a.B(p);
    }
    return { tps, params, ret: rt(tel) };
  });
}

function r_inst(k: Name, all: HTerm[]): { ps: RT[]; ret: RT; targs: RT[]; bps: HTerm[] } {
  const tld = tld_of(k) as Bend.Def;
  const sig = rust_sig(k);
  const targs: RT[] = [];
  const bps: HTerm[] = [];
  let tel: HTerm = tld.T;
  const n = fun_of(k).n;
  for (let i = 0; i < n; i++) {
    const a = Bend.tele_open(FL.book, tel);
    if (a === null) break;
    const x = all[i] ?? DUMMY;
    if (a.q.$ !== "None") bps.push(a.A);
    if (a.q.$ === "None" && j_kind_arity(a.A) >= 0) {
      let y: HTerm = x;
      for (let j = 0; j < j_kind_arity(a.A); j++) y = Bend.App(y, DUMMY);
      targs.push(rt(y));
    }
    tel = a.B(x);
  }
  const m = new Map(sig.tps.map((t, i) => [t, targs[i] ?? "Any"]));
  return { ps: sig.params.map(([, T]) => r_subst(T, m)), ret: r_subst(sig.ret, m), targs, bps };
}

function r_fields(adtk: Name, ck: Name): [string, RT][] {
  return memo(RV.fields, ck, () => {
    const tld = tld_of(adtk) as Bend.ADT;
    const ps = r_adt_params(adtk);
    const nparams = tele_unbind(tld.T).doms.length;
    const c = FL.book.ctrs[ck];
    const fields: [string, RT][] = [];
    let tel: HTerm = c.T;
    let i = 0;
    for (let a = Bend.tele_open(FL.book, tel); a; a = Bend.tele_open(FL.book, tel), i++) {
      const p = probe(a.k);
      if (i < nparams) {
        const jp = ps.find((q) => q.i === i);
        if (jp) RV.tv.set(p.i, jp.name);
      } else if (a.q.$ !== "None") {
        fields.push([r_ident(a.k), rt(a.A)]);
      }
      tel = a.B(p);
    }
    return fields;
  });
}

function r_fields_at(adt: Of<"ADT">, ck: Name): [string, RT][] {
  const ps = r_adt_params(adt.k);
  const full = adt.x.length > 0 || ps.length === 0;
  const m = new Map(ps.map((p, i) => [p.name, full ? r_targs(adt)[i] : "?"]));
  return r_fields(adt.k, ck).map(([f, T]) => [f, r_subst(T, m)]);
}

// a use of the local bound to probe i
function r_use(i: number, n: string): string {
  return RV.multi.get(i) && !R_COPY.has(RV.ty.get(i) ?? "") ? `${n}.clone()` : n;
}

function rust_call(sc: RScope, k: Name, args: HTerm[], all: HTerm[]): RE {
  const tld = tld_of(k);
  if (tld?.$ === "ADT") {
    return ["()", "()"];
  }
  if (k === CLO_APPLY) {
    const [[f, ft], [x, xt]] = args.map((a) => rust_expr(sc, a));
    if (ft === "Any") {
      return [`rt::down::<Fun<Any, Any>>(${f}).call(${r_conv(x, xt, "Any")})`, "Any"];
    }
    if (!ft.startsWith("Fun<")) die("a call of a closure whose Rust type is " + ft);
    const [A, B] = r_args_of(ft);
    return [`${f}.call(${r_conv(x, xt, A)})`, B];
  }
  const intr = intr_of(k, true);
  if (intr) {
    let t = R_OPS[op_name(k)];
    if (t === undefined) {
      die("no Rust intrinsic for " + Bend.name_key(k));
    }
    const sig = r_inst(k, all);
    const xs = args.map((a, i) => {
      const [e, et] = rust_expr(sc, a);
      return r_conv(e, et, sig.ps[i] ?? et);
    });
    if (t.includes("$M")) {
      RV.adts.add("Maybe");
      const M = r_cname("Maybe");
      t = t.replaceAll("$M::None", `${M}::${r_vname("None")}`).replaceAll("$M::Some", `${M}::${r_vname("Some")}`);
    }
    return [tpl(t, xs), sig.ret];
  }
  if (!fun_runs(tld)) {
    die("a live call into the law " + Bend.name_key(k));
  }
  if (def_foreign(tld)) {
    die("a foreign (effect) def in pure Rust output: " + Bend.name_key(k));
  }
  const sig = r_inst(k, all);
  const xs = args.map((a, i) => {
    const [e, et] = rust_expr(sc, a);
    return r_conv(e, et, sig.ps[i] ?? et);
  });
  const ta = sig.targs.length ? `::<${sig.targs.join(", ")}>` : "";
  return [`${r_mname(k)}${ta}(${xs.join(", ")})`, sig.ret];
}

function r_bind(p: Of<"Var">, name: string, t: RT, body: HTerm[]): void {
  FL.names.set(p.i, name);
  RV.ty.set(p.i, t);
  RV.multi.set(p.i, rest_use(body, p) > 1);
}

function rust_open(sc: RScope, x: Of<"Let">): HTerm {
  const o = term_open(x);
  let_live(x).forEach((on, j) => {
    const p = o.ps[j];
    if (!on) {
      r_bind(p, "()", "()", []);
      return;
    }
    const [e, et] = rust_expr(sc, x.v[j]);
    r_bind(p, r_hold(sc, e, et, x.k[j]), et, [o.b]);
  });
  return o.b;
}

function rust_expr(sc: RScope, tm: HTerm, ty0: HTerm | null = null): RE {
  const [x, ty] = ty_peel(tm, ty0);
  switch (x.$) {
    case "Var": {
      const n = FL.names.get(x.i);
      if (n === undefined) die("an unbound variable " + x.k);
      return [r_use(x.i, n), RV.ty.get(x.i) ?? RV.lt.get(n) ?? "?"];
    }
    case "Ref":
    case "App": {
      const m = term_spine(x);
      if (m.k !== null) {
        return rust_call(sc, m.k, m.xs, m.all);
      }
      const y = call_eta(x) ?? (m.t.$ !== "Ref" ? m.h : null);
      if (y !== null) {
        return rust_expr(sc, y, ty);
      }
      return rust_call(sc, m.t.k, intr_of(m.t.k)?.C === null ? [...m.args,
        Bend.Lit("U32", lay_arr(lay_el(m.all[0])).lgs)] : m.args, m.all);
    }
    case "Ctr": {
      const [adt, u] = ctr_adt(x, ty);
      if (u !== null) {
        return adt.k === "F32" ? [r_f32(u), "f32"] : [r_u32(u), "u32"];
      }
      if (adt.k === "Char" && term_const(x)) {
        return [r_u32(Bend.u32_from_term((Bend.term_strip(x) as Of<"Ctr">).x[0])!), "u32"];
      }
      if (adt.k === "String" && term_const(x)) {
        return [r_str(r_codes(x)), "Str"];
      }
      if (adt.k === "Nat") {
        const [b, n] = nat_peel(x);
        if (b === null) return [r_nat(n), "Nat"];
        const [e, et] = rust_expr(sc, b, adt);
        return [`(${r_conv(e, et, "Nat")} + ${r_nat(n)})`, "Nat"];
      }
      if (adt.k === "U32" || adt.k === "F32") {
        die("a " + adt.k + " built from its raw bits (a non-constant Word)");
      }
      const ctr = FL.book.ctrs[x.k];
      const native = R_OPT[adt.k];
      const full = adt.x.length > 0 || r_adt_params(adt.k).length === 0;
      const fts = native ? (full ? ctr_live(ctr, adt.x).map(([, , A]) => rt(A)) : [])
        : r_fields_at(adt, x.k).map(([, T]) => T);
      const exprs = ctr_flds(x).map((f, j) => {
        const [e, et] = rust_expr(sc, f);
        return fts[j] ? r_conv(e, et, fts[j]) : e;
      });
      const T = full ? rt(adt) : "?";
      if (native) {
        if (!native[x.k]) die("a native constructor with no Rust form: " + x.k);
        return [tpl(native[x.k].intr, exprs), T];
      }
      RV.adts.add(adt.k);
      const fs = r_fields(adt.k, x.k);
      return [`Rc::new(${r_cname(adt.k)}::${r_vname(x.k)} {${fs.map(([f], j) =>
        ` ${f}: ${exprs[j]}`).join(",")}${fs.length ? " " : ""}})`, T];
    }
    case "Let": {
      return rust_expr(sc, rust_open(sc, x), ty);
    }
    case "Lam":
    case "Mat":
    case "Efq": {
      if (x.$ === "Lam" && !fun_live(x, ty)) {
        const o = term_open(x);
        r_bind(o.ps[0], "()", "()", []);
        return rust_expr(sc, o.b, ty_all(ty).B(DUMMY));
      }
      if (ty === null) die("a closure with no type");
      const all = ty_all(ty);
      const A = rt(all.A);
      const B = rt(all.B(DUMMY));
      // a capture used past the closure too moves in as a clone
      const caps = Bend.pmap_to_array(term_uses(x)).filter(([, n]) => n).map(([i]) => i)
        .filter((i) => RV.multi.get(i) && FL.names.get(i) !== "()");
      const saved = caps.map((i) => [i, FL.names.get(i)!] as const);
      for (const [i, n] of saved) {
        const c = name_local(sc, "c");
        file_push(sc, `let ${c} = ${n}.clone();`);
        FL.names.set(i, c);
        RV.multi.set(i, (Bend.pmap_get(term_uses(x), i) ?? 0) > 1);
      }
      const arg = name_local(sc, "x");
      RV.lt.set(arg, A);
      const seg = seg_new("", BOX, []);
      seg.tab = sc.seg.tab + 1;
      const cl: RScope = { ...sc, seg, rret: B, rtv: [] };
      rust_func(cl, x, ty, [[arg, A]]);
      for (const [i, n] of saved) {
        FL.names.set(i, n);
        RV.multi.set(i, true);
      }
      const pad = "  ".repeat(sc.seg.tab);
      return [`Fun::new(move |${arg}: ${A}| -> ${B} {\n${seg.lines.join("\n")}\n${pad}})`, `Fun<${A}, ${B}>`];
    }
    case "Lit": {
      die("an unexpected literal " + x.k);
    }
    default: {
      return ["()", "()"];
    }
  }
}

function rust_func(sc: RScope, tm: HTerm, ty0: HTerm | null, args: RE[]): void {
  const [x, ty] = ty_peel(tm, ty0);
  if (args.length === 0 && fun_live(x, ty)) {
    const [e, et] = rust_expr(sc, x, ty);
    return file_push(sc, `return ${r_conv(e, et, sc.rret)};`);
  }
  if (x.$ === "Lam") {
    const all = ty_all(ty);
    const { ps: [v], b } = term_open(x);
    if (all.q.$ === "None") {
      if (j_kind_arity(all.A) >= 0) {
        RV.tv.set(v.i, sc.rtv.shift() ?? "Any");
      }
      r_bind(v, "()", "()", []);
      return rust_func(sc, b, all.B(v), args);
    }
    const [[e, et], ...rest] = args;
    const uses = rest_use([b], v);
    let k = e;
    if (!FL.locals.has(e) && uses > 0) {
      k = r_hold(sc, e, et, x.k);
    }
    r_bind(v, uses > 0 ? k : "()", et, [b]);
    return rust_func(sc, b, all.B(v), rest);
  }
  if (mat_head(x)) {
    return rust_match(sc, x, ty, args);
  }
  if (x.$ === "Let" || args.length > 0) {
    return rust_func(sc, x.$ === "Let" ? rust_open(sc, x) : term_eta(x, ty!, 1), ty, args);
  }
  const ck = term_spine(x);
  const loop = loop_of(sc.seg.def);
  const at = loop.indexOf(ck.k ?? "");
  if (at >= 0) {
    const to = rust_sig(ck.k!).params;
    const vals = ck.xs.map((a, i) => {
      const [e, et] = rust_expr(sc, a);
      return sc.rpc ? r_conv(e, et, "Any") : r_conv(e, et, to[i][1]);
    });
    const tmp = vals.map((v, i) => r_bare(v) ? v : r_hold(sc, v, sc.rpc ? "Any" : to[i][1], "n"));
    return file_push(sc, ...tmp.map((v, i) => `${sc.rpc ? "p" + i : sc.rps![i]} = ${v};`),
      ...sc.rpc ? [`pc = ${at};`] : [], "continue;");
  }
  const [e, et] = ck.k === null ? rust_expr(sc, x, ty) : rust_call(sc, ck.k, ck.xs, ck.all);
  file_push(sc, `return ${r_conv(e, et, sc.rret)};`);
}

function rust_match(sc: RScope, x: HTerm, ty: HTerm | null, args: RE[]): void {
  if (x.$ === "Efq") {
    return file_push(sc, "return rt::absurd();");
  }
  const [s0, st] = args[0];
  const self = probe("s");
  const { adt, rows } = mat_rows(sc, x, ty, self);
  const want = rt(adt);
  const s = FL.locals.has(s0) && (st === want || st === "?") ? s0 : r_hold(sc, r_conv(s0, st, want), want, "t");
  // the scrutinee is read again when an arm rebuilds it or a default takes it
  const arms = rows !== null ? rows.map(([a]) => a) : mat_arms(x).arms.map(([, h]) => h);
  const again = rest_use(arms, self) > 0 || (rows === null && mat_ctrs(x, adt).some(([k]) => k === ""));
  const sv = again && !R_COPY.has(want) ? `${s}.clone()` : s;
  r_bind(self, s, want, []);
  RV.multi.set(self.i, true);
  type Arm = [string, HTerm, RE[], string[]];
  if (rows !== null) {
    let lv: Arm[];
    if (adt.k === "Nat") {
      lv = rows.map(([a, b, v, f]): Arm => [b >= 32 ? `rt::nat_eq(&${s}, ${v})` : "true", a,
        f > 0 ? [[v === 0 ? sv : `(${sv} - ${r_nat(v)})`, "Nat"]] : [], []]);
    } else {
      const bits = adt.k === "F32" ? `${s}.to_bits()` : s;
      lv = rows.map(([a, b, v, f]): Arm => {
        if (f > 0) die("a match binding the raw bits of a " + adt.k);
        return [b >= 32 ? `${bits} == ${r_u32(v)}`
          : `(${bits} & ${r_u32(2 ** b - 1)}) == ${r_u32(v)}`, a, [], []];
      });
    }
    return emit_chain(sc, lv.map(([c, h, fs]) => [c, () =>
      rust_func(sc, h, null, [...fs, ...args.slice(1)])]));
  }
  const native = R_OPT[adt.k];
  const ctrs = mat_ctrs(x, adt);
  if (native) {
    return emit_chain(sc, ctrs.map(([k, h]) => {
      if (k === "_") die("an IO.OP match in Rust output");
      if (k === "") return ["true", () => rust_func(sc, h, null, [[s, want], ...args.slice(1)])];
      const n = native[k];
      if (!n) die("a native constructor with no Rust form: " + k);
      const fts = ctr_live(FL.book.ctrs[k], adt.x).map(([, , A]) => rt(A));
      return [tpl(n.cond ?? "true", [s]), () => {
        let fs: RE[] = [];
        if (n.one) {
          fs = [[tpl(n.one, [sv]), fts[0] ?? "?"]];
        } else if (n.two) {
          const [a, b] = [name_local(sc, "f"), name_local(sc, "f")];
          file_push(sc, `let (${a}, ${b}) = ${tpl(n.two, [sv])};`);
          FL.locals.set(a, a);
          FL.locals.set(b, b);
          fs = [[a, fts[0] ?? "?"], [b, fts[1] ?? "?"]];
        }
        rust_func(sc, h, null, [...fs, ...args.slice(1)]);
      }];
    }));
  }
  const C = r_cname(adt.k);
  file_push(sc, `match ${again ? `&*${s}` : `Rc::unwrap_or_clone(${s})`} {`);
  sc.seg.tab++;
  let dflt = false;
  for (const [k, h] of ctrs) {
    if (k === "_") die("an IO.OP match in Rust output");
    if (k === "") {
      dflt = true;
      block(sc, "_ => {", () => rust_func(sc, h, null, [[s, want], ...args.slice(1)]));
      continue;
    }
    const fs = r_fields_at(adt, k);
    const vs = fs.map(([f]) => name_local(sc, f));
    vs.forEach((v) => FL.locals.set(v, v));
    block(sc, `${C}::${r_vname(k)} {${fs.map(([f], j) => ` ${f}: ${vs[j]}`).join(",")}${fs.length ? " " : ""}} => {`, () => {
      if (again) {
        vs.forEach((v) => file_push(sc, `let ${v} = ${v}.clone();`));
      }
      rust_func(sc, h, null, [...vs.map((v, j): RE => [v, fs[j][1]]), ...args.slice(1)]);
    });
  }
  if (!dflt) {
    file_push(sc, "_ => return rt::absurd(),");
  }
  sc.seg.tab--;
  file_push(sc, "}");
}

function rust_def(k: Name, def: Bend.Def): void {
  if (intr_of(k, true)) {
    return;
  }
  if (def_foreign(def)) {
    die("a foreign (effect) def in pure Rust output: " + Bend.name_key(k));
  }
  const sc = scope_new() as RScope;
  sc.seg.def = k;
  RV.cur = k;
  FL.unit!.segs.push(sc.seg);
  const { h } = fun_of(k);
  const sig = rust_sig(k);
  sc.rret = sig.ret;
  const loop = loop_of(k);
  const pc = loop.length > 1;
  if (pc && loop.some((d) => rust_sig(d).tps.length > 0)) {
    die("a generic def in a tail cycle across defs: " + loop.map(Bend.name_key).join(", "));
  }
  // a parameter keeps its Bend name where that is a plain, unique Rust name
  // no def has (a local would shadow the function)
  const plain = sig.params.map(([x]) => /^[a-z][a-z0-9_]*$/.test(x) && !R_RESERVED.has(x) && x !== "pc"
    && !RV.defNames.has(x) ? x : null);
  const params = sig.params.map(([x], i) => plain[i] !== null && plain.indexOf(plain[i]) === plain.lastIndexOf(plain[i])
    ? plain[i]! : pc ? "a" + i : loop.length > 0 ? "p" + i : name_local(sc, x));
  params.forEach((p, i) => RV.lt.set(p, sig.params[i][1]));
  sc.rps = params;
  const tps = sig.tps.length ? `<${sig.tps.map((t) => t + ": rt::Dy").join(", ")}>` : "";
  const mut = loop.length === 1 ? "mut " : "";
  block(sc, `${RV.outs.has(k) ? "pub " : ""}fn ${r_mname(k)}${tps}(${params.map((p, i) =>
    `${mut}${p}: ${sig.params[i][1]}`).join(", ")}) -> ${sig.ret} {`, () => {
    if (loop.length === 0) {
      sc.rtv = [...sig.tps];
      const ps = params.map((p, i): RE => [p, sig.params[i][1]]);
      params.forEach((p) => FL.locals.set(p, p));
      return rust_func(sc, h!, def.T, ps);
    }
    if (!pc) {
      return block(sc, "loop {", () => {
        const fx: RScope = { ...sc, fresh: new Map(), fuel: { n: FOLD_FUEL }, rtv: [...sig.tps] };
        const ps = sig.params.map(([x], j) => r_hold(fx, params[j], sig.params[j][1], x));
        rust_func(fx, h!, def.T, ps.map((p, i) => [p, sig.params[i][1]]));
      });
    }
    const width = Math.max(...loop.map((d) => rust_sig(d).params.length));
    for (let i = 0; i < width; i++) {
      file_push(sc, `let mut p${i}: Any = ${i < params.length ? `rt::up(${params[i]})` : "rt::up(())"};`);
    }
    file_push(sc, `let mut pc: u32 = ${loop.indexOf(k)};`);
    block(sc, "loop {", () => {
      block(sc, "match pc {", () => {
        loop.forEach((d, i) => {
          const ds = rust_sig(d);
          const fx: RScope = { ...sc, fresh: new Map(), fuel: { n: FOLD_FUEL },
            rtv: d === k ? [...sig.tps] : [], rpc: true };
          block(fx, `${i} => {`, () => {
            RV.cur = d;
            const ps = ds.params.map(([x, T], j) => r_hold(fx, `rt::down::<${T}>(p${j}.clone())`, T, x));
            rust_func(fx, fun_of(d).h!, tld_of(d).T, ps.map((p, j) => [p, ds.params[j][1]]));
          });
        });
        RV.cur = k;
        file_push(sc, "_ => return rt::absurd(),");
      });
    });
  });
  file_push(sc, "");
}

function rust_adt(k: Name): string[] {
  const tld = tld_of(k) as Bend.ADT;
  const C = r_cname(k);
  const ps = r_adt_params(k);
  const gen = ps.length ? `<${ps.map((p) => p.name).join(", ")}>` : "";
  const vs = tld.c.map((c) => {
    const fs = r_fields(k, c.k);
    // Gr<A> holding a Gr<P<A, A>>: rustc cannot work out how to drop it
    for (const [, T] of fs) {
      for (let at = T.indexOf(C + "<"); ps.length && at >= 0; at = T.indexOf(C + "<", at + 1)) {
        if (/[A-Za-z0-9_]/.test(T[at - 1] ?? "")) continue;
        let d = 0, end = at + C.length;
        do {
          d += T[end] === "<" ? 1 : T[end] === ">" ? -1 : 0;
          end++;
        } while (d > 0 && end < T.length);
        if (T.slice(at + C.length, end) !== gen) {
          die(`the datatype ${Bend.name_key(k)} recurses at another type (${T.slice(at, end)}): no Rust form; use the Java backend`);
        }
      }
    }
    return `  ${r_vname(c.k)} {${fs.map(([f, T]) => ` ${f}: ${T}`).join(",")}${fs.length ? " " : ""}},`;
  });
  // a type parameter no field uses still needs a use
  const phantom = ps.length ? [`  #[doc(hidden)] __Phantom(std::marker::PhantomData<(${ps.map((p) => p.name).join(", ")},)>),`] : [];
  const bound = ps.length ? `<${ps.map((p) => p.name + ": rt::Dy").join(", ")}>` : "";
  return ["#[derive(Clone, Debug)]", `pub enum ${C}${gen} {`, ...vs, ...phantom, "}",
    `impl${bound} rt::Node for ${C}${gen} {}`, ""];
}

export function rust_lib(book: Bend.Book, module: string, roots: Name[] | null = null): string {
  FL = file_new(book, true);
  R_PROP.clear();
  RV = {
    tv: new Map(), ty: new Map(), lt: new Map(), multi: new Map(), adts: new Set(), params: new Map(),
    cnames: new Map(), mnames: new Map(), taken: new Set(), sigs: new Map(), fields: new Map(), cur: null, tvpos: new Map(), outs: new Set(),
    defNames: new Set(Object.keys(book.tlds).map((k) => name_clean(k))),
    adtNames: new Set(Object.entries(book.tlds).filter(([, t]) => t.$ === "ADT").map(([k]) => r_ident(js_tag(k)))),
  };
  const outs = x_outs(roots);
  RV.outs = new Set(outs);
  file_book(outs);
  for (const [k, def] of done_defs(fun_runs)) {
    unit_emit(unit_new(k, () => rust_def(k, def)));
  }
  const funs = [...FL.units.values()].flatMap((u) => u.segs.flatMap((f) => f.lines));
  const decls: string[] = [];
  const done = new Set<Name>();
  for (let more = true; more;) {
    more = false;
    for (const k of [...RV.adts]) {
      if (!done.has(k)) {
        done.add(k);
        decls.push(...rust_adt(k));
        more = true;
      }
    }
  }
  const helpers: string[] = [];
  if (RV.adts.has("List")) {
    const L = r_cname("List");
    const [Nil, Con] = [r_vname("Nil"), r_vname("Con")];
    const [fh, ft] = r_fields("List", "Con").map(([f]) => f);
    const [of, to] = [r_mname("list_from"), r_mname("list_to_vec")];
    helpers.push(
      "/// A Vec as a Bend List.",
      `pub fn ${of}<A: Clone + 'static>(xs: Vec<A>) -> Rc<${L}<A>> {`,
      `  let mut out = Rc::new(${L}::${Nil} {});`,
      `  for x in xs.into_iter().rev() { out = Rc::new(${L}::${Con} { ${fh}: x, ${ft}: out }); }`,
      "  out",
      "}", "",
      "/// A Bend List as a Vec.",
      `pub fn ${to}<A: Clone + 'static>(xs: &Rc<${L}<A>>) -> Vec<A> {`,
      "  let (mut out, mut at) = (Vec::new(), xs);",
      `  while let ${L}::${Con} { ${fh}, ${ft} } = &**at { out.push(${fh}.clone()); at = ${ft}; }`,
      "  out",
      "}", "");
  }
  PROBES.length = 1;
  FL = null!;
  return [
    `// Generated by bendweave from Bend (bend ${X_BEND_VERSION}). Do not edit.`,
    `// Module ${module}; exported: ${outs.map(Bend.name_key).join(", ")}`,
    "#![allow(non_snake_case, non_camel_case_types, unused, unreachable_patterns,"
      + " unused_parens, unused_mut, unused_variables, unused_assignments, clippy::all)]",
    "",
    "use std::rc::Rc;",
    "use bendweave_rt::{self as rt, Any, Arr, Cmp, Fun, Nat, Str};",
    "",
    ...decls,
    ...helpers,
    ...funs,
  ].join("\n");
}
