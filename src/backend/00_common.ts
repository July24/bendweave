// Appended to upstream comp.ts by tools/build.ts; names here share its scope.
import * as Bend from "../../vendor/bend/bend2/bend.ts";

export function x_load_lib(book: Bend.Book): void {
  FL = file_new(book, true);
}

export function x_js_probe(book: Bend.Book): string {
  return js_lib(book, true);
}

// The book with one more def, bendweave.main_text: String, the text `bend
// file.bend` prints for main, built by Bend's own show code (main_pure).
export function x_show_main(book: Bend.Book): [Bend.Book, Name] {
  const b = main_pure(book, true);
  const m = b.tlds.main as Bend.Def;
  const strip = (t: Bend.LTerm) => Bend.term_strip(t) as Bend.LTerm;
  const [h, xs] = Bend.term_unapply(strip(m.e!));
  if (strip(h).$ !== "Ref" || (strip(h) as any).k !== "IO.write" || xs.length !== 1) {
    die("main_pure built an unexpected main: " + Bend.term_show(m.e!));
  }
  const S = tele_unbind((b.tlds["String.append"] as Bend.Def).T).ret;
  const k = "bendweave.main_text";
  b.tlds[k] = { $: "Def", n: 0, x: 0, T: S, v: Bend.term_higher(xs[0]), e: xs[0] };
  b.order.push(k);
  return [b, k];
}

// whether a def computes a value worth exporting: not a type (a def returning
// Type, a type family) and not a bare proof (returning an equality)
function x_computes(t: Bend.Def): boolean {
  const r = ty_wnf(tele_unbind(t.T).ret);
  return r?.$ !== "Typ" && r?.$ !== "Eql";
}

// The defs outside Base that are, or name (in a type, body, datatype or
// field) a def that is, @unsafe or foreign code: bend prints SOME PROOFS FAIL
// for them, so their laws prove nothing. As upstream main.ts book_promises.
function x_tainted(book: Bend.Book): Map<Name, string> {
  const why = new Map<Name, string>();
  for (const [k, t] of Object.entries(book.tlds) as [Name, Bend.Def][]) {
    if (t.u === true) why.set(k, "@unsafe " + Bend.name_key(k));
    else if (t.i !== undefined && t.b !== true) why.set(k, "foreign " + Bend.name_key(k));
  }
  if (why.size === 0) return why;
  const refs = (t: object, out: Set<string>) => {
    const seen = new Set<object>([t]);
    for (const todo: object[] = [t]; todo.length > 0;) {
      const x = todo.pop() as Record<string, unknown>;
      if ((x.$ === "Ref" || x.$ === "ADT") && typeof x.k === "string") out.add(x.k);
      for (const f in x) {
        const v = x[f];
        if (f !== "s" && typeof v === "object" && v !== null && !seen.has(v)) {
          seen.add(v);
          todo.push(v);
        }
      }
    }
  };
  const uses: Record<string, string[]> = Object.create(null);
  const reach = new Set([...new Set(book.order)].filter((k) => book.tlds[k]?.b !== true));
  for (const k of reach) {
    const t = book.tlds[k];
    if (t === undefined) continue;
    const rs = new Set<string>();
    for (const c of t.$ === "ADT" ? [t, ...t.c] : [t]) refs(Bend.term_lower(c.T), rs);
    if (t.$ === "Def" && t.e !== undefined) refs(t.e, rs);
    for (const r of rs) {
      (uses[r] ??= []).push(k);
      reach.add(r);
    }
  }
  for (const k of why.keys()) {
    for (const j of uses[k] ?? []) if (!why.has(j)) why.set(j, why.get(k)!);
  }
  return why;
}

export let X_SKIPPED: string[] = [];

// The defs a library exports: the given roots, else every pure, filled,
// non-Base def that computes a value. One that relies on @unsafe or foreign
// code is refused as a root and left out (and listed) otherwise.
function x_outs(roots: Name[] | null): Name[] {
  const bad = x_tainted(FL.book);
  X_SKIPPED = [];
  if (roots !== null) {
    const b = roots.find((k) => bad.has(k));
    if (b !== undefined) die(`${Bend.name_key(b)} relies on ${bad.get(b)}: outside Bend's proof guarantees`);
    return roots;
  }
  const outs = [...new Set(FL.book.order)].filter((k) => {
    const t = tld_of(k);
    if (!(done_live(t) && !t.b && t.x === 0 && io_base(FL.book, t.T) === null && x_computes(t))) return false;
    if (bad.has(k)) {
      X_SKIPPED.push(`${Bend.name_key(k)} (relies on ${bad.get(k)})`);
      return false;
    }
    return true;
  });
  if (outs.length === 0) {
    die("nothing to export: no pure, filled, non-Base def"
      + (X_SKIPPED.length ? "; left out: " + X_SKIPPED.join(", ") : ""));
  }
  return outs;
}
