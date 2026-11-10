package bendweave.rt;

import java.math.BigInteger;

/** Unit tests of the runtime; no test framework: run main, it exits 1 on a failure. */
public final class RuntimeTest {
  static int fails = 0;

  static void eq(Object got, Object want, String what) {
    if (!java.util.Objects.equals(got, want)) {
      fails++;
      System.out.println("FAIL " + what + ": got " + got + ", want " + want);
    }
  }

  static BigInteger big(int bits) { return BigInteger.ONE.shiftLeft(bits); }

  static BigInteger nat(long n) { return BigInteger.valueOf(n); }

  public static void main(String[] args) {
    // U32
    eq(R.u32Div(7, 0), 0, "div by 0");
    eq(R.u32Mod(7, 0), 7, "mod by 0");
    eq(R.u32Div(-1, 2), 0x7FFFFFFF, "unsigned div");
    eq(R.u32Mod(-1, 10), 5, "unsigned mod");
    eq(R.u32Shln(1, nat(31)), 1 << 31, "shln 31");
    eq(R.u32Shln(-1, nat(32)), 0, "shln 32");
    eq(R.u32Shln(-1, big(70)), 0, "shln 2^70");
    eq(R.u32Shrn(-1, nat(31)), 1, "shrn 31");
    eq(R.u32Shrn(-1, nat(32)), 0, "shrn 32");
    eq(R.u32Shrn(-1, big(70)), 0, "shrn 2^70");
    eq(R.u32Cmp(-1, 1), Cmp.GT, "unsigned cmp");
    eq(R.u32ToNat(-1), nat(4294967295L), "to_nat");
    eq(R.u32ToF32(-1), 4294967296.0f, "to_f32");
    eq(big(100).add(nat(12345)).intValue(), 12345, "from_nat keeps the low 32 bits");
    // Nat
    BigInteger a = big(100);
    eq(R.natSub(nat(3), a), BigInteger.ZERO, "sub floors at 0");
    eq(R.natSub(a, nat(3)).add(nat(3)), a, "sub");
    eq(R.natDivmod(a, BigInteger.ZERO), new Tuple<>(BigInteger.ZERO, a), "divmod by 0");
    Tuple<BigInteger, BigInteger> qr = R.natDivmod(a, nat(7));
    eq(qr.fst().multiply(nat(7)).add(qr.snd()), a, "divmod");
    // F32 text
    Object[][] shows = {{0.1f, "0.1"}, {16777216.0f, "16777216"}, {1e21f, "1e+21"}, {1.5e22f, "1.5e+22"}, {1e-7f, "1e-7"},
        {0.000001f, "0.000001"}, {Float.MAX_VALUE, "3.4028235e+38"}, {-0.0f, "-0"}, {-2.5f, "-2.5"},
        {Float.POSITIVE_INFINITY, "inf"}, {Float.NEGATIVE_INFINITY, "-inf"}, {1.0f / 3.0f, "0.33333334"},
        {Float.MIN_NORMAL, "1.1754944e-38"}, {Float.NaN, "nan"}};
    for (Object[] s : shows) {
      eq(R.f32Show((Float) s[0]), s[1], "show " + s[1]);
      eq(Float.floatToIntBits(R.f32Read((String) s[1])), Float.floatToIntBits((Float) s[0]), "read " + s[1]);
    }
    for (String s : new String[] {"", ".", "e5", "1e", "1e+", "1x", " 1 ", "0x10", "--1", "1.5.2", "infin"}) {
      eq(R.f32Read(s), null, "read refuses \"" + s + "\"");
    }
    Object[][] reads = {{" \t1.5", 1.5f}, {"+.5", 0.5f}, {"5.", 5.0f}, {"1E2", 100.0f}, {"-Infinity", Float.NEGATIVE_INFINITY},
        {"1e400", Float.POSITIVE_INFINITY}, {"16777217", 16777216.0f}, {"16777219", 16777220.0f}, {"1e-50", 0.0f}};
    for (Object[] s : reads) eq(R.f32Read((String) s[0]), s[1], "read \"" + s[0] + "\"");
    int x = 0x12345678;
    for (int i = 0; i < 200000; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      float v = Float.intBitsToFloat(x);
      if (Float.isNaN(v) || Float.isInfinite(v)) continue;
      String s = R.f32Show(v);
      Float back = R.f32Read(s);
      if (back == null || Float.floatToRawIntBits(back) != x) eq(back, v, "round trip of " + s);
      // the JDK's own correctly rounded parse agrees
      if (Float.floatToRawIntBits(Float.parseFloat(s)) != x) eq(Float.parseFloat(s), v, "JDK parse of " + s);
    }
    eq(R.f32ToU32(4e9f), (int) 4000000000L, "to_u32");
    eq(R.f32ToU32(-3.0f), 0, "to_u32 negative");
    eq(R.f32ToU32(5e9f), 0, "to_u32 too big");
    eq(R.f32ToU32(Float.NaN), 0, "to_u32 nan");
    eq(R.f32_pow(1f, Float.NaN), 1f, "pow(1, nan)");
    eq(R.f32_trunc(-1.5f), -1.0f, "trunc");
    // BStr
    BStr s = BStr.of("abc");
    BStr p = BStr.cons('x', s), q = BStr.cons('y', s);
    eq(p + "|" + q + "|" + s, "xabc|yabc|abc", "two conses on one string");
    eq(p.head(), (int) 'x', "head");
    BStr z = BStr.cons('z', p.tail());
    eq(z + "|" + p, "zabc|xabc", "cons on a tail");
    eq(BStr.append(s, s) + "|" + s, "abcabc|abc", "append to itself");
    eq(BStr.append(BStr.EMPTY, s), s, "append empty");
    eq(BStr.append(s, BStr.EMPTY), s, "append to empty");
    eq(BStr.EMPTY.isEmpty() && BStr.append(BStr.EMPTY, BStr.EMPTY).isEmpty(), true, "empty stays empty");
    eq(BStr.cons('q', BStr.EMPTY) + "|" + BStr.EMPTY, "q|", "cons on the shared empty");
    eq(BStr.contains(s, BStr.of("bc")) && BStr.contains(s, BStr.EMPTY) && !BStr.contains(s, BStr.of("cb")), true, "contains");
    eq(BStr.ofCodes(0xD800, 65, 0x110000, -1).toString(), "\uFFFDA\uFFFD\uFFFD", "non-scalars print as U+FFFD");
    eq(BStr.ofCodes(0xD800).equals(BStr.ofCodes(0xDC00)), false, "non-scalars stay distinct");
    eq(BStr.of("世界😀").length(), nat(3), "length counts Chars");
    eq(BStr.of("a\uD800b").toString(), "a\uFFFDb", "a lone surrogate comes in as U+FFFD");
    eq(BStr.of("héllo").hashCode() == BStr.append(BStr.of("hé"), BStr.of("llo")).hashCode(), true, "hash by content");
    BStr l = BStr.EMPTY;
    for (int i = 0; i < 2000000; i++) l = BStr.cons(i, l);
    long n = 0;
    while (!l.isEmpty()) {
      n += l.head();
      l = l.tail();
    }
    eq(n, 1999999L * 2000000 / 2, "2e6 conses and tails");
    // BArray
    BArray<Integer> arr = BArray.make(nat(3), 5).set(13, 7);
    eq(arr.getT(5).snd(), 7, "index wraps");
    eq(arr.getT(-3).snd(), 7, "index is unsigned");
    eq(arr.swap(21, 9).snd(), 7, "swap returns the old value");
    eq(arr.sizeT().snd(), 8, "size");
    eq(BArray.node(arr.lo(), arr.hi()), arr, "split and join");
    // stack
    eq(R.withStack(() -> depth(2000000)), 2000000, "withStack");
    System.out.println(fails == 0 ? "runtime tests ok" : fails + " runtime tests failed");
    System.exit(fails == 0 ? 0 : 1);
  }

  static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
}
