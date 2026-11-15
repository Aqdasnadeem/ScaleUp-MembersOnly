"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "scaleup-sidebar-collapsed";
const CHANGE_EVENT = "scaleup:sidebar-preference";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerSnapshot() {
  return false;
}

export function useSidebarPreference() {
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setIsCollapsed = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const current = getSnapshot();
    window.localStorage.setItem(STORAGE_KEY, String(typeof next === "function" ? next(current) : next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [isCollapsed, setIsCollapsed] as const;
}
