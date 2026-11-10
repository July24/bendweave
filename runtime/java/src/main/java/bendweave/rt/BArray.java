package bendweave.rt;

import java.math.BigInteger;
import java.util.Arrays;

/**
 * Bend's {@code Array<T>}: 2^d slots, indexes wrap. A Bend array has one owner
 * (it is affine), so writes happen in place, as in Bend's own runtimes. A Java
 * caller that keeps an array it passed in must copy it first.
 */
public final class BArray<T> {
  private final Object[] a;

  private BArray(Object[] a) { this.a = a; }

  public static <T> BArray<T> make(BigInteger depth, T v) {
    if (depth.compareTo(BigInteger.valueOf(30)) > 0) {
      throw new BendPanic("an array past depth 30 (the JVM's array limit)");
    }
    Object[] a = new Object[1 << depth.intValue()];
    Arrays.fill(a, v);
    return new BArray<>(a);
  }

  /** Wraps a Java array, which must have a power-of-two length; it is not copied. */
  public static <T> BArray<T> wrap(T[] a) {
    if (a.length == 0 || (a.length & (a.length - 1)) != 0) {
      throw new IllegalArgumentException("a Bend array has 2^d slots");
    }
    return new BArray<>(a);
  }

  public static <T> BArray<T> leaf(T v) { return new BArray<>(new Object[] {v}); }

  public static <T> BArray<T> node(BArray<T> x, BArray<T> y) {
    if (x.a.length != y.a.length) throw new BendPanic("runtime fail-stop");
    Object[] a = Arrays.copyOf(x.a, x.a.length * 2);
    System.arraycopy(y.a, 0, a, x.a.length, y.a.length);
    return new BArray<>(a);
  }

  public int size() { return a.length; }

  public T get(int i) { return (T) a[i]; }

  public BArray<T> lo() { return new BArray<>(Arrays.copyOfRange(a, 0, a.length >> 1)); }

  public BArray<T> hi() { return new BArray<>(Arrays.copyOfRange(a, a.length >> 1, a.length)); }

  private int at(int i) { return Integer.remainderUnsigned(i, a.length); }

  public BArray<T> set(int i, T v) { a[at(i)] = v; return this; }

  public Tuple<BArray<T>, T> getT(int i) { return new Tuple<>(this, (T) a[at(i)]); }

  public Tuple<BArray<T>, T> swap(int i, T v) {
    int j = at(i);
    T old = (T) a[j];
    a[j] = v;
    return new Tuple<>(this, old);
  }

  public Tuple<BArray<T>, Integer> sizeT() { return new Tuple<>(this, a.length); }

  public Tuple<BArray<T>, BArray<T>> cloneT() { return new Tuple<>(this, new BArray<>(a.clone())); }

  public Object[] toArray() { return a.clone(); }

  @Override public boolean equals(Object o) { return o instanceof BArray<?> b && Arrays.equals(a, b.a); }

  @Override public int hashCode() { return Arrays.hashCode(a); }

  @Override public String toString() { return Arrays.toString(a); }
}
