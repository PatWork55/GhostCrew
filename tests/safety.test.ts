import assert from "node:assert/strict";
import test from "node:test";
import {
  UnsafeTaskError,
  assertSafeTask,
  detectUnsafeTask
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
