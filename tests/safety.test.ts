import assert from "node:assert/strict";
import test from "node:test";
import {
  UnsafeTaskError,
  assertSafeTask,
  detectUnsafeTask,
  normalizeTaskSafetyResult
} from "@/lib/analysis/safety";

test("detectUnsafeTask flags electrical repair requests", () => {
  const result = detectUnsafeTask({
    taskTitle: "Replace a breaker in an electrical panel",
    description: "Show the wires and the live circuit."
  });

  assert.equal(result.unsafe, true);
  assert.match(result.reason ?? "", /electrical repair/i);
});

test("assertSafeTask throws for unsafe tasks", () => {
  assert.throws(
    () =>
      assertSafeTask({
        taskTitle: "How to inject medication",
        description: "Show the syringe angle."
      }),
    UnsafeTaskError
  );
});

test("detectUnsafeTask does not flag a harmless bottle-opening tutorial", () => {
  const result = detectUnsafeTask({
    taskTitle: "Open a bottle",
    description: "Show how to loosen the cap and pour into a glass."
  });

  assert.equal(result.unsafe, false);
  assert.equal(result.reason, null);
});

test("normalizeTaskSafetyResult rejects malformed safety output", () => {
  const result = normalizeTaskSafetyResult({
    reason: null
  });

  assert.equal(result.unsafe, true);
  assert.match(result.reason ?? "", /could not verify/i);
});
