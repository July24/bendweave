import Base
import ./order.bend as Order

# a cancelled order stays cancelled, whatever happens next
law cancelled_is_final:
  for e: Order.Action
  {Order.step(Order.Cancelled{}, e) == Order.Cancelled{} : Order.Status}

# a shipped order cannot be cancelled or paid again
law shipped_is_final:
  for e: Order.Action
  {Order.step(Order.Shipped{}, e) == Order.Shipped{} : Order.Status}

# nothing ships unpaid
law no_ship_unpaid:
  {Order.step(Order.Created{}, Order.Ship{}) == Order.Created{} : Order.Status}

# a full discount is free
law full_discount_is_free:
  {Order.discounted(250n, 100n) == 0n : Nat}
