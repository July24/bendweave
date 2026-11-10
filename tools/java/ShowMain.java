// Runs bendweave_main_text() of each class named on the command line and prints
// its text between markers, as `bend file.bend` prints main.
public final class ShowMain {
  public static void main(String[] args) throws Exception {
    for (String c : args) {
      System.out.println("@@@ " + c);
      StringBuilder out = new StringBuilder();
      Thread t = new Thread(null, () -> {
        try {
          Object s = Class.forName(c).getMethod("bendweave_main_text").invoke(null);
          out.append(s.toString());
        } catch (Throwable e) {
          Throwable r = e instanceof java.lang.reflect.InvocationTargetException ? e.getCause() : e;
          out.append("!!! ").append(r).append('\n');
        }
      }, "bend", 1L << 30);
      t.setDaemon(true);
      t.start();
      t.join(20000);
      synchronized (out) {
        System.out.print(t.isAlive() ? "!!! timeout\n" : out.toString());
      }
    }
    System.out.flush();
    System.exit(0);
  }
}
