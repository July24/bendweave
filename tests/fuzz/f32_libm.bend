# libm-backed F32 operations. Bend's own lanes may differ in the last bit here
# (WONTFIX), so a difference in this file is reported but is not a translation bug.
import Base

def f32_exp(a: F32) -> F32:
  F32.exp(a)

def f32_log(a: F32) -> F32:
  F32.log(a)

def f32_log2(a: F32) -> F32:
  F32.log2(a)

def f32_log10(a: F32) -> F32:
  F32.log10(a)

def f32_sin(a: F32) -> F32:
  F32.sin(a)

def f32_cos(a: F32) -> F32:
  F32.cos(a)

def f32_tan(a: F32) -> F32:
  F32.tan(a)

def f32_asin(a: F32) -> F32:
  F32.asin(a)

def f32_acos(a: F32) -> F32:
  F32.acos(a)

def f32_atan(a: F32) -> F32:
  F32.atan(a)

def f32_sinh(a: F32) -> F32:
  F32.sinh(a)

def f32_cosh(a: F32) -> F32:
  F32.cosh(a)

def f32_tanh(a: F32) -> F32:
  F32.tanh(a)

def f32_atan2(a: F32, b: F32) -> F32:
  F32.atan2(a, b)

def f32_pow(a: F32, b: F32) -> F32:
  F32.pow(a, b)

def f32_hypot(a: F32, b: F32) -> F32:
  F32.hypot(a, b)
