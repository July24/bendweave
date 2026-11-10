import Base

def fill(+n: Nat, m: Map<&2, U32>) -> Map<&2, U32>:
  match n:
    case 0n:
      m
    case 1n+p:
      fill(p, Map.set(&2, U32, m, Nat.show(p), U32.from_nat(Nat.mul(p, p))))

def snd(r: Array<U32> & U32) -> U32:
  (a, x) = r
  x

def arr() -> U32:
  a = [0 : U32*8n]
  a[5] <- 42
  a[13] <- 7
  snd(a[21])

def look2(v: U32, r: Map<&2, U32> & U32) -> U32 & U32:
  (m, w) = r
  (v, w)

def look1(r: Map<&2, U32> & U32) -> U32 & U32:
  (m, v) = r
  look2(v, Map.get(U32, 99, m, "zz"))

def look(m: Map<&2, U32>) -> U32 & U32:
  look1(Map.get(U32, 0, m, "49"))

def main() -> (U32 & U32) & U32:
  (look(fill(50n, Map.new(&2, U32))), arr())
