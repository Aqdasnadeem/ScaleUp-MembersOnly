import assert from "node:assert/strict";
import { test } from "node:test";
import { runGuarded, type GuardState } from "./asyncActionGuard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a second call while the first is running is ignored", async () => {
  const state: GuardState = { inFlight: false };
  const loadingCalls: boolean[] = [];
  const errorCalls: Array<string | null> = [];
  let callCount = 0;
  const first = deferred<void>();

  const action = () => {
    callCount += 1;
    return first.promise;
  };

  const firstRun = runGuarded(state, (v) => loadingCalls.push(v), (v) => errorCalls.push(v), action, []);
  assert.equal(state.inFlight, true);

  // Called again while the first is still in flight: must be a no-op, not a second action call.
  await runGuarded(state, (v) => loadingCalls.push(v), (v) => errorCalls.push(v), action, []);
  assert.equal(callCount, 1);

  first.resolve();
  await firstRun;

  assert.equal(callCount, 1);
  assert.equal(state.inFlight, false);
  assert.deepEqual(loadingCalls, [true, false]);       // loading set once by the ignored call never happened
  assert.deepEqual(errorCalls, [null]);
});

test("loading resets after an error, and a later call is allowed", async () => {
  const state: GuardState = { inFlight: false };
  const loadingCalls: boolean[] = [];
  const errorCalls: Array<string | null> = [];
  let callCount = 0;

  const failingAction = async () => {
    callCount += 1;
    throw new Error("boom");
  };

  await runGuarded(state, (v) => loadingCalls.push(v), (v) => errorCalls.push(v), failingAction, []);

  assert.equal(state.inFlight, false);                 // the guard is released even on failure
  assert.deepEqual(loadingCalls, [true, false]);
  assert.deepEqual(errorCalls, [null, "boom"]);

  // Now that the guard is released, a second call must actually run.
  await runGuarded(state, (v) => loadingCalls.push(v), (v) => errorCalls.push(v), failingAction, []);
  assert.equal(callCount, 2);
});

test("a non-Error rejection gets the generic fallback message", async () => {
  const state: GuardState = { inFlight: false };
  const errorCalls: Array<string | null> = [];

  await runGuarded(state, () => {}, (v) => errorCalls.push(v), async () => {
    throw "a plain string rejection";
  }, []);

  assert.deepEqual(errorCalls, [null, "Something went wrong. Please try again."]);
});

test("arguments are forwarded to the wrapped action", async () => {
  const state: GuardState = { inFlight: false };
  const seen: unknown[] = [];

  await runGuarded(state, () => {}, () => {}, async (a: number, b: string) => {
    seen.push(a, b);
  }, [7, "skip"]);

  assert.deepEqual(seen, [7, "skip"]);
});
