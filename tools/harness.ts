// Shared by check.ts and fuzz.ts: compile many generated sources at once (one
// javac run, one cargo crate), run each one's bendweave_main_text, collect
// the texts. A source that fails to compile is dropped and reported.
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const root = path.resolve(import.meta.dir, "..");
// a JDK 21+: $JAVA_HOME_21, else macOS's java_home, else $JAVA_HOME
function jdk(): string {
  if (process.env.JAVA_HOME_21) return process.env.JAVA_HOME_21;
  const r = spawnSync("/usr/libexec/java_home", ["-v", "21+"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : process.env.JAVA_HOME ?? "";
}
export const JAVA_HOME = jdk();

export type Lang = "java" | "rust";
export type Item = { id: string; src: string };
export type Ran = { out: Map<string, string>; bad: Map<string, string>; dir: string };

const run = (cmd: string, args: string[], cwd = root) =>
  spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

// a fresh id, valid as a Java class and a Rust module
export function ident(taken: Set<string>, stem: string): string {
  let id = "c" + taken.size + "_" + stem.toLowerCase().replace(/\W/g, "_").slice(0, 40);
  while (taken.has(id)) id += "_";
  taken.add(id);
  return id;
}

export function exec(cmd: string, args: string[], cwd: string, ms: number): Promise<{ code: number | null; out: string }> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd });
    let o = "";
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", () => {});
    const t = setTimeout(() => p.kill("SIGKILL"), ms);
    p.on("close", (code) => {
      clearTimeout(t);
      res({ code, out: o });
    });
    p.on("error", () => res({ code: null, out: o }));
  });
}

// at most k of the jobs at once
export async function pool<A, B>(xs: A[], k: number, f: (x: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(xs.length);
  let at = 0;
  await Promise.all([...Array(Math.min(k, xs.length))].map(async () => {
    while (at < xs.length) {
      const i = at++;
      out[i] = await f(xs[i]);
    }
  }));
  return out;
}

function split(stdout: string): Map<string, string> {
  const got = new Map<string, string>();
  for (const part of stdout.split(/^@@@ /m).slice(1)) {
    const nl = part.indexOf("\n");
    got.set(part.slice(0, nl), part.slice(nl + 1));
  }
  return got;
}

export function compile_run(lang: Lang, items: Item[]): Ran {
  const dir = fs.mkdtempSync("/tmp/bw-" + lang + "-");
  const bad = new Map<string, string>();
  if (items.length === 0) return { out: new Map(), bad, dir };
  if (lang === "rust") {
    const src = path.join(dir, "src");
    fs.mkdirSync(src);
    for (const it of items) fs.writeFileSync(path.join(src, it.id + ".rs"), it.src);
    fs.writeFileSync(path.join(dir, "Cargo.toml"), `[package]\nname = "bw_check"\nversion = "0.0.0"\nedition = "2021"\n\n`
      + `[dependencies]\nbendweave_rt = { path = "${path.join(root, "runtime/rust")}" }\n\n[profile.dev]\nopt-level = 1\ndebug = false\n`);
    let mods = items.map((it) => it.id);
    for (;;) {
      // runs the cases named on the command line, each on its own big-stack
      // thread, at most 20 s (a thread past that is left behind)
      fs.writeFileSync(path.join(src, "main.rs"), [...mods.map((m) => `mod ${m};`),
        "use std::io::Write;",
        "fn main() {",
        "  std::panic::set_hook(Box::new(|_| {}));",
        "  let all: Vec<(&str, fn() -> bendweave_rt::Str)> = vec![" + mods.map((m) => `("${m}", ${m}::bendweave_main_text)`).join(", ") + "];",
        "  let want: Vec<String> = std::env::args().skip(1).collect();",
        "  for (name, f) in all {",
        "    if !want.iter().any(|w| w == name) { continue; }",
        "    println!(\"@@@ {}\", name);",
        "    std::io::stdout().flush().unwrap();",
        "    let (tx, rx) = std::sync::mpsc::channel();",
        "    std::thread::Builder::new().stack_size(1 << 30).spawn(move || { let _ = tx.send(std::panic::catch_unwind(|| f().to_string())); }).unwrap();",
        "    match rx.recv_timeout(std::time::Duration::from_secs(20)) {",
        "      Ok(Ok(s)) => print!(\"{}\", s),",
        "      Ok(Err(_)) => println!(\"!!! panic\"),",
        "      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => println!(\"!!! timeout\"),",
        "      Err(_) => println!(\"!!! panic\"),",
        "    }",
        "    std::io::stdout().flush().unwrap();",
        "  }",
        "  std::process::exit(0);",
        "}", ""].join("\n"));
      const cb = run("cargo", ["build", "--quiet", "--message-format=short"], dir);
      if (cb.status === 0) break;
      const errs = [...cb.stderr.matchAll(/^src\/(\w+)\.rs:(\d+):\d+: error(?:\[\w+\])?: (.*)$/gm)];
      const now = new Map<string, string>();
      for (const m of errs) if (!now.has(m[1])) now.set(m[1], "rustc " + m[2] + ": " + m[3]);
      if (now.size === 0 || now.has("main")) {
        throw new Error("cargo build failed outside generated modules\n" + cb.stderr.slice(0, 4000));
      }
      for (const [m, msg] of now) bad.set(m, msg);
      mods = mods.filter((m) => !now.has(m));
    }
    // a stack overflow aborts the process: note it and go on past that case
    const out = new Map<string, string>();
    let rest = mods;
    while (rest.length > 0) {
      const r = run(path.join(dir, "target/debug/bw_check"), rest, dir);
      const got = split(r.stdout);
      for (const [k, v] of got) out.set(k, v);
      const last = [...got.keys()].at(-1);
      if (r.status === 0 || last === undefined) break;
      out.set(last, /overflowed its stack/.test(r.stderr) ? "!!! stack overflow\n" : "!!! crash\n");
      rest = rest.slice(rest.indexOf(last) + 1);
    }
    return { out, bad, dir };
  }
  const gen = path.join(dir, "src", "t");
  fs.mkdirSync(gen, { recursive: true });
  for (const it of items) fs.writeFileSync(path.join(gen, it.id + ".java"), it.src);
  const rt = run("find", ["runtime/java/src", "-name", "*.java"]).stdout.trim().split("\n");
  let srcs = items.map((it) => path.join(gen, it.id + ".java"));
  for (;;) {
    const jc = run(`${JAVA_HOME}/bin/javac`, ["-nowarn", "-J-Xss64m", "-d", path.join(dir, "cls"), ...rt,
      path.join(root, "tools/java/ShowMain.java"), ...srcs]);
    if (jc.status === 0) break;
    const errs = [...jc.stderr.matchAll(/^(\/[^:\n]+\.java):(\d+): error: (.*)$/gm)];
    const now = new Map<string, string>();
    for (const m of errs) if (!now.has(m[1])) now.set(m[1], "javac " + m[2] + ": " + m[3]);
    if (now.size === 0 || [...now.keys()].some((b) => !srcs.includes(b))) {
      throw new Error("javac failed outside generated code\n" + jc.stderr.slice(0, 3000));
    }
    for (const [f, msg] of now) bad.set(path.basename(f, ".java"), msg);
    srcs = srcs.filter((s) => !now.has(s));
  }
  const live = srcs.map((s) => "t." + path.basename(s, ".java"));
  const r = live.length ? run(`${JAVA_HOME}/bin/java`, ["-Xss512m", "-cp", path.join(dir, "cls"), "ShowMain", ...live])
    : { stdout: "" };
  const out = new Map([...split(r.stdout)].map(([k, v]) => [k.slice(2), v] as [string, string]));
  return { out, bad, dir };
}
