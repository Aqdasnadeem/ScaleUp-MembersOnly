"use client";

import { useCallback, useRef, useState } from "react";
import { runGuarded, type GuardState } from "./asyncActionGuard";

/**
 * Wraps an async action with a loading flag and a ref-based in-flight guard: a second call while
 * the first is still running is ignored outright (checked before any setState, so it is safe even
 * across the same synchronous event). `loading` always resets in `finally`, success or error.
 *
 * `error` is a generic fallback message for callers that do not manage their own error state
 * (most admin actions). A caller with its own richer error handling (e.g. upload's 402 message)
 * can keep catching inside its own action and ignore this `error` - it will simply stay null.
 */
export function useAsyncAction<Args extends unknown[] = []>(action: (...args: Args) => Promise<void>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<GuardState>({ inFlight: false });

  const run = useCallback(
    (...args: Args) => runGuarded(stateRef.current, setLoading, setError, action, args),
    [action],
  );

  return { run, loading, error };
}
