// bendweave library entry: load a checked Bend book, emit Java / Rust.
import * as path from "node:path";
import * as Bend from "../build/bend2/bend.ts";
import * as Comp from "../build/bend2/comp.ts";

const C = Comp as any;

export async function book_read(file: string): Promise<Bend.Book> {
  const book = Bend.book_nil();
  await Bend.book_load(book, path.resolve(file), "", new Map());
  Bend.book_valid(book, 0);
  if (book.hols > 0) {
    throw new Error(`${book.hols} TODO(s) found: not a valid proof yet`);
  }
  return book;
}

export function main_is_io(book: Bend.Book): boolean {
  return C.io_type(book) !== null;
}

export type Gen = { book: Bend.Book; roots: string[] | null };

// showMain: export only bendweave.main_text, the text `bend file` prints
export function prepare(book: Bend.Book, showMain = false): Gen {
  if (!showMain) return { book, roots: null };
  const [b, k] = C.x_show_main(book);
  return { book: b, roots: [k] };
}

export function to_java(g: Gen, pkg: string, cls: string): string {
  return C.java_lib(g.book, pkg, cls, g.roots);
}

export function to_rust(g: Gen, module: string): string {
  return C.rust_lib(g.book, module, g.roots);
}

export function to_mjs(book: Bend.Book): string {
  return C.x_js_probe(book);
}

export function fuzz_cases(book: Bend.Book, n: number, seed: number, only: RegExp | null) {
  return C.x_fuzz(book, n, seed, only) as { name: string; kind: "def" | "law"; twin?: string; book: Bend.Book }[];
}

export function to_js_program(book: Bend.Book): string {
  return C.x_js_program(book);
}

// defs the last to_java / to_rust left out, each with its reason
export function skipped(): string[] {
  return C.X_SKIPPED;
}

// the Bend version the backends are built on (vendor/bend)
export const BEND_VERSION: string = C.X_BEND_VERSION;

export function err_text(e: unknown): string {
  if (e instanceof Error) return e.message;
  if ((e as any)?.$ === "Err") {
    try {
      // bend's own report: expected, observed, location
      return "bend check failed\n" + Bend.err_show(e as Bend.Err);
    } catch {
      const x = e as any;
      return "bend check failed: " + (typeof x.exp === "string" ? x.exp : "(no detail)");
    }
  }
  return String(e);
}
