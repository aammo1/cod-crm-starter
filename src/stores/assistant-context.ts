"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import type { AssistantPageContext } from "@/lib/assistant-contract";

type Selection = Pick<AssistantPageContext, "productId" | "blId" | "selectedParcelIds" | "selectionCount">;
export const ASSISTANT_OPEN_EVENT = "crm:assistant-open";

export const useAssistantContextStore = create<{
  entries: Record<string, { pathname: string; selection: Selection }>;
  set: (key: string, pathname: string, selection: Selection) => void;
  clear: (key: string) => void;
}>((set) => ({
  entries: {},
  set: (key, pathname, selection) => set((state) => ({ entries: { ...state.entries, [key]: { pathname, selection } } })),
  clear: (key) => set((state) => ({ entries: Object.fromEntries(Object.entries(state.entries).filter(([id]) => id !== key)) })),
}));

// Only identifiers and counts are shared, never form values or whole records.
export function useAssistantSelection(key: string, selection: Selection) {
  const pathname = usePathname();
  const serialized = JSON.stringify(selection);
  useEffect(() => {
    useAssistantContextStore.getState().set(key, pathname, JSON.parse(serialized));
    return () => useAssistantContextStore.getState().clear(key);
  }, [key, pathname, serialized]);
}

export function explainWithAssistant(blId: string) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { blId } }));
}
