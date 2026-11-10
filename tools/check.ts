// Differential test on main. For each .bend file with a pure main, the
// generated Java / Rust must print for main exactly what the oracle prints:
//   default    `bend file.bend`: the checker's normal form, the semantics laws
//              are proven about
//   --expect   the file's trailing `#|` comment lines (for values no Bend lane
//              can hold, like a Nat past 2^48)
//   bun tools/check.ts <file-or-dir>... [--rust] [--expect] [--quiet] [--keep]
import * as fs from "node:fs";
import * as path from "node:path";
import { book_read, err_text, main_is_io, prepare, to_java, to_rust } from "../src/lib.ts";
import { compile_run, exec, ident, pool, root } from "./harness.ts";

const flag = (f: string) => process.argv.includes(f);
const quiet = flag("--quiet");
const lang = flag("--rust") ? "rust" : "java";
const ins = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = (ins.length ? ins : [path.join(root, "tests/bend")]).flatMap((p) =>
  fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((f) => f.endsWith(".bend") && !f.startsWith("_")).sort().map((f) => path.join(p, f))
    : [p]);

const tally: Record<string, string[]> = { ok: [], fail: [], gen: [], skip: [] };
const cases: { file: string; id: string; src: string }[] = [];
const ids = new Set<string>();
for (const f of files) {
  let book;
  try {
    book = await book_read(f);
  } catch (e) {
    tally.skip.push(`${f}: does not check (${err_text(e).split("\n")[0].slice(0, 80)})`);
    continue;
  }
  if (!book.tlds.main) {
    tally.skip.push(`${f}: no main`);
    continue;
  }
  try {
    if (main_is_io(book)) {
      tally.skip.push(`${f}: IO main`);
      continue;
    }
    const id = ident(ids, path.basename(f, ".bend"));
    const g = prepare(book, true);
    cases.push({ file: f, id, src: lang === "rust" ? to_rust(g, id) : to_java(g, "t", id) });
  } catch (e) {
    tally.gen.push(`${f}: ${err_text(e).split("\n")[0]}`);
  }
}
const wants = await pool(cases, 8, async (c) => {
  if (flag("--expect")) {
    const ls = fs.readFileSync(c.file, "utf8").split("\n").filter((l) => l.startsWith("#|"));
    return { code: ls.length ? 0 : 1, out: ls.map((l) => l.slice(2) + "\n").join("") };
  }
  const abs = path.resolve(c.file);
  // the checker's stack is near its limit on some inputs and overflows now
  // and then: ask again before giving up
  for (let i = 0; ; i++) {
    const r = await exec("bend", [abs], path.dirname(abs), 120000);
    if (r.code === 0 || i === 2) return r;
  }
});
const ran = compile_run(lang, cases);
cases.forEach((c, i) => {
  const w = wants[i];
  const g = ran.out.get(c.id) ?? "(no output)\n";
  if (ran.bad.has(c.id)) {
    tally.fail.push(`${c.file}: ${ran.bad.get(c.id)}`);
  } else if (w.code !== 0) {
    tally.skip.push(`${c.file}: no oracle (bend exits ${w.code})`);
  } else if (g === w.out) {
    tally.ok.push(c.file);
  } else {
    tally.fail.push(`${c.file}\n    want: ${JSON.stringify(w.out).slice(0, 300)}\n    ${lang}: ${JSON.stringify(g).slice(0, 300)}`);
  }
});
if (!quiet) {
  for (const s of tally.skip) console.log("skip " + s);
}
for (const s of tally.gen) console.log("GEN  " + s);
for (const s of tally.fail) console.log("FAIL " + s);
console.log(`\n${lang}: ok ${tally.ok.length}, fail ${tally.fail.length}, refused ${tally.gen.length}, skipped ${tally.skip.length}`
  + (flag("--keep") || tally.fail.length ? `  (sources in ${ran.dir})` : ""));
if (!flag("--keep") && tally.fail.length === 0) fs.rmSync(ran.dir, { recursive: true, force: true });
process.exit(tally.fail.length ? 1 : 0);
