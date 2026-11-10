package bendweave.rt;

/** A runtime fail-stop: a state Bend's checker proves unreachable, or a resource limit. */
public final class BendPanic extends RuntimeException {
  public BendPanic(String msg) { super("bend: " + msg); }
}
