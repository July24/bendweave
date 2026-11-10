package bendweave.rt;

import java.math.BigInteger;
import java.util.Arrays;

/**
 * Bend's String: an immutable list of Chars, each any U32 code (Bend does not
 * restrict a Char to the Unicode scalars). Taking the head or tail and putting a
 * Char in front are O(1): a value is a view of a shared buffer that holds the
 * Chars last first, and a cons writes past the view when nothing else has.
 */
public final class BStr {
  private static final class Buf {
    int[] a;
    int used;

    Buf(int[] a, int used) {
      this.a = a;
      this.used = used;
    }
  }

  public static final BStr EMPTY = new BStr(new Buf(new int[0], 0), 0);

  private final Buf b;
  private final int len;

  private BStr(Buf b, int len) {
    this.b = b;
    this.len = len;
  }

  /** A Java String as a Bend String; a lone surrogate becomes U+FFFD. */
  public static BStr of(String s) {
    int n = s.codePointCount(0, s.length());
    int[] a = new int[n];
    for (int i = 0, at = n - 1; i < s.length(); at--) {
      int c = s.codePointAt(i);
      a[at] = c >= 0xD800 && c <= 0xDFFF ? 0xFFFD : c;
      i += Character.charCount(c);
    }
    return new BStr(new Buf(a, n), n);
  }

  /** The Chars with these U32 codes, first to last. */
  public static BStr ofCodes(int... codes) {
    int n = codes.length;
    int[] a = new int[n];
    for (int i = 0; i < n; i++) a[n - 1 - i] = codes[i];
    return new BStr(new Buf(a, n), n);
  }

  public boolean isEmpty() { return len == 0; }

  public int size() { return len; }

  public BigInteger length() { return BigInteger.valueOf(len); }

  /** The first Char's code; the string is not empty. */
  public int head() { return b.a[len - 1]; }

  public BStr tail() { return new BStr(b, len - 1); }

  // the buffer of s with room for n more Chars past s: its own when s ends
  // where the buffer does, else a copy
  private static Buf room(BStr s, int n) {
    Buf b = s.b;
    if (b.used != s.len) {
      int[] a = new int[Math.max(8, (s.len + n) * 2)];
      System.arraycopy(b.a, 0, a, 0, s.len);
      return new Buf(a, s.len);
    }
    if (b.a.length < s.len + n) b.a = Arrays.copyOf(b.a, Math.max(8, (s.len + n) * 2));
    return b;
  }

  public static BStr cons(int c, BStr s) {
    synchronized (s.b) {
      Buf b = room(s, 1);
      b.a[s.len] = c;
      b.used = s.len + 1;
      return new BStr(b, s.len + 1);
    }
  }

  /** x followed by y. */
  public static BStr append(BStr x, BStr y) {
    if (x.len == 0) return y;
    int[] xs;
    synchronized (x.b) {
      xs = Arrays.copyOf(x.b.a, x.len);
    }
    synchronized (y.b) {
      Buf b = room(y, xs.length);
      System.arraycopy(xs, 0, b.a, y.len, xs.length);
      b.used = y.len + xs.length;
      return new BStr(b, b.used);
    }
  }

  /** The codes, first to last. */
  public int[] codes() {
    int[] out = new int[len];
    synchronized (b) {
      for (int i = 0; i < len; i++) out[i] = b.a[len - 1 - i];
    }
    return out;
  }

  public static boolean contains(BStr s, BStr p) {
    int[] a = s.codes(), q = p.codes();
    outer:
    for (int i = 0; i + q.length <= a.length; i++) {
      for (int j = 0; j < q.length; j++) {
        if (a[i + j] != q[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  /** As a Java String; a Char that is no Unicode scalar becomes U+FFFD, as Bend prints it. */
  @Override public String toString() {
    StringBuilder sb = new StringBuilder(len);
    for (int c : codes()) {
      sb.appendCodePoint(Integer.compareUnsigned(c, 0xD800) < 0 || (c >= 0xE000 && c <= 0x10FFFF) ? c : 0xFFFD);
    }
    return sb.toString();
  }

  @Override public boolean equals(Object o) {
    return o instanceof BStr s && s.len == len && Arrays.equals(codes(), s.codes());
  }

  @Override public int hashCode() { return Arrays.hashCode(codes()); }
}
