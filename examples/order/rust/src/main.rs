mod order;
use bendweave_rt::{nat, Str};
use order::{Action, Line, Status};
use std::rc::Rc;

fn main() {
    let events = order::list_from(vec![Rc::new(Action::Pay {}), Rc::new(Action::Cancel {}), Rc::new(Action::Ship {})]);
    println!("status: {:?}", order::replay(events, Rc::new(Status::Created {})));
    let lines = order::list_from(vec![
        Rc::new(Line::Line { name: Str::from("keyboard"), price: 4999, qty: 2 }),
        Rc::new(Line::Line { name: Str::from("cable"), price: 799, qty: 3 }),
    ]);
    println!("total at 15% off: {}", order::total(lines, nat(15)));
    println!("cancelled then paid: {:?}", order::step(Rc::new(Status::Cancelled {}), Rc::new(Action::Pay {})));
}
