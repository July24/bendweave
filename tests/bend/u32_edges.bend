import Base

def ops(+a: U32, +b: U32) -> List<U32>:
  [(a + b : U32), (a - b : U32), (a * b : U32), (a / b : U32), (a % b : U32),
   (a .&. b : U32), (a .|. b : U32), (a .^. b : U32), U32.not(a),
   U32.shln(a, 31n), U32.shln(a, 32n), U32.shln(a, 33n), U32.shrn(a, 31n), U32.shrn(a, 32n),
   U32.min(a, b), U32.max(a, b), U32.pow(a, 5n)]

def cmps(+a: U32, +b: U32) -> List<Bool>:
  [U32.is_lt(a, b), U32.is_le(a, b), U32.is_gt(a, b), U32.is_ge(a, b), U32.is_eq(a, b), U32.is_ne(a, b)]

def main() -> List<(List<U32> & List<Bool>)>:
  [(ops(4294967295, 4294967295), cmps(4294967295, 1)),
   (ops(2147483648, 0), cmps(2147483648, 2147483647)),
   (ops(0, 4294967295), cmps(0, 0)),
   (ops(123456789, 7), cmps(7, 2147483648)),
   (ops(65536, 65536), cmps(4294967295, 4294967294))]
