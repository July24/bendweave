# bendweave

**English** · [中文](README_ZH.md)

Translate pure, proven logic written in [Bend 2](https://bend-lang.com/) into Java 21 and Rust.

bendweave is an independent, third-party project. It is not affiliated with or endorsed by HigherOrderCO, the makers of Bend.

The front end is not new code. The Java and Rust backends are appended to Bend's own compiler, `comp.ts`, so parsing, type checking, erasure, turning tail recursion into loops, and pattern-match lowering all come from the official implementation. The rule is: **anything that cannot be translated exactly is refused at generation time; nothing is approximated.**

## Setup

```
tools/setup.sh          # fetch the pinned upstream compiler into vendor/bend (tag v2.0.40) and build build/bend2
```

Requirements: `bun`; a local `bend` (its version must match `vendor/bend`, and the CLI warns if it does not); JDK 21+; Rust (cargo); and Lean v4.34.0 (`elan toolchain install leanprover/lean4:v4.34.0`; `bend --verdict` uses it to build its kernel).

## Usage

```
bun src/driver.ts logic.bend --java out/java --package com.x --class Logic
bun src/driver.ts logic.bend --rust out/rust --module logic
```

- **Admission gate**: before generating, the CLI runs `bend <PROOF> --verdict`, which rechecks the proofs with a kernel proven in Lean. Anything other than `ALL PROOFS CHECK` refuses generation. `<PROOF>` is the file given by `--proof`; otherwise the `PROOF.bend` beside the input; otherwise the input itself. `--no-verdict` skips the gate.
- **Exported**: every non-Base, filled, non-IO def that computes a value (`public static` in Java, `pub fn` in Rust). Base helpers that are used are private.
- **Not exported**: defs that return `Type`, bare proofs, and **defs that rely on `@unsafe` or foreign code**. The CLI prints a warning for these; they are outside Bend's proof guarantees.
- **Runtime library**: the generated code needs `runtime/java` (package `bendweave.rt`, no third-party dependencies) for Java, and `runtime/rust` (crate `bendweave_rt`) for Rust.

A complete example is in `examples/order`: `./run.sh` checks the proofs through the gate, generates the code, and calls it once from Java and once from Rust.

## Type mapping

| Bend | Java | Rust |
|---|---|---|
| `U32` | `int` (read as unsigned) | `u32` |
| `Nat` | `BigInteger` (no upper bound) | `Nat` = `num_bigint::BigUint` |
| `F32` | `float` | `f32` |
| `Bool` / `Unit` / `Cmp` | `boolean` / `Unit` / `Cmp` | `bool` / `()` / `Cmp` |
| `Char` | `int` (the U32 code) | `u32` |
| `String` | `bendweave.rt.BStr` (`BStr.of("..")` / `toString()`) | `Str` (`Str::from("..")` / `to_string()`) |
| `A & B` | `Tuple<A, B>` | `(A, B)` |
| `A -> B` | `Fn<A, B>` | `Fun<A, B>` (can be called only once) |
| `Array<T>` | `BArray<T>` | `Arr<T>` |
| user-defined or Base `type` | `sealed interface` + `record` | `enum`; values are `Rc<…>` |

When `List` is used, the generated code also includes conversion helpers: Java `listOf(java.util.List)` and `toJavaList(..)`; Rust `list_from(Vec)` and `list_to_vec(&..)`.

## What callers need to know

- **Deep recursion**: only tail calls become loops; other recursion uses the host stack. A non-tail-recursive function that walks a long list must run on a thread with a large stack: Java `R.withStack(() -> Logic.f(x))`; Rust `bendweave_rt::with_stack(move || logic::f(n).to_string())`, where `n` is a number (build `Rc` inputs inside the closure). Rust values are `Rc`-based and not `Send`: a `with_stack` closure cannot capture an `Rc`, and its result must be `Send` (numbers, `String`). So build the inputs inside the closure, and convert results to `u32` or `String` before returning them. A long `Rc` list is also dropped recursively, so the drop must happen inside that thread too.
- **Arrays are updated in place**: a Bend array has exactly one owner, so the generated code updates it directly. A Java caller that still needs a `BArray` it passed in must copy it first.
- **Each generated class or module has its own `List`, `Maybe`, and other types**, so values cannot be passed directly between two generated classes.
- **Nat as a loop counter is slow**: `match n: case 1n+p` costs one big-integer subtraction per step. Measured over 100 million iterations: the official JS backend took 0.08 s, Java 1.0 s, Rust 0.6 s.
- **F32**: `+ - * / %`, `sqrt`, rounding, `show` and `read` agree bit for bit with the official implementation. Transcendental functions such as `sin` and `exp` depend on the platform's libm, so the last bit is not guaranteed (Bend's own backends do not agree with each other either).
- **Nat has no upper bound**: the official runtime stops with an error at 2^48; this code keeps computing, following the mathematical semantics.

## Limitations (refused at generation time)

| Case | Java | Rust |
|---|---|---|
| A type computed from a value that carries data (a type family such as `Vec(n)`) | Supported (erased to `Object`) | First version supported: values are `Any`, see below |
| A datatype that recurses at another type (`Gr<A>` containing `Gr<P<A, A>>`) | Supported | Refused |
| A match on the raw bits of a U32 or F32 (the internal `Word`) | Refused | Refused |
| A def with more than 254 parameters | Refused | Supported |
| IO, foreign effects | Not translated | Not translated |

### Type families in Rust (first version)

A type computed from a value, such as `Vec(n)`, used as a parameter, result or field becomes `bendweave_rt::Any` in Rust. Callers pass values in with `rt::up(value)` and take them out with `rt::down::<Type>(any)`. For example, `Vec(2n)` is `rt::up((nat(1), (nat(2), ())))`, and it is read back with `rt::down::<(Nat, (Nat, ()))>(v)`. Two spellings of the same Bend type (`Vec(1n)` and `Nat & Unit`) convert to the same result: pairs convert component by component, and closures are wrapped.

Known limitation: a datatype with type parameters (such as `List<Vec(n)>`) is stored as a whole inside `Any`, without converting each element. If it appears under two different spellings, taking it out stops with a fail-stop error (`"a value is not a …"`) rather than giving a wrong result.

A type family that exists only for proofs (its results are `Unit`, `Empty` or equalities, such as `LE(a, b)`) is simply `()` in Rust.

## Testing

```
tools/test-all.sh quick     # a few minutes
tools/test-all.sh           # with the upstream corpus, about 10 minutes
```

| Layer | Tool | Reference |
|---|---|---|
| Runtime unit tests | `RuntimeTest.java`, `cargo test` | edge values; 200,000 random F32 values round-tripped through text; integer → F32 rounding |
| `main` differential test | `tools/check.ts` | `bend file.bend` (the checker's reduction, the semantics that laws are proven against) |
| Big Nat | `tools/check.ts --expect` | values computed independently, in `#\|` lines at the end of the file |
| Random inputs, per def | `tools/fuzz.ts` | Bend's official JS backend (it covers F32, which the checker does not compute) |
| Law property tests | `tools/fuzz.ts` | both sides of a law must be equal at random points (laws are proven in Bend, so a difference is a translation bug) |

`tests/fuzz/base_api.bend` wraps each built-in operation in a monomorphic def and compares each one with the official JS backend. To run the same checks on your own code: `bun tools/fuzz.ts PROOF.bend -n 32 --seed 7`.

## How far "lossless" goes

The translator itself has no formal proof, and neither do Bend's official C and JS backends. The guarantees come from: the `--verdict` gate (the proofs are rechecked by a kernel proven in Lean); reuse of the official front end and lowering; refusing rather than approximating; and the differential tests above.

## Upgrading Bend

Change `TAG` in `tools/setup.sh`, run `tools/setup.sh` again, then run `tools/test-all.sh`. The backends depend on internal functions of `comp.ts`, so the tests decide whether an upgrade works.
