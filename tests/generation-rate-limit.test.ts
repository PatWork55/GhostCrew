import assert from "node:assert/strict";
import test from "node:test";
import {
  GenerationRateLimitError,
  reserveGeneratedInsertSlot
} from "@/lib/generation/generation-rate-limit";

test("reserveGeneratedInsertSlot blocks concurrent active requests for the same IP", () => {
  const release = reserveGeneratedInsertSlot("127.0.0.1", 4, 1_000);

  assert.throws(
    () => reserveGeneratedInsertSlot("127.0.0.1", 4, 1_100),
    GenerationRateLimitError
  );

  release(1_200);
});

test("reserveGeneratedInsertSlot enforces the hourly request cap and provides retry timing", () => {
  const firstRelease = reserveGeneratedInsertSlot("192.168.0.1", 2, 10_000);
  firstRelease(10_100);
  const secondRelease = reserveGeneratedInsertSlot("192.168.0.1", 2, 20_000);
  secondRelease(20_100);

  assert.throws(() => {
    try {
      reserveGeneratedInsertSlot("192.168.0.1", 2, 30_000);
    } catch (error) {
      assert.ok(error instanceof GenerationRateLimitError);
      assert.ok(error.retryAfterSeconds > 0);
      throw error;
    }
  }, GenerationRateLimitError);
});
