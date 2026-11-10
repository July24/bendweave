import java.math.BigInteger;
import java.util.List;
import bendweave.rt.BStr;
import demo.order.Order;
import demo.order.Order.Action;
import demo.order.Order.Line;
import demo.order.Order.Status;

public class Demo {
  public static void main(String[] args) {
    // the proven state machine, called from plain Java
    Status s = Order.replay(Order.listOf(List.of(new Action.Pay(), new Action.Cancel(), new Action.Ship())), new Status.Created());
    System.out.println("status: " + s);
    var lines = Order.<Line>listOf(List.of(
        new Line.Line_(BStr.of("keyboard"), 4999, 2),
        new Line.Line_(BStr.of("cable"), 799, 3)));
    System.out.println("total at 15% off: " + Order.total(lines, BigInteger.valueOf(15)));
    // a state Bend proved impossible to leave
    System.out.println("cancelled then paid: " + Order.step(new Status.Cancelled(), new Action.Pay()));
  }
}
