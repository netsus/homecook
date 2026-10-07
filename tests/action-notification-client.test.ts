import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/api/fetch-json";
import { fetchActionNotifications, isActionNotificationTarget, markActionNotificationsSeen } from "@/lib/api/action-notifications";
vi.mock("@/lib/api/fetch-json", () => ({ fetchJson: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const item = { id, event_type: "meal_planned", title: "요리 계획", message: "김치찌개를 등록했어요.", target_path: "/planner?date=2026-09-28", created_at: "2026-09-28T01:00:00Z", seen_at: null };
const page = { items: [item], next_cursor: null, has_next: false, unread_count: 1 };
beforeEach(() => vi.mocked(fetchJson).mockReset());
describe("persistent action notification client boundary", () => {
  it("requests uncached archive pages and preserves server counts", async () => {
    vi.mocked(fetchJson).mockResolvedValue(page);
    expect(await fetchActionNotifications("archive", "cursor /+")).toEqual(page);
    expect(fetchJson).toHaveBeenCalledWith("/api/v1/users/me/action-notifications?view=archive&limit=30&cursor=cursor+%2F%2B", expect.objectContaining({ cache: "no-store" }));
  });
  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)", "/planner\\evil", "/planner\n", "/settings", "/planner-evil"]) ("rejects unsafe target %s", async (target) => {
    expect(isActionNotificationTarget(target)).toBe(false);
    vi.mocked(fetchJson).mockResolvedValue({ ...page, items: [{ ...item, target_path: target }] });
    await expect(fetchActionNotifications("unseen")).rejects.toThrow("알림 응답");
  });
  it.each(["/planner?date=2026-09-28", "/meal/meal-id", "/shopping/lists/list-id", "/pantry", "/leftovers", "/recipe/recipe-id"])("permits app event destination %s", (target) => {
    expect(isActionNotificationTarget(target)).toBe(true);
  });
  it.each([-1, 1.5, "1", null])("rejects invalid unread count %s", async (unread_count) => {
    vi.mocked(fetchJson).mockResolvedValue({ ...page, unread_count });
    await expect(fetchActionNotifications("unseen")).rejects.toThrow("알림 응답");
  });
  it("rejects oversized and malformed pages", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ ...page, items: Array(31).fill(item) });
    await expect(fetchActionNotifications("unseen")).rejects.toThrow();
    vi.mocked(fetchJson).mockResolvedValue({ ...page, items: [{ ...item, created_at: "invalid" }] });
    await expect(fetchActionNotifications("unseen")).rejects.toThrow();
  });
  it("uses server read acknowledgement and authoritative remaining count", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ seen_ids: [id], unread_count: 8 });
    expect(await markActionNotificationsSeen([id])).toEqual({ seen_ids: [id], unread_count: 8 });
    expect(fetchJson).toHaveBeenCalledWith("/api/v1/users/me/action-notifications/seen", expect.objectContaining({ method: "POST", body: JSON.stringify({ ids: [id] }) }));
  });
  it("rejects an acknowledgement for an unrequested notification", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ seen_ids: ["22222222-2222-4222-8222-222222222222"], unread_count: 0 });
    await expect(markActionNotificationsSeen([id])).rejects.toThrow("읽음 상태");
  });
});
