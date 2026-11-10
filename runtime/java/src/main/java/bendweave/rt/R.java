package bendweave.rt;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Bend's native operations, bit-for-bit as Bend's JS lane runs them (bend2/comp.ts,
 * OPERATIONS and RUNTIME), except Nat, which is unbounded here (BigInteger).
 * U32 is a Java int read as unsigned; Char is its U32 code; String is BStr.
 */
public final class R {
  private R() {}

  public static BendPanic absurd() { return new BendPanic("runtime fail-stop"); }

  /**
   * Runs f on a thread with a 1 GB stack and returns its result. Generated code
   * recurses as Bend does (only tail calls are loops), so a call that walks a
   * long list needs more stack than a JVM thread has by default.
   */
  public static <T> T withStack(Supplier<T> f) { return withStack(1L << 30, f); }

  public static <T> T withStack(long stackBytes, Supplier<T> f) {
    Object[] out = new Object[1];
    Throwable[] err = new Throwable[1];
    Thread t = new Thread(null, () -> {
      try {
        out[0] = f.get();
      } catch (Throwable e) {
        err[0] = e;
      }
    }, "bend", stackBytes);
    t.start();
    try {
      t.join();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new BendPanic("interrupted");
    }
    if (err[0] instanceof RuntimeException e) throw e;
    if (err[0] instanceof Error e) throw e;
    @SuppressWarnings("unchecked") T r = (T) out[0];
    return r;
  }

  public static Cmp cmp(int c) { return c < 0 ? Cmp.LT : c == 0 ? Cmp.EQ : Cmp.GT; }

  public static <M> M opt(Float v, Supplier<M> none, Function<Float, M> some) {
    return v == null ? none.get() : some.apply(v);
  }

  // U32
  // ===

  public static int u32Div(int a, int b) { return b == 0 ? 0 : Integer.divideUnsigned(a, b); }

  public static int u32Mod(int a, int b) { return b == 0 ? a : Integer.remainderUnsigned(a, b); }

  // Java's << reads the shift mod 32; Bend shifts the bits out
  public static int u32Shln(int a, BigInteger n) {
    return n.compareTo(BigInteger.valueOf(32)) >= 0 ? 0 : a << n.intValue();
  }

  public static int u32Shrn(int a, BigInteger n) {
    return n.compareTo(BigInteger.valueOf(32)) >= 0 ? 0 : a >>> n.intValue();
  }

  public static Cmp u32Cmp(int a, int b) { return cmp(Integer.compareUnsigned(a, b)); }

  public static float u32ToF32(int a) { return (float) Integer.toUnsignedLong(a); }

  public static BigInteger u32ToNat(int a) { return BigInteger.valueOf(Integer.toUnsignedLong(a)); }

  // Nat
  // ===

  public static BigInteger natSub(BigInteger a, BigInteger b) {
    return a.compareTo(b) < 0 ? BigInteger.ZERO : a.subtract(b);
  }

  public static Tuple<BigInteger, BigInteger> natDivmod(BigInteger a, BigInteger b) {
    if (b.signum() == 0) return new Tuple<>(BigInteger.ZERO, a);
    BigInteger[] qr = a.divideAndRemainder(b);
    return new Tuple<>(qr[0], qr[1]);
  }

  // F32
  // ===
  // + - * / % sqrt floor ceil trunc abs are exact IEEE single operations; the
  // transcendental ones use StrictMath (fdlibm) and may differ from another
  // lane's libm in the last bit, as Bend's own lanes may (WONTFIX).

  public static float f32_sqrt(float x) { return (float) Math.sqrt(x); }
  public static float f32_exp(float x) { return (float) StrictMath.exp(x); }
  public static float f32_log(float x) { return (float) StrictMath.log(x); }
  public static float f32_log2(float x) { return (float) (StrictMath.log(x) / StrictMath.log(2.0)); }
  public static float f32_log10(float x) { return (float) StrictMath.log10(x); }
  public static float f32_sin(float x) { return (float) StrictMath.sin(x); }
  public static float f32_cos(float x) { return (float) StrictMath.cos(x); }
  public static float f32_tan(float x) { return (float) StrictMath.tan(x); }
  public static float f32_asin(float x) { return (float) StrictMath.asin(x); }
  public static float f32_acos(float x) { return (float) StrictMath.acos(x); }
  public static float f32_atan(float x) { return (float) StrictMath.atan(x); }
  public static float f32_sinh(float x) { return (float) StrictMath.sinh(x); }
  public static float f32_cosh(float x) { return (float) StrictMath.cosh(x); }
  public static float f32_tanh(float x) { return (float) StrictMath.tanh(x); }
  public static float f32_floor(float x) { return (float) Math.floor(x); }
  public static float f32_ceil(float x) { return (float) Math.ceil(x); }
  public static float f32_trunc(float x) { return x < 0 ? (float) Math.ceil(x) : (float) Math.floor(x); }
  public static float f32_abs(float x) { return Math.abs(x); }
  public static float f32_atan2(float y, float x) { return (float) StrictMath.atan2(y, x); }

  // IEEE's pow(1, y) and pow(-1, inf) are 1, as the JS lane patches
  public static float f32_pow(float a, float b) {
    if (a == 1 || (a == -1 && Float.isInfinite(b))) return 1;
    return (float) StrictMath.pow(a, b);
  }

  public static int f32ToU32(float x) {
    return x >= 1 && x < 4294967296.0f ? (int) (long) Math.floor(x) : 0;
  }

  /** The decimal s, correctly rounded to the nearest float (ties to even). */
  public static float f32Round(String s) {
    BigDecimal x = new BigDecimal(s);
    float f = (float) x.doubleValue();
    if (Float.isInfinite(f)) {
      BigDecimal max = new BigDecimal(Float.MAX_VALUE);
      BigDecimal half = new BigDecimal(Math.ulp(Float.MAX_VALUE)).divide(BigDecimal.TWO);
      return x.abs().compareTo(max.add(half)) >= 0 ? f : Math.copySign(Float.MAX_VALUE, f);
    }
    float best = f;
    BigDecimal bd = x.subtract(new BigDecimal(f)).abs();
    for (float c : new float[] {Math.nextUp(f), Math.nextDown(f)}) {
      if (Float.isInfinite(c)) continue;
      BigDecimal d = x.subtract(new BigDecimal(c)).abs();
      int k = d.compareTo(bd);
      if (k < 0 || (k == 0 && (Float.floatToRawIntBits(c) & 1) == 0)) {
        best = c;
        bd = d;
      }
    }
    return best == 0 && x.signum() < 0 ? -0.0f : best;
  }

  private static final Pattern F32_RE = Pattern.compile(
      "^[\\t\\n\\u000B\\f\\r ]*[+-]?((\\d+(?:\\.\\d*)?|\\.\\d+)(e[+-]?\\d+)?|inf(inity)?|nan)$",
      Pattern.CASE_INSENSITIVE);

  /** F32.read: the float, or null for None. */
  public static Float f32Read(String s) {
    if (!F32_RE.matcher(s).matches()) return null;
    String t = s.strip();
    String low = t.toLowerCase();
    boolean neg = low.startsWith("-");
    String body = low.replaceFirst("^[+-]", "");
    if (body.equals("nan")) return Float.NaN;
    if (body.startsWith("inf")) return neg ? Float.NEGATIVE_INFINITY : Float.POSITIVE_INFINITY;
    if (body.startsWith(".")) body = "0" + body;
    body = body.replace(".e", ".0e");
    if (body.endsWith(".")) body = body + "0";
    float f = f32Round(body);
    return neg ? -f : f;
  }

  /** F32.show: the shortest decimal that reads back to x, in JS's Number format. */
  public static String f32Show(float x) {
    if (Float.isNaN(x)) return "nan";
    if (Float.isInfinite(x)) return x > 0 ? "inf" : "-inf";
    if (x == 0) return Float.floatToRawIntBits(x) < 0 ? "-0" : "0";
    BigDecimal exact = new BigDecimal((double) x);
    for (int p = 1; p <= 9; p++) {
      BigDecimal r = exact.round(new MathContext(p, RoundingMode.HALF_UP)).stripTrailingZeros();
      if (f32Round(r.toString()) == x) return jsNumber(r);
    }
    return jsNumber(exact.round(new MathContext(9, RoundingMode.HALF_UP)).stripTrailingZeros());
  }

  // ECMAScript Number::toString of a decimal with at most 17 digits
  private static String jsNumber(BigDecimal v) {
    String sign = v.signum() < 0 ? "-" : "";
    BigDecimal a = v.abs();
    String digits = a.unscaledValue().toString();
    int k = digits.length();
    int n = k - a.scale(); // a = 0.digits * 10^n
    String out;
    if (k <= n && n <= 21) {
      out = digits + "0".repeat(n - k);
    } else if (0 < n && n <= 21) {
      out = digits.substring(0, n) + "." + digits.substring(n);
    } else if (-6 < n && n <= 0) {
      out = "0." + "0".repeat(-n) + digits;
    } else {
      int e = n - 1;
      out = digits.charAt(0) + (k > 1 ? "." + digits.substring(1) : "") + "e" + (e < 0 ? "-" : "+") + Math.abs(e);
    }
    return sign + out;
  }
}
