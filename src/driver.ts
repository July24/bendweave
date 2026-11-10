// bendweave CLI:
//   bun src/driver.ts <file.bend> [--java <dir>] [--package com.x] [--class Name]
//                                 [--rust <dir>] [--module name] [--mjs <file>] [--show-main]
//                                 [--proof PROOF.bend] [--no-verdict]
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { BEND_VERSION, book_read, err_text, prepare, skipped, to_java, to_mjs, to_rust } from "./lib.ts";

function warn(): void {
  for (const s of skipped()) console.error("warning: not exported: " + s);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// the installed bend checks the proofs; the backends read the same source
// with the vendored compiler, so the two must be one version
const inst = spawnSync("bend", ["version"], { encoding: "utf8" }).stdout?.trim().replace(/^bend\s+/, "");
if (inst && inst !== BEND_VERSION) {
  console.error(`warning: installed bend is ${inst}, bendweave is built on ${BEND_VERSION}: run tools/setup.sh on the matching tag`);
}

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("usage: bun src/driver.ts <file.bend> [--java dir] [--package p] [--class C]"
    + " [--rust dir] [--module m] [--mjs f] [--show-main] [--proof PROOF.bend] [--no-verdict]");
  process.exit(2);
}
// The gate: bend rechecks the proofs with its kernel proven in Lean. It reads
// --proof <file>, else the PROOF.bend beside the input, else the input itself.
if (!process.argv.includes("--no-verdict")) {
  const beside = path.join(path.dirname(path.resolve(file)), "PROOF.bend");
  const proof = path.resolve(arg("--proof") ?? (fs.existsSync(beside) ? beside : file));
  const v = spawnSync("bend", [proof, "--verdict"], { encoding: "utf8", cwd: path.dirname(proof) });
  const text = (v.stdout ?? "") + (v.stderr ?? "");
  if (v.status !== 0 || !/^ALL PROOFS CHECK/m.test(text)) {
    console.error(`refused: bend ${path.relative(process.cwd(), proof)} --verdict did not say ALL PROOFS CHECK`
      + ` (pass --no-verdict to generate anyway)\n${text.trim()}`);
    process.exit(1);
  }
  console.error(`verdict: ALL PROOFS CHECK (${path.relative(process.cwd(), proof)})`);
}

const base = path.basename(file, ".bend");
const camel = base.replace(/(^|[_-])(\w)/g, (_, __, c) => c.toUpperCase());
const show = process.argv.includes("--show-main");
try {
  const mjs = arg("--mjs");
  if (mjs) {
    fs.writeFileSync(mjs, to_mjs(await book_read(file)));
  }
  const jdir = arg("--java");
  if (jdir) {
    const pkg = arg("--package") ?? "bend.gen";
    const cls = arg("--class") ?? camel;
    const src = to_java(prepare(await book_read(file), show), pkg, cls);
    const dir = path.join(jdir, ...pkg.split("."));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, cls + ".java"), src);
    warn();
  }
  const rdir = arg("--rust");
  if (rdir) {
    const mod = arg("--module") ?? base.replace(/\W/g, "_").toLowerCase();
    const src = to_rust(prepare(await book_read(file), show), mod);
    fs.mkdirSync(rdir, { recursive: true });
    fs.writeFileSync(path.join(rdir, mod + ".rs"), src);
    if (!jdir) warn();
  }
} catch (e) {
  console.error(err_text(e));
  process.exit(1);
}
