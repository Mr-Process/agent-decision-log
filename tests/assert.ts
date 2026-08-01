export function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message} | Expected: ${expected}, Got: ${actual}`);
  }
  console.log(`  ✓ ${message}`);
}

export function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message} | Condition was false`);
  }
  console.log(`  ✓ ${message}`);
}
