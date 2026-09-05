// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { YoutubeExtractionNotificationCenter } from "@/components/youtube-extraction/youtube-extraction-notification-center";
import * as api from "@/lib/api/youtube-extraction-jobs";

const location = vi.hoisted(() => ({ pathname: "/beta" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
vi.mock("@/lib/api/youtube-extraction-jobs", () => ({
  fetchYoutubeExtractionNotifications: vi.fn(async () => ({ success: false, data: null, error: { code: "UNAUTHORIZED" } })),
  enqueueYoutubeExtraction: vi.fn(), fetchYoutubeExtractionJob: vi.fn(),
  markYoutubeExtractionDelivered: vi.fn(), markYoutubeExtractionSeen: vi.fn(),
}));

beforeEach(() => { vi.clearAllMocks(); location.pathname = "/beta"; });
afterEach(cleanup);

it("does not request private YouTube jobs on the public landing page", async () => {
  render(<YoutubeExtractionNotificationCenter initialAuthenticated={false} resolveAuthenticatedOnClient />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(api.fetchYoutubeExtractionNotifications).not.toHaveBeenCalled();
});

it("still resolves notifications after navigating from beta to an app page", async () => {
  const view = render(<YoutubeExtractionNotificationCenter initialAuthenticated={false} resolveAuthenticatedOnClient />);
  location.pathname = "/planner";
  view.rerender(<YoutubeExtractionNotificationCenter initialAuthenticated={false} resolveAuthenticatedOnClient />);
  await waitFor(() => expect(api.fetchYoutubeExtractionNotifications).toHaveBeenCalledTimes(1));
});
