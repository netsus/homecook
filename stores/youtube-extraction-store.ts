"use client";

import { create } from "zustand";

import type {
  YoutubeExtractionNotificationItem,
  YoutubeExtractionNotificationView,
} from "@/types/youtube-extraction";

interface YoutubeExtractionStore {
  authenticated: boolean;
  items: YoutubeExtractionNotificationItem[];
  open: boolean;
  view: YoutubeExtractionNotificationView;
  setAuthenticated: (authenticated: boolean) => void;
  setItems: (items: YoutubeExtractionNotificationItem[]) => void;
  setOpen: (open: boolean) => void;
  setView: (view: YoutubeExtractionNotificationView) => void;
  markSeen: (jobIds: string[]) => void;
}

export const useYoutubeExtractionStore = create<YoutubeExtractionStore>((set) => ({
  authenticated: false,
  items: [],
  open: false,
  view: "unseen-completed",
  setAuthenticated: (authenticated) => set((state) => ({
    authenticated,
    items: authenticated ? state.items : [],
    open: authenticated ? state.open : false,
  })),
  setItems: (items) => set({ items }),
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
  markSeen: (jobIds) => {
    const ids = new Set(jobIds);
    set((state) => ({
      items: state.items.map((item) => ids.has(item.job_id)
        ? { ...item, seen_at: item.seen_at ?? new Date().toISOString() }
        : item),
    }));
  },
}));
