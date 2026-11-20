/**
 * The plain, framework-free core of useAsyncAction.ts: the ref-based in-flight guard and the
 * loading/error transitions, expressed as ordinary setter callbacks instead of React state, so it
 * can be unit-tested with the existing `tsx --test` runner (no React renderer needed).
 */
export interface GuardState {
  inFlight: boolean;
}

export async function runGuarded<Args extends unknown[]>(
  state: GuardState,
  setLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
  action: (...args: Args) => Promise<void>,
  args: Args,
): Promise<void> {
  if (state.inFlight) return;                 // ignored even before the first setState re-renders
  state.inFlight = true;
  setLoading(true);
  setError(null);
  try {
    await action(...args);
  } catch (reason) {
    setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
  } finally {
    state.inFlight = false;
    setLoading(false);
  }
}
