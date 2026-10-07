"use client";
import { create } from "zustand";
// Only the badge is shared across headers. Private message bodies are not persisted in the browser.
export const useActionNotificationStore = create<{ unreadCount: number; setUnreadCount: (value: number) => void }>(set => ({
  unreadCount: 0,
  setUnreadCount: value => set({ unreadCount: Math.max(0, value) }),
}));
