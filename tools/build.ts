// Builds build/bend2/: a copy of the pinned upstream bend2 sources, where
// comp.ts gets our backends appended, so they share its module scope (FL,
// fun_of, term_spine, mat_rows, ...) without any upstream patch.
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const up = path.join(root, "vendor/bend/bend2");
const out = path.join(root, "build/bend2");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["bend.ts", "safe.ts", "base.bend"]) {
  fs.copyFileSync(path.join(up, f), path.join(out, f));
}
fs.cpSync(path.join(up, "effs"), path.join(out, "effs"), { recursive: true });

const strip = (src: string) =>
  src.replace(/^import [^\n]*\n/gm, "").replace(/^\/\/ @backend-header[^]*?\/\/ @end-header\n/m, "");
const backends = fs.readdirSync(path.join(root, "src/backend"))
  .filter((f) => f.endsWith(".ts")).sort()
  .map((f) => `\n// ==== bendweave: src/backend/${f} ====\n`
    + strip(fs.readFileSync(path.join(root, "src/backend", f), "utf8")));
const version = /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(up, "main.ts"), "utf8"))?.[1];
if (!version) throw new Error("no VERSION in upstream main.ts");
fs.writeFileSync(path.join(out, "comp.ts"),
  fs.readFileSync(path.join(up, "comp.ts"), "utf8") + backends.join("")
  + `\nexport const X_BEND_VERSION = ${JSON.stringify(version)};\n`);
console.log("built", out);
