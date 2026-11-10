# bendweave 现状与后续

[English](PLAN.md) · **中文**

用法、类型对应、限制和测试方法见 [README_ZH.md](README_ZH.md)。这里只记录决策、测试结果和待办。

基线：Bend 2.0.40（`vendor/bend` 固定在 tag `v2.0.40`，由 `tools/setup.sh` 拉取，不入库）。

## 已定决策
| 项 | 决定 |
|---|---|
| 前端 | 不自己写解析器；后端文件由 `tools/build.ts` 拼接到上游 `comp.ts` 之后，共用其内部降级函数，不给上游打 patch |
| Nat | Java `BigInteger` / Rust `BigUint`，无上限 |
| Java 版本 | 21+ |
| 并行调用 | 生成顺序代码 |
| String | Java `bendweave.rt.BStr` / Rust `Str`：共享的反向缓冲区，cons / 取 head / 取 tail 都是 O(1) |
| `@unsafe` / foreign | 依赖它们的 def 不导出（逻辑同上游 `book_promises`） |
| 不能精确翻译 | 生成期拒绝，不近似 |
| 准入 | CLI 生成前跑 `bend <PROOF> --verdict`（Lean v4.34.0 已装在 `~/.elan`），不通过就拒绝；`--no-verdict` 跳过 |
| Rust 类型族 | 值是 `Any`，由 `rt::Dy` 给出统一的动态形式（元组逐分量、闭包包一层、其余原样） |

## 测试结果（`tools/test-all.sh`，全部通过）
| 项 | Java | Rust |
|---|---|---|
| 上游语料 `main` 差分（对检查器） | 200 一致 / 0 不一致 | 200 一致 / 0 不一致 |
| Base 内置运算模糊测试（168 个 def × 16 组随机输入，对官方 JS 后端） | 168 / 0 | 168 / 0 |
| 上游 proof 测试 + demo 的随机输入差分 | 373 一致 / 0 不一致 | 370 一致 / 0 不一致 |
| 同上，law 两边相等 | 105 条成立 | 105 条成立 |
| 大数 Nat（2^100 量级，对独立计算的期望值） | 一致 | 一致 |
| 运行时单元测试 | 通过 | 8 组通过 |

模糊测试里 6–7 个用例"超时 / 栈溢出"：随机到 2^31 量级的 U32 被转成 Nat 逐一递减或做非尾递归，是资源问题，不计为不一致。
变异测试：故意改坏 `u32Div`、`u32Shln` 后模糊测试立即报错。

模糊测试发现并已修的 bug：Rust 后端 `F32.read` 生成了不存在的枚举变体名。

## 后端拒绝的情况（上游语料中）
- Java：按位匹配 Word（4 个）、超过 254 个参数（1 个）。
- Rust：按位匹配 Word（4 个）、在另一个类型上递归的数据类型（`Gr<A>` 含 `Gr<P<A, A>>`，rustc 无法析构检查）。
- 其余约 300 个"拒绝"是官方编译器同样拒绝的（缺 `import Base`、与内置类型重名）、`main` 的类型无法打印（函数、Type），或依赖 `@unsafe`。

## 待办
1. `tools/check.ts` / `tools/fuzz.ts` 直接调库，不经过 `--verdict` 门槛（它们测的是翻译，不是证明）。
2. Rust 类型族初版的限制：带类型参数的数据类型放进 `Any` 时不逐元素转换，两种写法相遇会 fail-stop；需要给生成的 enum 生成逐字段的 `Dy` 实现。
3. Rust `with_stack` 只能返回 `Send` 的值，所以深递归计算无法把基于 `Rc` 的结果交回来。修法需要一个 `unsafe impl Send` 的包装，且只有在大栈线程运行期间没有其他线程碰这个值（调用方先 join）时才是安全的。
4. Nat 小值快速路径（现在每步一次大整数运算，比官方运行时慢约 10 倍）。
5. 多个生成类 / 模块共用一份 `List`、`Maybe` 等 Base 类型。
6. Maven / crates 打包；CI。
7. 把 law 原文写进生成代码的文档注释。
