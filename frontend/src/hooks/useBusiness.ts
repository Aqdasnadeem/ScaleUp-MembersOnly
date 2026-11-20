"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getToken, me, type MeResponse } from "@/lib/api";

interface BusinessState {
  status: "idle" | "loading" | "ready" | "error";
  business: MeResponse | null;
}

const IDLE: BusinessState = { status: "idle", business: null };
const listeners = new Set<() => void>();
let state: BusinessState = IDLE;
let requestId = 0;

function setState(next: BusinessState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Call after login/logout, or after anything server-side that changes the business record a
// mounted Sidebar is already showing (e.g. a plan upgrade) - re-fetches at once if a token is
// still present, so an already-mounted subscriber (the login page unmounts Sidebar anyway) updates
// without needing a full page reload.
export function resetBusiness() {
  requestId += 1;
  setState(IDLE);
  if (getToken()) loadBusiness();
}

function loadBusiness() {
  if (!getToken() || state.status === "loading" || state.status === "ready") return;
  const current = ++requestId;
  setState({ status: "loading", business: null });
  me()
    .then((business) => {
      if (current === requestId) setState({ status: "ready", business });
    })
    .catch(() => {
      if (current === requestId) setState({ status: "error", business: null });
    });
}

export function useBusiness(enabled = true) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => IDLE);

  useEffect(() => {
    if (enabled) loadBusiness();
  }, [enabled]);

  return {
    business: snapshot.business,
    loading: enabled && (snapshot.status === "idle" || snapshot.status === "loading") && getToken() !== null,
    error: snapshot.status === "error",
  };
}
