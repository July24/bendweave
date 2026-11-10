// Random-input differential test, per def and per law.
//   def: main = [f(x1), f(x2), ...] at random x of f's parameter types. Bend's
//        own JS lane (what `bend file -o x.js` runs) prints it; the generated
//        Java and Rust must print the same text. This covers F32, which the
//        checker does not compute.
//   law: for `law l: for x: T  {a == b : R}`, [a(x1), ...] and [b(x1), ...]
//        must print the same text in the generated code: the law is proven in
//        Bend, so a difference is a translation bug.
//   bun tools/fuzz.ts <file-or-dir>... [-n 8] [--seed 1] [--only regex]
//                     [--java-only|--rust-only] [--quiet] [--keep]
import * as fs from "node:fs";
import * as path from "node:path";
import { book_read, err_text, fuzz_cases, prepare, to_java, to_js_program, to_rust } from "../src/lib.ts";
import { compile_run, exec, ident, pool, type Lang } from "./harness.ts";

const flag = (f: string) => process.argv.includes(f);
const opt = (f: string, d: string) => flag(f) ? process.argv[process.argv.indexOf(f) + 1] : d;
const vals = new Set(["-n", "--seed", "--only"].filter(flag).map((f) => process.argv.indexOf(f) + 1));
const ins = process.argv.slice(2).filter((a, i) => !a.startsWith("-") && !vals.has(i + 2));
const n = Number(opt("-n", "8"));
const seed = Number(opt("--seed", "1"));
const only = flag("--only") ? new RegExp(opt("--only", "")) : null;
const langs: Lang[] = flag("--java-only") ? ["java"] : flag("--rust-only") ? ["rust"] : ["java", "rust"];
const files = ins.flatMap((p) => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).filter((f) => f.endsWith(".bend") && !f.startsWith("_")).sort().map((f) => path.join(p, f))
  : [p]);

type Case = { name: string; id: string; twin?: string; js: string | null; src: Partial<Record<Lang, string>>;
  refused: Partial<Record<Lang, string>>; want?: string | null };
const cases: Case[] = [];
const ids = new Set<string>();
const notes: string[] = [];
for (const f of files) {
  let book;
  try {
    book = await book_read(f);
  } catch (e) {
    notes.push(`skip ${f}: does not check (${err_text(e).split("\n")[0].slice(0, 80)})`);
    continue;
  }
  for (const c of fuzz_cases(book, n, seed, only)) {
    const name = `${path.basename(f)}: ${c.name}`;
    if (process.env.BW_TRACE) console.error("gen", name);
    let g;
    try {
      g = prepare(c.book, true);
    } catch (e) {
      notes.push(`skip ${name}: ${err_text(e).split("\n")[0].slice(0, 100)}`);
      continue;
    }
    const cs: Case = { name, id: ident(ids, c.name.replace(/^(def|law) /, "")), twin: c.twin && f + c.twin,
      js: null, src: {}, refused: {} };
    try {
      cs.js = to_js_program(c.book);
    } catch (e) {
      if (c.kind === "def") {
        notes.push(`skip ${name}: no JS oracle (${err_text(e).split("\n")[0].slice(0, 80)})`);
        continue;
      }
    }
    for (const l of langs) {
      try {
        cs.src[l] = l === "java" ? to_java(g, "t", cs.id) : to_rust(g, cs.id);
      } catch (e) {
        cs.refused[l] = err_text(e).split("\n")[0];
      }
    }
    cases.push(cs);
  }
}
// the oracle: node runs Bend's own JS for each case
const tmp = fs.mkdtempSync("/tmp/bw-js-");
await pool(cases, 8, async (c) => {
  if (c.js === null) {
    c.want = null;
    return;
  }
  const f = path.join(tmp, c.id + ".js");
  fs.writeFileSync(f, c.js);
  const r = await exec("node", ["--stack-size=60000", f], tmp, 20000);
  c.want = r.code === 0 ? r.out : null;
});
fs.rmSync(tmp, { recursive: true, force: true });

let fails = 0;
for (const l of langs) {
  // a def with no oracle result (it fail-stops, or runs too long) is left out
  const live = cases.filter((c) => c.src[l] !== undefined && (c.want != null || c.twin));
  const ran = compile_run(l, live.map((c) => ({ id: c.id, src: c.src[l]! })));
  const t = { ok: 0, law: 0, fail: [] as string[], refused: [] as string[], none: 0, slow: [] as string[] };
  // out of time or stack on a random input: a cost, not a wrong answer
  const spent = (g: string) => /^!!! (timeout|stack overflow|java\.lang\.StackOverflowError)/.test(g);
  const twins = new Map<string, [string, string][]>();
  for (const c of cases) {
    if (c.refused[l] !== undefined) t.refused.push(`${c.name}: ${c.refused[l]}`);
  }
  for (const c of live) {
    const got = ran.out.get(c.id) ?? "(no output)\n";
    if (ran.bad.has(c.id)) {
      t.fail.push(`${c.name}: ${ran.bad.get(c.id)}`);
      continue;
    }
    if (c.twin) twins.set(c.twin, [...twins.get(c.twin) ?? [], [c.name, got]]);
    if (spent(got)) {
      t.slow.push(`${c.name}: ${got.trim().slice(4)}`);
    } else if (c.want == null) {
      t.none++;
    } else if (got === c.want) {
      t.ok++;
    } else {
      t.fail.push(`${c.name}\n    bend js: ${JSON.stringify(c.want).slice(0, 400)}\n    ${l.padEnd(7)}: ${JSON.stringify(got).slice(0, 400)}`);
    }
  }
  for (const sides of twins.values()) {
    if (sides.length !== 2) continue;
    const [[a, x], [, y]] = sides;
    if (x === y && !x.startsWith("!!!")) {
      t.law++;
    } else if (x !== y && !spent(x) && !spent(y)) {
      t.fail.push(`${a.replace(" (lhs)", "")}: the two sides differ\n    lhs: ${JSON.stringify(x).slice(0, 400)}\n    rhs: ${JSON.stringify(y).slice(0, 400)}`);
    }
  }
  for (const s of t.refused) if (!flag("--quiet")) console.log(`REFUSED ${l} ${s}`);
  for (const s of t.slow) if (!flag("--quiet")) console.log(`SLOW ${l} ${s}`);
  for (const s of t.fail) console.log(`FAIL ${l} ${s}`);
  console.log(`${l}: ${t.ok} cases equal to Bend's JS lane, ${t.law} laws hold, ${t.fail.length} fail, `
    + `${t.refused.length} refused, ${t.slow.length} out of time/stack, ${t.none} without oracle` + (flag("--keep") || t.fail.length ? `  (sources in ${ran.dir})` : ""));
  fails += t.fail.length;
  if (!flag("--keep") && t.fail.length === 0) fs.rmSync(ran.dir, { recursive: true, force: true });
}
if (!flag("--quiet")) for (const s of notes) console.log(s);
console.log(`${cases.length} cases from ${files.length} files, ${n} inputs each, seed ${seed}`);
process.exit(fails ? 1 : 0);
