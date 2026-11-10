# Monomorphic wrappers over Base: tools/fuzz.ts calls each with random inputs and
# compares Bend's JS lane with the generated Java and Rust. One def per operation,
# so every native operation of the runtimes is compared on its own.
import Base

def u32_add(a: U32, b: U32) -> U32:
  U32.add(a, b)

def u32_sub(a: U32, b: U32) -> U32:
  U32.sub(a, b)

def u32_mul(a: U32, b: U32) -> U32:
  U32.mul(a, b)

def u32_div(a: U32, b: U32) -> U32:
  U32.div(a, b)

def u32_mod(a: U32, b: U32) -> U32:
  U32.mod(a, b)

def u32_and(a: U32, b: U32) -> U32:
  U32.and(a, b)

def u32_or(a: U32, b: U32) -> U32:
  U32.or(a, b)

def u32_xor(a: U32, b: U32) -> U32:
  U32.xor(a, b)

def u32_min(a: U32, b: U32) -> U32:
  U32.min(a, b)

def u32_max(a: U32, b: U32) -> U32:
  U32.max(a, b)

def u32_is_eq(a: U32, b: U32) -> Bool:
  U32.is_eq(a, b)

def u32_is_ne(a: U32, b: U32) -> Bool:
  U32.is_ne(a, b)

def u32_is_lt(a: U32, b: U32) -> Bool:
  U32.is_lt(a, b)

def u32_is_le(a: U32, b: U32) -> Bool:
  U32.is_le(a, b)

def u32_is_gt(a: U32, b: U32) -> Bool:
  U32.is_gt(a, b)

def u32_is_ge(a: U32, b: U32) -> Bool:
  U32.is_ge(a, b)

def u32_not(a: U32) -> U32:
  U32.not(a)

def u32_shl(a: U32) -> U32:
  U32.shl(a)

def u32_shr(a: U32) -> U32:
  U32.shr(a)

def u32_inc(a: U32) -> U32:
  U32.inc(a)

def u32_cmp(a: U32, b: U32) -> Cmp:
  U32.cmp(a, b)

def u32_is_zero(a: U32) -> Bool:
  U32.is_zero(a)

def u32_shln(a: U32, n: Nat) -> U32:
  U32.shln(a, n)

def u32_shrn(a: U32, n: Nat) -> U32:
  U32.shrn(a, n)

def u32_pow(a: U32, n: Nat) -> U32:
  U32.pow(a, n)

def u32_log2(a: U32) -> Nat:
  U32.log2(a)

def u32_popcount(a: U32) -> Nat:
  U32.popcount(a)

def u32_ctz(a: U32) -> Nat:
  U32.ctz(a)

def u32_show(a: U32) -> String:
  U32.show(a)

def u32_read(s: String) -> Maybe<&2, U32>:
  U32.read(s)

def u32_read_show(a: U32) -> Maybe<&2, U32>:
  U32.read(U32.show(a))

def u32_to_f32(a: U32) -> F32:
  U32.to_f32(a)

def u32_from_nat(n: Nat) -> U32:
  U32.from_nat(n)

def u32_from_nat_mul(a: U32, b: U32) -> U32:
  U32.from_nat(Nat.mul(U32.to_nat(U32.shrn(a, 20n)), U32.to_nat(U32.shrn(b, 20n))))

def nat_add(a: Nat, b: Nat) -> Nat:
  Nat.add(a, b)

def nat_sub(a: Nat, b: Nat) -> Nat:
  Nat.sub(a, b)

def nat_mul(a: Nat, b: Nat) -> Nat:
  Nat.mul(a, b)

def nat_div(a: Nat, b: Nat) -> Nat:
  Nat.div(a, b)

def nat_mod(a: Nat, b: Nat) -> Nat:
  Nat.mod(a, b)

def nat_min(a: Nat, b: Nat) -> Nat:
  Nat.min(a, b)

def nat_max(a: Nat, b: Nat) -> Nat:
  Nat.max(a, b)

def nat_pow(a: Nat, b: Nat) -> Nat:
  Nat.pow(Nat.mod(a, 6n), Nat.mod(b, 6n))

def nat_is_eq(a: Nat, b: Nat) -> Bool:
  Nat.is_eq(a, b)

def nat_is_ne(a: Nat, b: Nat) -> Bool:
  Nat.is_ne(a, b)

def nat_is_lt(a: Nat, b: Nat) -> Bool:
  Nat.is_lt(a, b)

def nat_is_le(a: Nat, b: Nat) -> Bool:
  Nat.is_le(a, b)

def nat_is_gt(a: Nat, b: Nat) -> Bool:
  Nat.is_gt(a, b)

def nat_is_ge(a: Nat, b: Nat) -> Bool:
  Nat.is_ge(a, b)

def nat_cmp(a: Nat, b: Nat) -> Cmp:
  Nat.cmp(a, b)

def nat_divmod(a: Nat, b: Nat) -> Nat & Nat:
  Nat.divmod(a, b)

def nat_double(a: Nat) -> Nat:
  Nat.double(a)

def nat_show(a: Nat) -> String:
  Nat.show(a)

def nat_of_u32(a: U32) -> Nat:
  U32.to_nat(U32.shrn(a, 22n))

def nat_match(n: Nat) -> U32:
  match n:
    case 0n:
      10
    case 1n:
      11
    case 5n:
      15
    case 2n+p:
      U32.from_nat(p)

def f32_add(a: F32, b: F32) -> F32:
  F32.add(a, b)

def f32_sub(a: F32, b: F32) -> F32:
  F32.sub(a, b)

def f32_mul(a: F32, b: F32) -> F32:
  F32.mul(a, b)

def f32_div(a: F32, b: F32) -> F32:
  F32.div(a, b)

def f32_mod(a: F32, b: F32) -> F32:
  F32.mod(a, b)

def f32_min(a: F32, b: F32) -> F32:
  F32.min(a, b)

def f32_max(a: F32, b: F32) -> F32:
  F32.max(a, b)

def f32_is_eq(a: F32, b: F32) -> Bool:
  F32.is_eq(a, b)

def f32_is_ne(a: F32, b: F32) -> Bool:
  F32.is_ne(a, b)

def f32_is_lt(a: F32, b: F32) -> Bool:
  F32.is_lt(a, b)

def f32_is_le(a: F32, b: F32) -> Bool:
  F32.is_le(a, b)

def f32_is_gt(a: F32, b: F32) -> Bool:
  F32.is_gt(a, b)

def f32_is_ge(a: F32, b: F32) -> Bool:
  F32.is_ge(a, b)

def f32_neg(a: F32) -> F32:
  F32.neg(a)

def f32_abs(a: F32) -> F32:
  F32.abs(a)

def f32_sqrt(a: F32) -> F32:
  F32.sqrt(a)

def f32_floor(a: F32) -> F32:
  F32.floor(a)

def f32_ceil(a: F32) -> F32:
  F32.ceil(a)

def f32_trunc(a: F32) -> F32:
  F32.trunc(a)

def f32_round(a: F32) -> F32:
  F32.round(a)

def f32_square(a: F32) -> F32:
  F32.square(a)

def f32_to_u32(a: F32) -> U32:
  F32.to_u32(a)

def f32_bits(a: F32) -> U32:
  F32.bits(a)

def f32_show(a: F32) -> String:
  F32.show(a)

def f32_read(s: String) -> Maybe<&2, F32>:
  F32.read(s)

def f32_read_show(a: F32) -> Maybe<&2, F32>:
  F32.read(F32.show(a))

def f32_read_u32(a: U32) -> Maybe<&2, F32>:
  F32.read(U32.show(a))

def f32_from_nat(n: Nat) -> F32:
  F32.from_nat(n)

def f32_to_nat(a: F32) -> Nat:
  F32.to_nat(F32.min(F32.abs(a), 500.0))

def f32_clamp(x: F32, lo: F32, hi: F32) -> F32:
  F32.clamp(x, lo, hi)

def f32_lerp(a: F32, b: F32, t: F32) -> F32:
  F32.lerp(a, b, t)

def bool_not(a: Bool) -> Bool:
  Bool.not(a)

def bool_and(a: Bool, b: Bool) -> Bool:
  Bool.and(a, b)

def bool_or(a: Bool, b: Bool) -> Bool:
  Bool.or(a, b)

def bool_xor(a: Bool, b: Bool) -> Bool:
  Bool.xor(a, b)

def bool_cmp(a: Bool, b: Bool) -> Cmp:
  Bool.cmp(a, b)

def bool_full_add(a: Bool, b: Bool, c: Bool) -> Bool & Bool:
  Bool.full_add(a, b, c)

def cmp_is_lt(c: Cmp) -> Bool:
  Cmp.is_lt(c)

def cmp_is_eq(c: Cmp) -> Bool:
  Cmp.is_eq(c)

def cmp_is_gt(c: Cmp) -> Bool:
  Cmp.is_gt(c)

def cmp_is_le(c: Cmp) -> Bool:
  Cmp.is_le(c)

def cmp_is_ge(c: Cmp) -> Bool:
  Cmp.is_ge(c)

def char_is_digit(c: Char) -> Bool:
  Char.is_digit(c)

def char_is_upper(c: Char) -> Bool:
  Char.is_upper(c)

def char_is_lower(c: Char) -> Bool:
  Char.is_lower(c)

def char_is_alpha(c: Char) -> Bool:
  Char.is_alpha(c)

def char_is_space(c: Char) -> Bool:
  Char.is_space(c)

def char_to_upper(c: Char) -> Char:
  Char.to_upper(c)

def char_to_lower(c: Char) -> Char:
  Char.to_lower(c)

def char_is_eq(a: Char, b: Char) -> Bool:
  Char.is_eq(a, b)

def char_show(c: Char) -> String:
  Char.show(c)

def string_append(a: String, b: String) -> String:
  String.append(a, b)

def string_concat3(+a: String, b: String) -> String:
  a ++ b ++ a

def string_length(s: String) -> Nat:
  String.length(s)

def string_reverse(s: String) -> String:
  String.reverse(s)

def string_is_empty(s: String) -> Bool:
  String.is_empty(s)

def string_eq(a: String, b: String) -> Bool:
  String.eq(a, b)

def string_is_lt(a: String, b: String) -> Bool:
  String.is_lt(a, b)

def string_is_le(a: String, b: String) -> Bool:
  String.is_le(a, b)

def string_is_gt(a: String, b: String) -> Bool:
  String.is_gt(a, b)

def string_is_ge(a: String, b: String) -> Bool:
  String.is_ge(a, b)

def string_starts_with(a: String, b: String) -> Bool:
  String.starts_with(a, b)

def string_ends_with(a: String, b: String) -> Bool:
  String.ends_with(a, b)

def string_contains(a: String, b: String) -> Bool:
  String.contains(a, b)

def string_contains_self(+a: String, b: String) -> Bool:
  String.contains(a ++ b, a)

def string_order(a: String, b: String) -> Cmp:
  String.order(a, b)

def string_cons(c: Char, s: String) -> String:
  SCon{c, s}

def string_quote(s: String) -> String:
  String.quote(s)

def string_match(s: String) -> U32:
  match s:
    case SNil{}:
      0
    case SCon{Chr{c}, t}:
      c

def list_length(xs: List<&2, U32>) -> Nat:
  List.length(&2, U32, xs)

def list_reverse(xs: List<&2, U32>) -> List<&2, U32>:
  List.reverse(&2, U32, xs)

def list_append(xs: List<&2, U32>, ys: List<&2, U32>) -> List<&2, U32>:
  List.append(&2, U32, xs, ys)

def list_head(xs: List<&2, U32>) -> Maybe<&2, U32>:
  List.head(&2, U32, xs)

def list_tail(xs: List<&2, U32>) -> List<&2, U32>:
  List.tail(&2, U32, xs)

def list_get(xs: List<&2, U32>, n: Nat) -> Maybe<&2, U32>:
  List.get(&2, U32, xs, n)

def list_take(xs: List<&2, U32>, n: Nat) -> List<&2, U32>:
  List.take(&2, U32, xs, n)

def list_drop(xs: List<&2, U32>, n: Nat) -> List<&2, U32>:
  List.drop(&2, U32, xs, n)

def list_is_empty(xs: List<&2, U32>) -> Bool:
  List.is_empty(&2, U32, xs)

def list_range(n: Nat) -> List<&2, Nat>:
  List.range(n)

def list_concat(xss: List<&2, List<&2, U32>>) -> List<&2, U32>:
  List.concat(&2, U32, xss)

def triple(x: U32) -> U32:
  (x * 3 : U32)

def is_small(x: U32) -> Bool:
  U32.is_lt(x, 50)

def le(a: U32, b: U32) -> Bool:
  U32.is_le(a, b)

def list_map(xs: List<U32>) -> List<U32>:
  List.map(~U32, ~U32, ~triple, xs)

def list_filter(xs: List<&2, U32>) -> List<&2, U32>:
  List.filter(~U32, ~is_small, xs)

def list_sort(xs: List<&2, U32>) -> List<&2, U32>:
  List.sort(~U32, ~le, xs)

def maybe_default(m: Maybe<&2, U32>, d: U32) -> U32:
  Maybe.default(&2, U32, m, d)

def maybe_or(m: Maybe<&2, U32>, n: Maybe<&2, U32>) -> Maybe<&2, U32>:
  Maybe.or(&2, U32, m, n)

def maybe_is_some(m: Maybe<&2, U32>) -> Bool:
  Maybe.is_some(&2, U32, m)

def pair_swap(p: U32 & String) -> String & U32:
  (a, b) = p
  (b, a)

def closure_add(a: U32, b: U32) -> U32:
  f = U32.add(a)
  f(b)

def map_fill(xs: List<&2, String>, m: Map<&2, U32>, +i: U32) -> Map<&2, U32>:
  match xs:
    case Nil{}:
      m
    case Con{k, t}:
      map_fill(t, Map.set(&2, U32, m, k, i), (i + 1 : U32))

def map_snd(r: Map<&2, U32> & U32) -> U32:
  (m, v) = r
  v

def map_get(ks: List<&2, String>, k: String) -> U32:
  map_snd(Map.get(U32, 4000000000, map_fill(ks, Map.new(&2, U32), 0), k))

def map_keys(ks: List<&2, String>) -> List<&2, String>:
  Map.keys(&2, U32, map_fill(ks, Map.new(&2, U32), 0))

def arr_snd(r: Array<U32> & U32) -> U32:
  (a, v) = r
  v

def arr_set_get(i: U32, j: U32, v: U32) -> U32:
  arr_snd(Array.get(U32, Array.set(U32, Array.new(U32, 3n, 5), i, v), j))

def arr_swap(i: U32, v: U32) -> U32:
  arr_snd(Array.swap(U32, Array.new(U32, 4n, 9), i, v))

def arr_size(d: Nat) -> U32:
  arr_snd(Array.size(U32, Array.new(U32, Nat.mod(d, 9n), 1)))
