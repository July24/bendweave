#!/bin/sh
# The whole suite. `quick` skips the upstream corpus (which adds about 8 minutes).
#   tools/test-all.sh [quick]
cd "$(dirname "$0")/.."
JH=${JAVA_HOME_21:-$(/usr/libexec/java_home -v 21+ 2>/dev/null || echo "$JAVA_HOME")}
T=vendor/bend/tests
D=vendor/bend/demos
fail=0
step() { echo "== $*"; "$@" || fail=1; }
step bun tools/build.ts
echo "== java runtime unit tests"
rm -rf build/rt && "$JH/bin/javac" -nowarn -d build/rt $(find runtime/java/src -name '*.java') && "$JH/bin/java" -cp build/rt bendweave.rt.RuntimeTest || fail=1
echo "== rust runtime unit tests"
(cd runtime/rust && cargo test --release --quiet 2>&1 | grep -E "test result|FAILED|panicked") || fail=1
step bun tools/check.ts tests/bend --quiet
step bun tools/check.ts tests/bend --quiet --rust
step bun tools/check.ts tests/expect --expect --quiet
step bun tools/check.ts tests/expect --expect --quiet --rust
step bun tools/fuzz.ts tests/fuzz -n 16 --quiet
step bun tools/fuzz.ts $D/proof_insertion_sort/PROOF.bend $D/proof_numerics/PROOF.bend $D/pure_par_sort/PROOF.bend -n 6 --quiet
if [ "$1" != quick ]; then
  DIRS="$T/flatten $T/check $T/parse $T/proof $T/stuck $T/import $T/eval $T/compile $T/run $T/show $T/comptime $T/reg $T/printer $T/state $T/base $T/spec $T/grade"
  step bun tools/check.ts $DIRS $D/proof_insertion_sort/main.bend $D/proof_numerics/main.bend $D/proof_typed_eval/main.bend --quiet
  step bun tools/check.ts $DIRS $D/proof_insertion_sort/main.bend $D/proof_numerics/main.bend --quiet --rust
  step bun tools/fuzz.ts $T/proof $D/proof_typed_eval/PROOF.bend $D/pure_par_sum/PROOF.bend $D/pure_hvm5_mini/PROOF.bend $D/app_win_is_bug_2d/PROOF.bend -n 6 --quiet
fi
[ $fail = 0 ] && echo "ALL OK" || { echo "SOME FAILED"; exit 1; }
