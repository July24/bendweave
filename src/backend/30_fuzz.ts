// Test-case generation. Appended to upstream comp.ts (see tools/build.ts).
// For each def (or law) of a book it builds a copy of the book whose main
// applies the def to random values of its parameter types, so a harness can
// print that main with Bend's JS lane and with generated Java / Rust.
import * as Bend from "../../vendor/bend/bend2/bend.ts";

export type XCase = { name: string; kind: "def" | "law"; twin?: string; book: Bend.Book };

function x_rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const X_U32 = [0, 1, 2, 3, 7, 9, 10, 31, 32, 33, 127, 128, 255, 256, 65535, 65536,
  2 ** 31 - 1, 2 ** 31, 2 ** 31 + 1, 2 ** 32 - 2, 2 ** 32 - 1];
const X_F32 = [0, -0, 1, -1, 0.5, 0.1, 0.2, 1 / 3, 2.5, -2.5, 1.5, 3.5, 100, 16777216, 16777217,
  1e-7, 1e21, 1.5e22, 123456.79, 3.4028235e38, 1e-45, 1e-38, 4294967296, 4e9, -3,
  Infinity, -Infinity, NaN, Math.PI, Math.E];
const X_CHARS = "abcxyzABZ019 _-+,.:;!?()[]{}\"'\\\n\té世😀";

// A value's size is bounded: a type indexed by a value (a tree of depth d)
// may ask for one exponential in it; x_gen then gives up on that point.
let X_BUDGET = 0;

function x_gen(T: HTerm, depth: number, r: () => number): HTerm | null {
  if (--X_BUDGET < 0) return null;
  const t = ty_wnf(T);
  if (t?.$ !== "ADT") return null;
  const pick = <A>(xs: A[]) => xs[Math.floor(r() * xs.length)];
  const u32 = () => {
    const p = r();
    return p < 0.4 ? pick(X_U32) : p < 0.8 ? Math.floor(r() * 100) : Math.floor(r() * 2 ** 32);
  };
  switch (t.k) {
    case "U32": return Bend.Ann(Bend.Lit("U32", u32()), t);
    case "F32": {
      const p = r();
      const v = p < 0.5 ? pick(X_F32) : p < 0.8 ? (r() - 0.5) * 200 : (r() - 0.5) * 10 ** Math.floor(r() * 60 - 30);
      return Bend.Ann(Bend.Lit("F32", Bend.f32_to_bits(Math.fround(v))), t);
    }
    case "Nat": {
      const p = r();
      return Bend.Ann(Bend.Lit("Nat", p < 0.7 ? Math.floor(r() * 12) : Math.floor(r() * 200)), t);
    }
    case "Char": {
      const c = r() < 0.9 ? pick([...X_CHARS]).codePointAt(0)! : u32();
      return Bend.Ann(Bend.Ctr("Chr", [Bend.Lit("U32", c)]), t);
    }
    case "String": {
      const n = Math.floor(r() * r() * 12);
      let s = "";
      for (let i = 0; i < n; i++) s += r() < 0.3 ? pick([..."0123456789"]) : pick([...X_CHARS]);
      return Bend.Ann(Bend.Lit("String", s), t);
    }
    case "Array": case "IO": case "IO.OP": return null;
  }
  if (t.k.startsWith("Word.")) return null;
  const tld = tld_of(t.k);
  if (tld?.$ !== "ADT" || tld.c.length === 0) return null;
  // out of depth: the constructors with the fewest fields first
  const cs = depth > 0 ? [pick(tld.c), ...tld.c] : [...tld.c].sort((a, b) => a.n - b.n);
  for (const c of cs) {
    let tel: HTerm;
    try {
      tel = tele_fill(c.T, t.x);
    } catch {
      return null;
    }
    const xs: HTerm[] = [];
    let ok = true;
    for (let a = Bend.tele_open(FL.book, tel); a; a = Bend.tele_open(FL.book, tel)) {
      const v = a.q.$ === "None" ? null : x_gen(a.A, depth - 1, r);
      if (v === null) {
        ok = false;
        break;
      }
      xs.push(v);
      tel = a.B(v);
    }
    if (ok) return Bend.Ann(Bend.Ctr(c.k, xs), t);
  }
  return null;
}

function x_tkey(T: HTerm): string {
  return Bend.term_key(Bend.term_lower(Bend.term_wnf(FL.book, T)));
}

function x_list(T: HTerm, xs: HTerm[]): [HTerm, HTerm] {
  const L = Bend.ADT("List", [Bend.Qua(Bend.Lone()), T]) as HTerm;
  const v = xs.reduceRight((t: HTerm, x) => Bend.Ann(Bend.Ctr("Con", [x, t]), L),
    Bend.Ann(Bend.Ctr("Nil", []), L));
  return [L, v];
}

function x_with_main(book: Bend.Book, T: HTerm, v: HTerm): Bend.Book {
  const main: Bend.Def = { $: "Def", n: 0, x: 0, T, v, e: Bend.term_lower(v) };
  return { ...book, order: [...book.order.filter((k) => k !== "main"), "main"],
    tlds: Object.assign(Object.create(null), book.tlds, { main }),
    ctrs: Object.assign(Object.create(null), book.ctrs),
    tmps: Object.assign(Object.create(null), ...Object.entries(book.tmps).map(
      ([k, m]) => ({ [k]: new Map(m) }))) };
}

// n random calls per def; a law's two sides at n random points
export function x_fuzz(book: Bend.Book, n: number, seed: number, only: RegExp | null = null): XCase[] {
  FL = file_new(book, true);
  const bad = x_tainted(book);
  const out: XCase[] = [];
  for (const k of new Set(book.order)) {
    const t = book.tlds[k];
    if (t?.$ !== "Def" || t.b || t.x !== 0 || bad.has(k) || k === "main") continue;
    if (only && !only.test(Bend.name_key(k))) continue;
    if (process.env.BW_TRACE) console.error("fuzz", k);
    const r = x_rng(seed ^ [...k].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) | 0, 7));
    try {
      if (t.l === true) {
        const ls: HTerm[] = [], rs: HTerm[] = [];
        let T: HTerm | null = null;
        let TK: string | null = null;
        for (let i = 0; i < n; i++) {
          let tel: HTerm = t.T;
          let ok = true;
          X_BUDGET = 400;
          for (let a = Bend.tele_open(book, tel); a; a = Bend.tele_open(book, tel)) {
            const v = x_gen(a.A, 3, r);
            if (v === null) {
              ok = false;
              break;
            }
            tel = a.B(v);
          }
          if (!ok) continue;
          const e = ty_wnf(tel);
          if (e?.$ !== "Eql") break;
          // a dependent statement: keep the points of one result type
          const key = x_tkey(e.T);
          TK ??= key;
          if (key !== TK) continue;
          T ??= e.T;
          ls.push(Bend.Ann(e.a, e.T));
          rs.push(Bend.Ann(e.b, e.T));
          if (Bend.tele_open(book, t.T) === null) break; // no binder: one point
        }
        if (T !== null && ls.length > 0) {
          const [name, key] = ["law " + Bend.name_key(k), "law:" + k];
          out.push({ name: name + " (lhs)", kind: "law", twin: key, book: x_with_main(book, ...x_list(T, ls)) });
          out.push({ name: name + " (rhs)", kind: "law", twin: key, book: x_with_main(book, ...x_list(T, rs)) });
        }
        continue;
      }
      if (!done_live(t) || io_base(book, t.T) !== null || !x_computes(t)) continue;
      const calls: HTerm[] = [];
      let R: HTerm | null = null;
      let RK: string | null = null;
      for (let i = 0; i < n; i++) {
        let tel: HTerm = t.T;
        let f: HTerm = Bend.Ref(k);
        let ok = true;
        X_BUDGET = 400;
        for (let a = Bend.tele_open(book, tel); a; a = Bend.tele_open(book, tel)) {
          const v = a.q.$ === "None" ? null : x_gen(a.A, 3, r);
          if (v === null) {
            ok = false;
            break;
          }
          f = Bend.App(f, v);
          tel = a.B(v);
        }
        if (!ok) continue;
        const key = x_tkey(tel);
        RK ??= key;
        if (key !== RK) continue;
        R ??= tel;
        calls.push(Bend.Ann(f, tel));
        if (Bend.tele_open(book, t.T) === null) break;
      }
      if (R !== null && calls.length > 0) {
        out.push({ name: "def " + Bend.name_key(k), kind: "def", book: x_with_main(book, ...x_list(R, calls)) });
      }
    } catch (e) {
      if ((e as any)?.$ !== "Err" && !(e instanceof Error)) throw e;
    }
  }
  return out;
}

// The JS program bend builds for a book with a pure main (it prints main).
export function x_js_program(book: Bend.Book): string {
  return js_book(book);
}
