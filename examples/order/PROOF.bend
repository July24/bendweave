import Base
import ./order.bend as Order
import ./LAWS.bend as Laws

def Laws.cancelled_is_final(e):
  match e:
    case Order.Pay{}:
      {==}
    case Order.Ship{}:
      {==}
    case Order.Cancel{}:
      {==}

def Laws.shipped_is_final(e):
  match e:
    case Order.Pay{}:
      {==}
    case Order.Ship{}:
      {==}
    case Order.Cancel{}:
      {==}

def Laws.no_ship_unpaid():
  {==}

def Laws.full_discount_is_free():
  {==}
