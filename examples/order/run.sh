#!/bin/sh
# Proves the laws, generates Java and Rust from order.bend, and runs both callers.
set -e
cd "$(dirname "$0")"
ROOT=../..
JH=${JAVA_HOME_21:-$(/usr/libexec/java_home -v 21+ 2>/dev/null || echo "$JAVA_HOME")}
bun $ROOT/src/driver.ts order.bend --java java --package demo.order --class Order --rust rust/src --module order
rm -rf out && "$JH/bin/javac" -nowarn -d out $(find $ROOT/runtime/java/src/main -name '*.java') java/demo/order/Order.java java/Demo.java
echo "--- java"; "$JH/bin/java" -cp out Demo
echo "--- rust"; (cd rust && cargo run --quiet)
