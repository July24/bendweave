import Base

def main() -> List<Nat>:
  +big = Nat.pow(3n, 5n)
  [big, Nat.mul(big, 5n), Nat.sub(3n, big), Nat.sub(big, 3n), Nat.div(big, 7n), Nat.mod(big, 7n),
   Nat.div(big, 0n), Nat.mod(big, 0n), Nat.min(big, 5n), Nat.max(big, 5n), U32.to_nat(U32.from_nat(big)),
   U32.to_nat(U32.shln(1, 9n)), Nat.double(big)]
