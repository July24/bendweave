# bendweave: status and next steps

**English** · [中文](PLAN_ZH.md)

Usage, type mapping, limitations and the test method are in [README.md](README.md). This file records decisions, test results and open items.

Baseline: Bend 2.0.40. `vendor/bend` is pinned to tag `v2.0.40`, fetched by `tools/setup.sh`, and is not committed.

## Decisions

| Item | Decision |
|---|---|
| Front end | No separate parser. `tools/build.ts` appends the backend files to upstream `comp.ts`, so they share its lowering functions. No patch to upstream. |
| Nat | Java `BigInteger` / Rust `BigUint`, no upper bound |
| Java version | 21+ |
| Parallel calls | Generated as sequential code |
| String | Java `bendweave.rt.BStr` / Rust `Str`: a shared reversed buffer; cons, head and tail are all O(1) |
| `@unsafe` / foreign | Defs that depend on them are not exported (same logic as upstream `book_promises`) |
| Cannot translate exactly | Refused at generation time, never approximated |
| Gate | The CLI runs `bend <PROOF> --verdict` before generating (Lean v4.34.0 is installed under `~/.elan`). A failure refuses generation; `--no-verdict` skips the check. |
| Rust type families | Values are `Any`. `rt::Dy` gives one dynamic form: pairs component by component, closures wrapped, everything else as is. |

## Test results (`tools/test-all.sh`, all passing)

| Item | Java | Rust |
|---|---|---|
| Upstream corpus, `main` differential (against the checker) | 200 agree, 0 disagree | 200 agree, 0 disagree |
| Built-in operation fuzzing (168 cases × 16 random input sets, against the official JS backend) | 168 / 0 | 168 / 0 |
| Random inputs over upstream proof tests and demos | 373 agree, 0 disagree | 370 agree, 0 disagree |
| Same, law sides equal | 105 laws hold | 105 laws hold |
| Big Nat (around 2^100, against independently computed values) | agree | agree |
| Runtime unit tests | pass | 8 groups pass |

Six or seven fuzz cases per run time out or overflow the stack. Random U32 values near 2^31 get converted to Nat and then decremented one at a time, or recursed on without tail calls. These are resource limits, not disagreements, so they are not counted as failures.

Mutation check: deliberately breaking `u32Div` and `u32Shln` made the fuzzer fail immediately.

Bug found by fuzzing and fixed: the Rust backend generated a nonexistent enum variant name for `F32.read`.

## Backend refusals (upstream corpus)

- Java: matches on raw Word bits (4), more than 254 parameters (1).
- Rust: matches on raw Word bits (4), and datatypes that recurse at another type (`Gr<A>` containing `Gr<P<A, A>>`, which rustc cannot check for drop).
- The other roughly 300 refusals are programs that the official compiler also refuses (missing `import Base`, a name clashing with a built-in type), programs whose `main` cannot be printed (functions, `Type`), or programs that depend on `@unsafe`.

## To do

1. The test tools (`tools/check.ts`, `tools/fuzz.ts`) call the generator directly and bypass the `--verdict` gate. This is by design: they test the translation, not the proofs.
2. Rust type-family limitation: a datatype with type parameters is not converted element by element inside `Any`, so two spellings that meet will fail-stop. Fix: generate a per-field `Dy` implementation for each generated enum.
3. Rust `with_stack` returns only `Send` values, so a deep computation cannot hand back an `Rc`-based result. A fix needs an `unsafe impl Send` wrapper, which is sound only if no other thread touches the value while the big-stack thread runs (the caller joins it first).
4. A fast path for small Nat values. Each step currently costs one big-integer operation, about 10 times slower than the official runtime.
5. Several generated classes or modules share one copy of `List`, `Maybe` and other Base types.
6. Maven / crates packaging, and CI.
7. Put the original law text into the doc comments of the generated code.
