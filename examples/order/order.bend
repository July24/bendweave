# Business logic: an order's state machine and its total, as pure functions.
import Base

type Status is Data:
  Created{}
  Paid{}
  Shipped{}
  Cancelled{}

type Action is Data:
  Pay{}
  Ship{}
  Cancel{}

type Line is Data:
  Line{name: String, price: U32, qty: U32}

def step(s: Status, e: Action) -> Status:
  match s e:
    case Created{} Pay{}:
      Paid{}
    case Created{} Cancel{}:
      Cancelled{}
    case Paid{} Ship{}:
      Shipped{}
    case Paid{} Cancel{}:
      Cancelled{}
    case s e:
      s

def replay(es: List<Action>, s: Status) -> Status:
  match es:
    case Nil{}:
      s
    case Con{e, t}:
      replay(t, step(s, e))

def subtotal(ls: List<Line>, acc: Nat) -> Nat:
  match ls:
    case Nil{}:
      acc
    case Con{Line{name, price, qty}, t}:
      subtotal(t, Nat.add(acc, Nat.mul(U32.to_nat(price), U32.to_nat(qty))))

# percent off, capped at 100
def discounted(total: Nat, percent: Nat) -> Nat:
  Nat.div(Nat.mul(total, Nat.sub(100n, percent)), 100n)

def total(ls: List<Line>, percent: Nat) -> Nat:
  discounted(subtotal(ls, 0n), percent)
