# bendweave

[English](README.md) · **中文**

把 [Bend 2](https://bend-lang.com/) 写的、经过证明的纯函数逻辑翻译成 Java 21 和 Rust。

bendweave 是独立的第三方项目，与 Bend 的开发者 HigherOrderCO 没有隶属或背书关系。

前端不是自己写的：Java / Rust 后端追加在 Bend 官方编译器 `comp.ts` 后面，解析、类型检查、擦除、
尾递归转循环、模式匹配降级都用官方实现。原则是**不能精确翻译的就在生成期拒绝，绝不近似**。

## 准备

```
tools/setup.sh          # 拉取固定版本的上游编译器到 vendor/bend（tag v2.0.40），并构建 build/bend2
```
需要：`bun`、本机 `bend`（版本须与 vendor 一致，不一致时 CLI 会警告）、JDK 21+、Rust（cargo）、
Lean v4.34.0（`elan toolchain install leanprover/lean4:v4.34.0`，`bend --verdict` 用它构建内核）。

## 用法

```
bun src/driver.ts logic.bend --java out/java --package com.x --class Logic
bun src/driver.ts logic.bend --rust out/rust --module logic
```

- **准入门槛**：生成前先跑 `bend <PROOF> --verdict`（用 Lean 证明过的内核复查证明），不是 `ALL PROOFS CHECK` 就拒绝生成。
  `<PROOF>` 是 `--proof` 指定的文件，否则是输入文件旁边的 `PROOF.bend`，否则是输入文件本身。`--no-verdict` 跳过。
- 导出：每个非 Base、已填充、非 IO、计算出值的 def（`public static` / `pub fn`）。Base 里被用到的辅助函数是私有的。
- 不导出：返回 `Type` 的 def、纯证明、**依赖 `@unsafe` 或外部（foreign）代码的 def**（会打印 warning；它们不在 Bend 的证明保证之内）。
- 生成代码依赖运行时库：Java 是 `runtime/java`（包 `bendweave.rt`，无第三方依赖），Rust 是 `runtime/rust`（crate `bendweave_rt`）。

完整例子见 `examples/order`（`./run.sh`：经门槛检查证明 → 生成 → Java 和 Rust 各调用一次）。

## 类型对应

| Bend | Java | Rust |
|---|---|---|
| `U32` | `int`（按无符号解释） | `u32` |
| `Nat` | `BigInteger`（无上限） | `Nat` = `num_bigint::BigUint` |
| `F32` | `float` | `f32` |
| `Bool` / `Unit` / `Cmp` | `boolean` / `Unit` / `Cmp` | `bool` / `()` / `Cmp` |
| `Char` | `int`（U32 码） | `u32` |
| `String` | `bendweave.rt.BStr`（`BStr.of("..")` / `toString()`） | `Str`（`Str::from("..")` / `to_string()`） |
| `A & B` | `Tuple<A, B>` | `(A, B)` |
| `A -> B` | `Fn<A, B>` | `Fun<A, B>`（只能调用一次） |
| `Array<T>` | `BArray<T>` | `Arr<T>` |
| 自定义 / Base 的 `type` | `sealed interface` + `record` | `enum`，值是 `Rc<…>` |

用到 `List` 时会额外生成互转函数：Java `listOf(java.util.List)` / `toJavaList(..)`，Rust `list_from(Vec)` / `list_to_vec(&..)`。

## 调用方需要知道的

- **深递归**：只有尾调用被编译成循环，其余递归用宿主栈。遍历长列表的非尾递归函数要放进大栈线程：
  Java `R.withStack(() -> Logic.f(x))`；Rust `bendweave_rt::with_stack(move || logic::f(n).to_string())`（这里 `n` 是数字；`Rc` 类的输入要在闭包里构造）。
  Rust 的值基于 `Rc`，不是 `Send`：`with_stack` 的闭包不能捕获 `Rc`，返回值也必须是 `Send` 的（如数字、`String`），所以要在闭包里构造输入，并在返回前把结果转成 `u32` 或 `String`。
  Rust 里很长的 `Rc` 链表在析构时也会递归，析构也要在这个线程里完成。
- **Array 原地修改**：Bend 的数组只有一个所有者，生成代码直接改。Java 调用方如果之后还要用传进去的 `BArray`，先拷贝。
- **每个生成的类 / 模块自带一份 `List`、`Maybe` 等类型**，两个生成类之间不能直接互传。
- **Nat 当循环计数器较慢**：`match n: case 1n+p` 每步一次大整数减法。实测 1 亿次循环：官方 JS 后端 0.08 秒，Java 1.0 秒，Rust 0.6 秒。
- **F32**：`+ - * / %`、`sqrt`、取整、`show` / `read` 与官方逐位一致；`sin` / `exp` 等超越函数依赖各平台 libm，
  不保证最后一位（Bend 自己的各后端之间也不保证）。
- **Nat 无上限**：Bend 官方运行时在 2^48 处报错终止，这里继续算（数学语义）。

## 不支持（生成期报错）

| 情况 | Java | Rust |
|---|---|---|
| 类型由值决定且携带数据（类型族，如 `Vec(n)`） | 支持（擦除为 `Object`） | 初版支持：值是 `Any`，见下 |
| 在另一个类型上递归的数据类型（`Gr<A>` 里含 `Gr<P<A, A>>`） | 支持 | 拒绝 |
| 按位匹配 U32 / F32 的内部 Word | 拒绝 | 拒绝 |
| 超过 254 个参数的 def | 拒绝 | 支持 |
| IO、foreign effect | 不翻译 | 不翻译 |

### Rust 里的类型族（初版）

类型为 `Vec(n)` 这类"由值算出的类型"的参数、返回值和字段，在 Rust 里是 `bendweave_rt::Any`。
调用方用 `rt::up(值)` 传入、`rt::down::<类型>(any)` 取出，例如 `Vec(2n)` 是 `rt::up((nat(1), (nat(2), ())))`，
取出时写 `rt::down::<(Nat, (Nat, ()))>(v)`。同一个 Bend 类型的两种写法（`Vec(1n)` 与 `Nat & Unit`）转换结果相同：
元组逐分量转换，闭包包一层。
已知限制：带类型参数的数据类型（如 `List<Vec(n)>`）作为整体放进 `Any` 时不做逐元素转换，
如果它在两处以不同写法出现，取出时会 fail-stop（报 "a value is not a …"），不会给出错误结果。
只用于证明的类型族（结果都是 `Unit` / `Empty` / 等式，如 `LE(a, b)`）在 Rust 里就是 `()`。

## 测试

```
tools/test-all.sh quick     # 几分钟
tools/test-all.sh           # 加上上游语料，约 10 分钟
```

| 层 | 工具 | 对照基准 |
|---|---|---|
| 运行时单元测试 | `RuntimeTest.java`、`cargo test` | 边界值；20 万个随机 F32 文本往返、整数→F32 舍入 |
| `main` 差分 | `tools/check.ts` | `bend file.bend`（检查器的归约结果，即 law 被证明时所依据的语义） |
| 大数 Nat | `tools/check.ts --expect` | 文件末尾 `#\|` 行里独立算出的期望值 |
| 随机输入、逐 def | `tools/fuzz.ts` | Bend 官方 JS 后端（覆盖检查器不计算的 F32） |
| law 属性测试 | `tools/fuzz.ts` | law 两边在随机点上必须相等（law 已在 Bend 中证明，所以不等就是翻译错误） |

`tests/fuzz/base_api.bend` 给每个内置运算包了一个单态 def，逐个与官方 JS 后端比较。
对你自己的代码跑：`bun tools/fuzz.ts PROOF.bend -n 32 --seed 7`。

## "无损"保证到哪一步

翻译器本身没有形式化证明（Bend 官方的 C / JS 后端也没有）。保证来自：`--verdict` 准入（证明本身由 Lean 证明过的内核复查）、
复用官方前端和降级、拒绝而非近似、以及上面几层差分测试。

## 升级 Bend

改 `tools/setup.sh` 里的 `TAG`，重新 `tools/setup.sh`，然后 `tools/test-all.sh`。后端依赖 `comp.ts` 的内部函数，升级后以测试为准。
