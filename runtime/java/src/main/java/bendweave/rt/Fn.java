package bendweave.rt;

/** A Bend closure. Bend closures are affine: generated code calls each one at most once. */
@FunctionalInterface
public interface Fn<A, B> {
  B apply(A a);
}
