import Base

def main() -> List<String>:
  +s = {"héllo, 世界 😀 \"q\" \\ end" : String}
  [s ++ "!", String.reverse(s), Nat.show(String.length(s)), U32.show(4294967295),
   SCon{Chr{55357}, SCon{Chr{4000000000}, "x"}}, String.reverse(SCon{Chr{56320}, SCon{Chr{1114112}, "ab"}})]
