// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthArchiveSurface } from "@/components/mypage/growth-archive-surface";

const mockFetchArchive = vi.fn();

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamificationArchive: (...args: unknown[]) => mockFetchArchive(...args),
}));

function makeItem(id: string, type = "xp_awarded") {
  return {
    id,
    notification_type: type,
    priority: 4,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: null,
    title: `알림 ${id}`,
    body: "기록",
    category: "cooking",
    payload: {},
    created_at: "2026-06-11T00:00:00.000Z",
    seen_at: null,
  };
}

describe("GrowthArchiveSurface", () => {
  beforeEach(() => {
    mockFetchArchive.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not call the API and renders nothing when disabled (unauthorized)", () => {
    render(<GrowthArchiveSurface enabled={false} />);
    expect(mockFetchArchive).not.toHaveBeenCalled();
    expect(screen.queryByTestId("growth-archive-surface")).toBeNull();
  });

  it("shows the empty state when there are no archive rows", async () => {
    mockFetchArchive.mockResolvedValue({ items: [], next_cursor: null, has_next: false });

    render(<GrowthArchiveSurface />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-archive-empty")).toBeTruthy();
    });
  });

  it("shows the error state without throwing when the fetch fails", async () => {
    mockFetchArchive.mockRejectedValue(new Error("network"));

    render(<GrowthArchiveSurface />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-archive-error")).toBeTruthy();
    });
  });

  it("renders items and paginates with the next cursor", async () => {
    mockFetchArchive
      .mockResolvedValueOnce({
        items: [makeItem("a1"), makeItem("a2")],
        next_cursor: "cursor-2",
        has_next: true,
      })
      .mockResolvedValueOnce({
        items: [makeItem("b1")],
        next_cursor: null,
        has_next: false,
      });

    render(<GrowthArchiveSurface pageSize={2} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-archive-item")).toHaveLength(2);
    });
    expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 2, cursor: null });

    fireEvent.click(screen.getByTestId("growth-archive-load-more"));

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-archive-item")).toHaveLength(3);
    });
    expect(mockFetchArchive).toHaveBeenLastCalledWith({ limit: 2, cursor: "cursor-2" });
    expect(screen.queryByTestId("growth-archive-load-more")).toBeNull();
  });

  it("does not render silent notifications defensively", async () => {
    mockFetchArchive.mockResolvedValue({
      items: [
        { ...makeItem("silent"), delivery_channel: "silent", title: "조용한 알림" },
        makeItem("live"),
      ],
      next_cursor: null,
      has_next: false,
    });

    render(<GrowthArchiveSurface />);

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-archive-item")).toHaveLength(1);
    });
    expect(screen.queryByText("조용한 알림")).toBeNull();
    expect(screen.getByText("알림 live")).toBeTruthy();
  });
});
