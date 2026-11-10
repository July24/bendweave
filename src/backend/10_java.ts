// Java backend. Appended to upstream comp.ts (see tools/build.ts), so it uses
// comp.ts's own lowering: fun_of, loop_of, term_spine, mat_rows, mat_ctrs...
// It mirrors js_def/js_func/js_match/js_expr, adding Java types computed
// from the Bend types. Principle: what it cannot translate exactly it
// refuses (die), it never approximates.
import * as Bend from "../../vendor/bend/bend2/bend.ts";

// Java static type of an expression: a Java type text, or "?" (unknown:
// a use converts it with a cast).
type JT = string;
type JE = [string, JT];
type JScope = Scope & { jret: JT; jtv: string[]; jpc?: boolean; jps?: string[] };

let JV: {
  cls: string;
  tv: Map<number, string>;   // probe -> Java type variable
  ty: Map<number, JT>;       // probe -> Java type of the local it names
  lt: Map<string, JT>;       // local name -> Java type
  adts: Set<Name>;
  params: Map<Name, { i: number; name: string; ar: number }[]>;
  cnames: Map<Name, string>;
  mnames: Map<Name, string>;
  taken: Set<string>;
  adtNames: Set<string>;
  cur: Name | null;
  tvpos: Map<Name, Map<number, [Name, string]>>;
  outs: Set<Name>;
} = null!;

// a type variable: a probe, or (in an elaborated annotation) the current
// def's parameter by telescope position and name, as upstream facts_hot reads it
function j_tvar(t: Of<"Var">): string | undefined {
  const p = JV.cur ? JV.tvpos.get(JV.cur)?.get(t.i) : undefined;
  return p && p[0] === t.k ? p[1] : JV.tv.get(t.i);
}

const J_RESERVED = new Set(("abstract assert boolean break byte case catch char"
  + " class const continue default do double else enum extends final finally"
  + " float for goto if implements import instanceof int interface long native"
  + " new package private protected public return short static strictfp super"
  + " switch synchronized this throw throws transient try void volatile while"
  + " true false null var record yield sealed permits _ Object String Integer"
  + " Float Boolean BigInteger Fn Tuple Unit Cmp BArray BStr R BendPanic Math"
  + " StrictMath Long Character System Override").split(" "));

// a record component may not be named after an Object method
const J_FIELD_BAD = new Set("hashCode toString getClass clone finalize notify notifyAll wait equals".split(" "));

const J_NATIVE: Record<Name, [string, string]> = Object.setPrototypeOf({
  U32: ["int", "Integer"], F32: ["float", "Float"], Char: ["int", "Integer"],
  Nat: ["BigInteger", "BigInteger"], Bool: ["boolean", "Boolean"],
  String: ["BStr", "BStr"], Unit: ["Unit", "Unit"], Cmp: ["Cmp", "Cmp"],
}, null);

const J_BOX: Record<string, string> = { int: "Integer", float: "Float", boolean: "Boolean" };

function j_ident(k: string, bad = J_RESERVED): string {
  let s = name_clean(k);
  if (/^[0-9]/.test(s)) s = "_" + s;
  return bad.has(s) ? s + "_" : s;
}

function j_cname(k: Name): string {
  return memo(JV.cnames, k, () => {
    let id = j_ident(js_tag(k));
    while (JV.taken.has("c:" + id)) id += "_";
    JV.taken.add("c:" + id);
    return id;
  });
}

function j_mname(k: Name): string {
  return memo(JV.mnames, k, () => {
    let id = j_ident(k);
    while (JV.taken.has("m:" + id)) id += "_";
    JV.taken.add("m:" + id);
    return id;
  });
}

function j_tvname(k: Name, used: Set<string>): string {
  let id = j_ident(k.replace(/^[^A-Za-z]+/, "") || "T");
  while (used.has(id) || JV.adtNames.has(id)) id += "_";
  used.add(id);
  return id;
}

// -1: not a type parameter; else the number of arguments of a type family
function j_kind_arity(A: HTerm | null): number {
  let n = 0;
  let t = ty_wnf(A);
  while (t?.$ === "All") {
    t = ty_wnf(t.B(DUMMY));
    n++;
  }
  return t?.$ === "Typ" ? n : -1;
}

function j_adt_params(k: Name) {
  return memo(JV.params, k, () => {
    const tld = tld_of(k);
    if (tld?.$ !== "ADT") return [];
    const used = new Set<string>();
    const out: { i: number; name: string; ar: number }[] = [];
    tele_unbind(tld.T).doms.forEach(([, nm, A], i) => {
      const ar = j_kind_arity(A);
      if (ar >= 0) out.push({ i, name: j_tvname(nm, used), ar });
    });
    return out;
  });
}

function j_targs(t: Of<"ADT">): string[] {
  return j_adt_params(t.k).map((p) => {
    let a: HTerm | undefined = t.x[p.i];
    if (a === undefined) return "Object";
    for (let j = 0; j < p.ar; j++) a = Bend.App(a, DUMMY);
    return jt(a, true);
  });
}

function jt(T: HTerm | null, box = false): JT {
  const t = ty_wnf(T);
  if (!t) return "Object";
  switch (t.$) {
    case "ADT": {
      const nat = J_NATIVE[t.k];
      if (nat) return box ? nat[1] : nat[0];
      if (t.k === "Array") return `BArray<${jt(t.x[0], true)}>`;
      if (t.k === "Sigma") return `Tuple<${j_targs(t).join(", ")}>`;
      if (t.k === "IO" || t.k === "IO.OP") die("an IO type in pure Java output");
      if (t.k.startsWith("Word.")) die("a raw Word (the bits of a U32/F32) in Java output");
      JV.adts.add(t.k);
      const as = j_targs(t);
      return j_cname(t.k) + (as.length ? `<${as.join(", ")}>` : "");
    }
    case "All": {
      return t.q.$ === "None" ? jt(t.B(DUMMY), box)
        : `Fn<${jt(t.A, true)}, ${jt(t.B(DUMMY), true)}>`;
    }
    case "Var": {
      return j_tvar(t) ?? "Object";
    }
    case "App": {
      const h = term_force(Bend.term_unapply(t)[0]);
      return (h.$ === "Var" && j_tvar(h)) || "Object";
    }
    default:
      return "Object";
  }
}

// the arguments of a Java generic type text: "Fn<A, B<C>>" -> ["A", "B<C>"]
function j_args_of(t: JT): string[] {
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
    d += c === "<" ? 1 : c === ">" ? -1 : 0;
    s += c;
  }
  out.push(s.trim());
  return out;
}

// convert e (of Java type from) to Java type to
function j_conv(e: string, from: JT, to: JT): string {
  if (from === to || to === "Object" || to === "?") return e;
  if (J_BOX[from] === to) return e; // boxing is implicit
  if (J_BOX[to] === from) return `((${to}) ${e})`;
  if (J_BOX[to]) return `((${to}) (Object) (${e}))`;
  return `((${to}) (Object) (${e}))`;
}

function j_hold(sc: Scope, e: string, t: JT, k: string): string {
  const al = name_local(sc, k);
  file_push(sc, `final ${t === "?" ? "var" : t} ${al} = ${e};`);
  JV.lt.set(al, t);
  return al;
}

function j_bare(e: string): boolean {
  return FL.locals.has(e) || /^[\w.]+$/.test(e) || /^-?[0-9][\w.]*$/.test(e);
}

function j_str(s: string): string {
  let out = "\"";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c === 34 ? "\\\"" : c === 92 ? "\\\\" : c === 10 ? "\\n"
      : c === 13 ? "\\r" : c === 9 ? "\\t"
      : c >= 32 && c < 127 ? s[i] : "\\u" + c.toString(16).padStart(4, "0");
  }
  return out + "\"";
}

function j_u32(u: number): string {
  return u >= 2 ** 31 ? "0x" + u.toString(16).toUpperCase() : String(u);
}

function j_f32(u: number): string {
  const v = Bend.f32_from_bits(u);
  if (Number.isNaN(v)) return `Float.intBitsToFloat(${j_u32(u)})`;
  if (v === Infinity) return "Float.POSITIVE_INFINITY";
  if (v === -Infinity) return "Float.NEGATIVE_INFINITY";
  if (Object.is(v, -0)) return "-0.0f";
  return String(v) + "f";
}

function j_nat(n: number): string {
  return n === 0 ? "BigInteger.ZERO" : n === 1 ? "BigInteger.ONE"
    : n === 2 ? "BigInteger.TWO" : n === 10 ? "BigInteger.TEN"
    : `BigInteger.valueOf(${n}L)`;
}

// Native datatypes: builder, test and field readers, as JS's OPTIMIZED.
const J_OPT: Record<Name, Record<Name, { intr: string; cond?: string; elim?: string[] }>> =
  Object.setPrototypeOf({
    Bool: { False: { intr: "false", cond: "!$0" }, True: { intr: "true", cond: "$0" } },
    Unit: { Unit: { intr: "Unit.UNIT", cond: "true" } },
    Cmp: {
      LT: { intr: "Cmp.LT", cond: "$0 == Cmp.LT" },
      EQ: { intr: "Cmp.EQ", cond: "$0 == Cmp.EQ" },
      GT: { intr: "Cmp.GT", cond: "$0 == Cmp.GT" },
    },
    Sigma: { Tuple: { intr: "new Tuple<$T>($0, $1)", cond: "true", elim: ["$0.fst()", "$0.snd()"] } },
    Char: { Chr: { intr: "$0", cond: "true", elim: ["$0"] } },
    String: {
      SNil: { intr: "BStr.EMPTY", cond: "$0.isEmpty()" },
      SCon: { intr: "BStr.cons($0, $1)", cond: "!$0.isEmpty()", elim: ["$0.head()", "$0.tail()"] },
    },
    Array: {
      ALeaf: { intr: "BArray.leaf($0)", cond: "$0.size() == 1", elim: ["$0.get(0)"] },
      ANode: { intr: "BArray.node($0, $1)", cond: "$0.size() != 1", elim: ["$0.lo()", "$0.hi()"] },
    },
  }, null);

// Intrinsics: every operation the JS lane runs natively. Operands arrive
// converted to the operation's Bend parameter types (int, float, ...).
const J_CMPS: Record<string, string> = { is_eq: "==", is_ne: "!=", is_lt: "<", is_le: "<=", is_gt: ">", is_ge: ">=" };
const J_OPS: Record<string, string> = Object.setPrototypeOf({
  u32_add: "($0 + $1)", u32_sub: "($0 - $1)", u32_mul: "($0 * $1)",
  u32_and: "($0 & $1)", u32_or: "($0 | $1)", u32_xor: "($0 ^ $1)",
  u32_is_eq: "($0 == $1)", u32_is_ne: "($0 != $1)",
  u32_is_lt: "(Integer.compareUnsigned($0, $1) < 0)", u32_is_le: "(Integer.compareUnsigned($0, $1) <= 0)",
  u32_is_gt: "(Integer.compareUnsigned($0, $1) > 0)", u32_is_ge: "(Integer.compareUnsigned($0, $1) >= 0)",
  u32_div: "R.u32Div($0, $1)", u32_mod: "R.u32Mod($0, $1)",
  u32_inc: "($0 + 1)", u32_shl: "($0 << 1)", u32_shr: "($0 >>> 1)",
  u32_shln: "R.u32Shln($0, $1)", u32_shrn: "R.u32Shrn($0, $1)",
  u32_not: "(~$0)", u32_is_zero: "($0 == 0)", u32_cmp: "R.u32Cmp($0, $1)",
  u32_to_f32: "R.u32ToF32($0)", f32_from_nat: "$0.floatValue()",
  u32_to_nat: "R.u32ToNat($0)", u32_from_nat: "$0.intValue()",
  f32_add: "($0 + $1)", f32_sub: "($0 - $1)", f32_mul: "($0 * $1)", f32_div: "($0 / $1)",
  f32_neg: "(-$0)",
  ...Object.fromEntries(Object.entries(J_CMPS).map(([k, o]) => ["f32_" + k, `($0 ${o} $1)`])),
  ...Object.fromEntries(("sqrt exp log log2 log10 sin cos tan asin acos atan sinh cosh tanh"
    + " floor ceil trunc abs").split(" ").map((k) => ["f32_" + k, `R.f32_${k}($0)`])),
  f32_atan2: "R.f32_atan2($0, $1)", f32_pow: "R.f32_pow($0, $1)", f32_mod: "($0 % $1)",
  f32_to_u32: "R.f32ToU32($0)", f32_bits: "Float.floatToRawIntBits($0)",
  f32_show: "BStr.of(R.f32Show($0))",
  f32_read: "R.opt(R.f32Read($0.toString()), () -> new $M.None<Float>(), (Float v) -> new $M.Some<Float>(v))",
  nat_add: "$0.add($1)", nat_double: "$0.shiftLeft(1)", nat_mul: "$0.multiply($1)",
  nat_cmp: "R.cmp($0.compareTo($1))", nat_sub: "R.natSub($0, $1)",
  nat_is_lt: "($0.compareTo($1) < 0)", nat_min: "$0.min($1)", nat_max: "$0.max($1)",
  nat_divmod: "R.natDivmod($0, $1)",
  bool_or: "($0 || $1)", bool_xor: "($0 != $1)",
  string_append: "BStr.append($0, $1)", string_contains: "BStr.contains($0, $1)",
  string_length: "$0.length()",
  array_new: "BArray.make($0, $1)", array_set: "$0.set($1, $2)", array_get: "$0.getT($1)",
  array_get_unchecked: "$0.getT($1)", array_swap: "$0.swap($1, $2)", array_size: "$0.sizeT()",
  array_clone: "$0.cloneT()",
}, null);

// The Java types a call of k on all (every argument, erased ones included)
// has: the callee's declared parameter and result types with its type
// variables substituted, and the explicit type arguments.
function j_subst(t: JT, m: Map<string, JT>): JT {
  return m.size === 0 ? t : t.replace(/[A-Za-z_$][\w$]*/g, (w) => m.get(w) ?? w);
}

function j_inst(k: Name, all: HTerm[]): { ps: JT[]; ret: JT; targs: JT[] } {
  const tld = tld_of(k) as Bend.Def;
  const sig = java_sig(k);
  const targs: JT[] = [];
  let tel: HTerm = tld.T;
  const n = fun_of(k).n;
  for (let i = 0; i < n; i++) {
    const a = Bend.tele_open(FL.book, tel);
    if (a === null) break;
    const x = all[i] ?? DUMMY;
    if (a.q.$ === "None") {
      const ar = j_kind_arity(a.A);
      if (ar >= 0) {
        let y: HTerm = x;
        for (let j = 0; j < ar; j++) y = Bend.App(y, DUMMY);
        targs.push(jt(y, true));
      }
    }
    tel = a.B(x);
  }
  const m = new Map(sig.tps.map((t, i) => [t, targs[i] ?? "Object"]));
  return { ps: sig.params.map(([, T]) => j_subst(T, m)), ret: j_subst(sig.ret, m), targs };
}

// a constructor's declared fields: [Java name, Java type over the datatype's type variables]
const J_FIELDS = new Map<Name, [string, JT][]>();
function j_fields(adtk: Name, ck: Name): [string, JT][] {
  return memo(J_FIELDS, ck, () => {
    const tld = tld_of(adtk) as Bend.ADT;
    const ps = j_adt_params(adtk);
    const nparams = tele_unbind(tld.T).doms.length;
    const c = FL.book.ctrs[ck];
    const fields: [string, JT][] = [];
    let tel: HTerm = c.T;
    let i = 0;
    for (let a = Bend.tele_open(FL.book, tel); a; a = Bend.tele_open(FL.book, tel), i++) {
      const p = probe(a.k);
      if (i < nparams) {
        const jp = ps.find((q) => q.i === i);
        if (jp) JV.tv.set(p.i, jp.name);
      } else if (a.q.$ !== "None") {
        fields.push([j_ident(a.k, J_FIELD_BAD.has(a.k) ? new Set([a.k]) : J_RESERVED), jt(a.A)]);
      }
      tel = a.B(p);
    }
    return fields;
  });
}

function j_fields_at(adt: Of<"ADT">, ck: Name): [string, JT][] {
  const ps = j_adt_params(adt.k);
  const full = adt.x.length > 0 || ps.length === 0;
  const m = new Map(ps.map((p, i) => [p.name, full ? j_targs(adt)[i] : "Object"]));
  return j_fields(adt.k, ck).map(([f, T]) => [f, j_subst(T, m)]);
}

function java_call(sc: JScope, k: Name, args: HTerm[], all: HTerm[], tail = false): JE {
  const tld = tld_of(k);
  if (tld?.$ === "ADT") {
    return ["null", "Object"];
  }
  if (k === CLO_APPLY) {
    const [[f, ft], [x, xt]] = args.map((a) => java_expr(sc, a));
    const fn = ft.startsWith("Fn<") ? ft : "Fn<Object, Object>";
    const [A, B] = j_args_of(fn);
    return [`${j_conv(f, ft, fn)}.apply(${j_conv(x, xt, A)})`, B];
  }
  const intr = intr_of(k, true);
  if (intr) {
    const op = op_name(k);
    let t = J_OPS[op];
    if (t === undefined) {
      die("no Java intrinsic for " + Bend.name_key(k));
    }
    const sig = j_inst(k, all);
    const xs = args.map((a, i) => {
      const [e, et] = java_expr(sc, a);
      return j_conv(e, et, sig.ps[i] ?? et);
    });
    if (t.includes("$M")) {
      JV.adts.add("Maybe");
      t = t.replaceAll("$M", j_cname("Maybe"));
    }
    return [tpl(t, xs), sig.ret];
  }
  if (!fun_runs(tld)) {
    die("a live call into the law " + Bend.name_key(k));
  }
  if (def_foreign(tld)) {
    die("a foreign (effect) def in pure Java output: " + Bend.name_key(k));
  }
  const sig = j_inst(k, all);
  const xs = args.map((a, i) => {
    const [e, et] = java_expr(sc, a);
    return j_conv(e, et, sig.ps[i] ?? et);
  });
  const ta = sig.targs.length ? `${JV.cls}.<${sig.targs.join(", ")}>` : "";
  return [`${ta}${j_mname(k)}(${xs.join(", ")})`, sig.ret];
}

function java_open(sc: JScope, x: Of<"Let">): HTerm {
  const o = term_open(x);
  let_live(x).forEach((on, j) => {
    const p = o.ps[j];
    if (!on) {
      FL.names.set(p.i, "null");
      JV.ty.set(p.i, "Object");
      return;
    }
    const [e, et] = java_expr(sc, x.v[j]);
    const al = j_hold(sc, e, et, x.k[j]);
    FL.names.set(p.i, al);
    JV.ty.set(p.i, et);
  });
  return o.b;
}

function java_expr(sc: JScope, tm: HTerm, ty0: HTerm | null = null): JE {
  const [x, ty] = ty_peel(tm, ty0);
  switch (x.$) {
    case "Var": {
      const n = FL.names.get(x.i);
      if (n === undefined) die("an unbound variable " + x.k);
      return [n, JV.ty.get(x.i) ?? JV.lt.get(n) ?? "?"];
    }
    case "Ref":
    case "App": {
      const m = term_spine(x);
      if (m.k !== null) {
        return java_call(sc, m.k, m.xs, m.all);
      }
      const y = call_eta(x) ?? (m.t.$ !== "Ref" ? m.h : null);
      if (y !== null) {
        return java_expr(sc, y, ty);
      }
      return java_call(sc, m.t.k, intr_of(m.t.k)?.C === null ? [...m.args,
        Bend.Lit("U32", lay_arr(lay_el(m.all[0])).lgs)] : m.args, m.all);
    }
    case "Ctr": {
      const [adt, u] = ctr_adt(x, ty);
      if (u !== null) {
        return adt.k === "F32" ? [j_f32(u), "float"] : [j_u32(u), "int"];
      }
      if (adt.k === "Char" && term_const(x)) {
        return [j_u32(Bend.u32_from_term((Bend.term_strip(x) as Of<"Ctr">).x[0])!), "int"];
      }
      if (adt.k === "String" && term_const(x)) {
        const cs = r_codes(x);
        return [cs.length === 0 ? "BStr.EMPTY"
          : cs.every((c) => c < 0xD800 || (c >= 0xE000 && c <= 0x10FFFF))
          ? `BStr.of(${j_str(String.fromCodePoint(...cs))})`
          : `BStr.ofCodes(${cs.map(j_u32).join(", ")})`, "BStr"];
      }
      if (adt.k === "Nat") {
        const [b, n] = nat_peel(x);
        if (b === null) return [j_nat(n), "BigInteger"];
        const [e, et] = java_expr(sc, b, adt);
        return [`${j_conv(e, et, "BigInteger")}.add(${j_nat(n)})`, "BigInteger"];
      }
      if (adt.k === "U32" || adt.k === "F32") {
        die("a " + adt.k + " built from its raw bits (a non-constant Word)");
      }
      const ctr = FL.book.ctrs[x.k];
      const native = J_OPT[adt.k];
      const full = adt.x.length > 0 || j_adt_params(adt.k).length === 0;
      const fts = native ? (full ? ctr_live(ctr, adt.x).map(([, , A]) => jt(A)) : [])
        : full ? j_fields_at(adt, x.k).map(([, T]) => T) : [];
      const exprs = ctr_flds(x).map((f, j) => {
        const [e, et] = java_expr(sc, f);
        return fts[j] ? j_conv(e, et, fts[j]) : e;
      });
      const T = full ? jt(adt) : "?";
      if (native) {
        const tas = full ? j_args_of(T).join(", ") : "";
        return [tpl(native[x.k].intr.replace("$T", tas), exprs), T];
      }
      const C = j_cname(adt.k);
      JV.adts.add(adt.k);
      const tas = full ? (T.includes("<") ? T.slice(T.indexOf("<")) : "") : "<>";
      return [`new ${C}.${j_ctrname(adt.k, x.k)}${j_adt_params(adt.k).length ? tas : ""}(${exprs.join(", ")})`, T];
    }
    case "Let": {
      return java_expr(sc, java_open(sc, x), ty);
    }
    case "Lam":
    case "Mat":
    case "Efq": {
      if (x.$ === "Lam" && !fun_live(x, ty)) {
        const o = term_open(x);
        FL.names.set(o.ps[0].i, "null");
        JV.ty.set(o.ps[0].i, "Object");
        return java_expr(sc, o.b, ty_all(ty).B(DUMMY));
      }
      if (ty === null) die("a closure with no type");
      const all = ty_all(ty);
      const A = jt(all.A, true);
      const B = jt(all.B(DUMMY), true);
      const arg = name_local(sc, "x");
      JV.lt.set(arg, A);
      const seg = seg_new("", BOX, []);
      seg.tab = sc.seg.tab + 1;
      const cl: JScope = { ...sc, seg, jret: B, jtv: [] };
      java_func(cl, x, ty, [[arg, A]]);
      const pad = "  ".repeat(sc.seg.tab);
      const T = `Fn<${A}, ${B}>`;
      return [`((${T}) (${arg}) -> {\n${seg.lines.join("\n")}\n${pad}})`, T];
    }
    case "Lit": {
      die("an unexpected literal " + x.k);
    }
    default: {
      // types, equalities and proofs as values: erased, nothing to hold
      return ["null", "Object"];
    }
  }
}

function java_func(sc: JScope, tm: HTerm, ty0: HTerm | null, args: JE[]): void {
  const [x, ty] = ty_peel(tm, ty0);
  if (args.length === 0 && fun_live(x, ty)) {
    const [e, et] = java_expr(sc, x, ty);
    return file_push(sc, `return ${j_conv(e, et, sc.jret)};`);
  }
  if (x.$ === "Lam") {
    const all = ty_all(ty);
    const { ps: [v], b } = term_open(x);
    if (all.q.$ === "None") {
      if (j_kind_arity(all.A) >= 0) {
        JV.tv.set(v.i, sc.jtv.shift() ?? "Object");
      }
      FL.names.set(v.i, "null");
      JV.ty.set(v.i, "Object");
      return java_func(sc, b, all.B(v), args);
    }
    const [[e, et], ...rest] = args;
    let k = e;
    if (!FL.locals.has(e) && rest_use([b], v) > 0) {
      k = j_hold(sc, e, et, x.k);
    }
    FL.names.set(v.i, k);
    JV.ty.set(v.i, et);
    return java_func(sc, b, all.B(v), rest);
  }
  if (mat_head(x)) {
    return java_match(sc, x, ty, args);
  }
  if (x.$ === "Let" || args.length > 0) {
    return java_func(sc, x.$ === "Let" ? java_open(sc, x) : term_eta(x, ty!, 1), ty, args);
  }
  const ck = term_spine(x);
  const loop = loop_of(sc.seg.def);
  const at = loop.indexOf(ck.k ?? "");
  if (at >= 0) {
    // a self loop keeps typed parameters; a tail cycle's are Object
    const to = sc.jpc ? null : java_sig(ck.k!).params;
    const vals = ck.xs.map((a, i) => {
      const [e, et] = java_expr(sc, a);
      return to ? j_conv(e, et, to[i][1]) : e;
    });
    // every new value first: one may read a parameter another overwrites
    const tmp = vals.map((v, i) => j_bare(v) ? v : j_hold(sc, v, to ? to[i][1] : "Object", "n"));
    return file_push(sc, ...tmp.map((v, i) => `${sc.jpc ? "$" + i : sc.jps![i]} = ${v};`),
      ...sc.jpc ? [`$pc = ${at};`] : [], "continue;");
  }
  const [e, et] = ck.k === null ? java_expr(sc, x, ty) : java_call(sc, ck.k, ck.xs, ck.all, true);
  file_push(sc, `return ${j_conv(e, et, sc.jret)};`);
}

function j_ctrname(adtk: Name, k: Name): string {
  const C = j_cname(adtk);
  let n = j_ident(js_tag(k));
  if (n === C) n += "_";
  return n;
}

function java_match(sc: JScope, x: HTerm, ty: HTerm | null, args: JE[]): void {
  if (x.$ === "Efq") {
    return file_push(sc, "throw R.absurd();");
  }
  const [s0, st] = args[0];
  const self = probe("s");
  const { adt, rows } = mat_rows(sc, x, ty, self);
  const want = jt(adt);
  const s = FL.locals.has(s0) && st === want ? s0 : j_hold(sc, j_conv(s0, st, want), want, "t");
  // an arm that rebuilds the scrutinee reads it back (arm_self)
  FL.names.set(self.i, s);
  JV.ty.set(self.i, want);
  type Arm = [string, HTerm, JE[]];
  let lv: Arm[];
  if (rows !== null) {
    if (adt.k === "Nat") {
      lv = rows.map(([a, b, v, f]): Arm => [b >= 32 ? `${s}.equals(${j_nat(v)})` : "true", a,
        f > 0 ? [[v === 0 ? s : `${s}.subtract(${j_nat(v)})`, "BigInteger"]] : []]);
    } else {
      const bits = adt.k === "F32" ? `Float.floatToRawIntBits(${s})` : s;
      lv = rows.map(([a, b, v, f]): Arm => {
        if (f > 0) die("a match binding the raw bits of a " + adt.k);
        return [b >= 32 ? `${bits} == ${j_u32(v)}`
          : `(${bits} & ${j_u32(2 ** b - 1)}) == ${j_u32(v)}`, a, []];
      });
    }
  } else {
    const native = J_OPT[adt.k];
    lv = mat_ctrs(x, adt).map(([k, h]): Arm => {
      if (k === "_") die("an IO.OP match in Java output");
      if (k === "") return ["true", h, [[s, want]]];
      const ctr = FL.book.ctrs[k];
      const fts = ctr_live(ctr, adt.x).map(([, , A]) => jt(A));
      if (native) {
        const n = native[k];
        if (!n) die("a native constructor with no Java form: " + k);
        return [tpl(n.cond ?? "true", [s]), h, (n.elim ?? []).map((e, j): JE => [tpl(e, [s]), fts[j] ?? "?"])];
      }
      const C = j_cname(adt.k);
      const cn = j_ctrname(adt.k, k);
      const tas = want.includes("<") ? want.slice(want.indexOf("<")) : "";
      const cast = `((${C}.${cn}${tas}) ${s})`;
      return [`${s} instanceof ${C}.${cn}`, h, j_fields_at(adt, k).map(([f, T]): JE =>
        [`${cast}.${f}()`, T])];
    });
  }
  emit_chain(sc, lv.map(([c, h, fs]) => [c, () =>
    java_func(sc, h, null, [...fs, ...args.slice(1)])]));
}

// a def's Java signature: type variables, live parameters, result
const J_SIGS = new Map<Name, { tps: string[]; params: [string, JT][]; ret: JT }>();
function java_sig(k: Name) {
  return memo(J_SIGS, k, () => {
    const tld = tld_of(k) as Bend.Def;
    const used = new Set<string>();
    const tps: string[] = [];
    const params: [string, JT][] = [];
    let tel: HTerm = tld.T;
    const n = fun_of(k).n;
    const pos = new Map<number, [Name, string]>();
    JV.tvpos.set(k, pos);
    for (let i = 0; i < n; i++) {
      const a = Bend.tele_open(FL.book, tel)!;
      const p = probe(a.k);
      if (a.q.$ === "None") {
        if (j_kind_arity(a.A) >= 0) {
          const nm = j_tvname(a.k, used);
          JV.tv.set(p.i, nm);
          pos.set(i, [a.k, nm]);
          tps.push(nm);
        }
      } else {
        params.push([a.k, jt(a.A)]);
      }
      tel = a.B(p);
    }
    return { tps, params, ret: jt(tel) };
  });
}

function java_def(k: Name, def: Bend.Def): void {
  if (intr_of(k, true)) {
    return;
  }
  if (def_foreign(def)) {
    die("a foreign (effect) def in pure Java output: " + Bend.name_key(k));
  }
  const sc = scope_new() as JScope;
  sc.seg.def = k;
  sc.seg.tab = 1;
  JV.cur = k;
  FL.unit!.segs.push(sc.seg);
  const { h } = fun_of(k);
  const sig = java_sig(k);
  sc.jret = sig.ret;
  const loop = loop_of(k);
  const pc = loop.length > 1;
  if (sig.params.length > 254) {
    die("a def with more than 254 live parameters (the JVM's limit): " + Bend.name_key(k));
  }
  if (pc && loop.some((d) => d !== k && java_sig(d).tps.length > 0)) {
    die("a generic def in a tail cycle across defs: " + loop.map(Bend.name_key).join(", "));
  }
  // a parameter keeps its Bend name where that is a plain, unique Java name
  const plain = sig.params.map(([x]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(x) && !J_RESERVED.has(x) ? x : null);
  const params = sig.params.map(([x], i) => plain[i] !== null && plain.indexOf(plain[i]) === plain.lastIndexOf(plain[i])
    ? plain[i]! : pc ? "a" + i : loop.length > 0 ? "$" + i : name_local(sc, x));
  params.forEach((p, i) => {
    JV.lt.set(p, sig.params[i][1]);
    if (loop.length === 0) FL.locals.set(p, sig.params[i][0]);
  });
  sc.jps = params;
  const tps = sig.tps.length ? `<${sig.tps.join(", ")}> ` : "";
  block(sc, `${JV.outs.has(k) ? "public" : "private"} static ${tps}${sig.ret} ${j_mname(k)}(${params.map((p, i) =>
    `${sig.params[i][1]} ${p}`).join(", ")}) {`, () => {
    if (loop.length === 0) {
      sc.jtv = [...sig.tps];
      return java_func(sc, h!, def.T, params.map((p, i) => [p, sig.params[i][1]]));
    }
    if (!pc) {
      return block(sc, "for (;;) {", () => {
        const fx: JScope = { ...sc, fresh: new Map(), fuel: { n: FOLD_FUEL }, jtv: [...sig.tps] };
        const ps = sig.params.map(([x], j) => j_hold(fx, params[j], sig.params[j][1], x));
        java_func(fx, h!, def.T, ps.map((p, i) => [p, sig.params[i][1]]));
      });
    }
    const width = Math.max(...loop.map((d) => java_sig(d).params.length));
    for (let i = 0; i < width; i++) {
      file_push(sc, `Object $${i} = ${i < params.length ? params[i] : "null"};`);
    }
    file_push(sc, `int $pc = ${loop.indexOf(k)};`);
    block(sc, "for (;;) switch ($pc) {", () => {
      loop.forEach((d, i) => {
        const ds = java_sig(d);
        const fx: JScope = { ...sc, fresh: new Map(), fuel: { n: FOLD_FUEL },
          jtv: d === k ? [...sig.tps] : [], jpc: true };
        block(fx, `case ${i}: {`, () => {
          JV.cur = d;
          const ps = ds.params.map(([x, T], j) => j_hold(fx, j_conv("$" + j, "Object", T), T, x));
          java_func(fx, fun_of(d).h!, tld_of(d).T, ps.map((p, j) => [p, ds.params[j][1]]));
        });
      });
      JV.cur = k;
      file_push(sc, "default: throw R.absurd();");
    });
  });
  file_push(sc, "");
}

function java_adt(k: Name): string[] {
  const tld = tld_of(k) as Bend.ADT;
  const C = j_cname(k);
  const ps = j_adt_params(k);
  const gen = ps.length ? `<${ps.map((p) => p.name).join(", ")}>` : "";
  const nparams = tele_unbind(tld.T).doms.length;
  const recs = tld.c.map((c) => {
    const fields = j_fields(k, c.k).map(([f, T]) => `${T} ${f}`);
    return `    record ${j_ctrname(k, c.k)}${gen}(${fields.join(", ")}) implements ${C}${gen} {}`;
  });
  if (recs.length === 0) {
    return [`  public interface ${C}${gen} {}`, ""];
  }
  return [`  public sealed interface ${C}${gen} permits ${tld.c.map((c) =>
    `${C}.${j_ctrname(k, c.k)}`).join(", ")} {`, ...recs, "  }", ""];
}

// roots: the defs to export (every pure non-Base def when null)
export function java_lib(book: Bend.Book, pkg: string, cls: string, roots: Name[] | null = null): string {
  FL = file_new(book, true);
  J_SIGS.clear();
  J_FIELDS.clear();
  JV = {
    cls, tv: new Map(), ty: new Map(), lt: new Map(), adts: new Set(), params: new Map(),
    cnames: new Map(), mnames: new Map(), taken: new Set(), cur: null, tvpos: new Map(), outs: new Set(),
    adtNames: new Set(Object.entries(book.tlds).filter(([, t]) => t.$ === "ADT").map(([k]) => j_ident(js_tag(k)))),
  };
  const outs = x_outs(roots);
  JV.outs = new Set(outs);
  file_book(outs);
  for (const [k, def] of done_defs(fun_runs)) {
    unit_emit(unit_new(k, () => java_def(k, def)));
  }
  const funs = [...FL.units.values()].flatMap((u) => u.segs.flatMap((f) => f.lines));
  const decls: string[] = [];
  const done = new Set<Name>();
  for (let more = true; more;) {
    more = false;
    for (const k of [...JV.adts]) {
      if (!done.has(k)) {
        done.add(k);
        decls.push(...java_adt(k));
        more = true;
      }
    }
  }
  const helpers: string[] = [];
  if (JV.adts.has("List")) {
    const L = j_cname("List");
    const [Nil, Con] = [j_ctrname("List", "Nil"), j_ctrname("List", "Con")];
    const [fh, ft] = j_fields("List", "Con").map(([f]) => f);
    const [of, to] = [j_mname("listOf"), j_mname("toJavaList")];
    helpers.push(
      `  /** A java.util.List as a Bend List. */`,
      `  public static <A> ${L}<A> ${of}(java.util.List<? extends A> xs) {`,
      `    ${L}<A> out = new ${L}.${Nil}<A>();`,
      `    for (int i = xs.size() - 1; i >= 0; i--) out = new ${L}.${Con}<A>(xs.get(i), out);`,
      `    return out;`,
      `  }`, "",
      `  /** A Bend List as a java.util.List. */`,
      `  public static <A> java.util.List<A> ${to}(${L}<A> xs) {`,
      `    java.util.ArrayList<A> out = new java.util.ArrayList<>();`,
      `    for (; xs instanceof ${L}.${Con}<A> c; xs = c.${ft}()) out.add(c.${fh}());`,
      `    return out;`,
      `  }`, "");
  }
  PROBES.length = 1;
  FL = null!;
  return [
    `// Generated by bendweave from Bend (bend ${X_BEND_VERSION}). Do not edit.`,
    `// Exported: ${outs.map(Bend.name_key).join(", ")}`,
    `package ${pkg};`,
    "",
    "import java.math.BigInteger;",
    "import bendweave.rt.*;",
    "",
    `@SuppressWarnings({"unchecked", "rawtypes", "unused"})`,
    `public final class ${cls} {`,
    `  private ${cls}() {}`,
    "",
    ...decls,
    ...helpers,
    ...funs,
    "}",
    "",
  ].join("\n");
}
