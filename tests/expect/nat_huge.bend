# Nat past 2^48, where Bend's own runtimes fail-stop and its checker (unary Nat)
# cannot go: the expected text below is computed independently (Python integers,
# and Bend's JS f32_show for the F32 texts). Run with: bun tools/check.ts tests/expect --expect
import Base

def a() -> Nat:
  Nat.pow(2n, 100n)

def c() -> Nat:
  Nat.mul(4294967295n, Nat.mul(4294967295n, 4294967295n))

def nats() -> List<Nat>:
  [a(), Nat.mul(a(), a()), Nat.sub(a(), 3n), Nat.sub(3n, a()), Nat.div(a(), 7n), Nat.mod(a(), 7n),
   Nat.div(Nat.mul(a(), a()), 1n+a()), c(), U32.to_nat(U32.from_nat(Nat.add(a(), 12345n))),
   Nat.max(a(), c()), Nat.min(a(), c()), Nat.double(a()), Nat.mod(Nat.mul(a(), a()), 1n+c()),
   Nat.pow(2n, 48n), 1n+Nat.pow(2n, 48n), Nat.sub(Nat.pow(2n, 64n), 1n)]

def strs() -> List<String>:
  [Nat.show(a()), F32.show(F32.from_nat(a())), F32.show(F32.from_nat(c())), F32.show(F32.from_nat(Nat.pow(2n, 130n))),
   F32.show(F32.from_nat(16777217n)), F32.show(F32.from_nat(Nat.sub(Nat.pow(2n, 64n), 1n))),
   Nat.show(String.length(Nat.show(Nat.mul(a(), a()))))]

def main() -> List<Nat> & List<String>:
  (nats(), strs())

#|([1267650600228229401496703205376n, 1606938044258990275541962092341162602522202993782792835301376n, 1267650600228229401496703205373n, 0n, 181092942889747057356671886482n, 2n, 1267650600228229401496703205375n, 79228162458924105385300197375n, 12345n, 1267650600228229401496703205376n, 79228162458924105385300197375n, 2535301200456458802993406410752n, 42501298316139992973312n, 281474976710656n, 281474976710657n, 18446744073709551615n], ["1267650600228229401496703205376", "1.2676506e+30", "7.9228163e+28", "inf", "16777216", "18446744000000000000", "61"])
