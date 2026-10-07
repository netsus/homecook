import { describe, expect, it } from "vitest";
import { buildSanitizedPlatformData } from "@/scripts/lib/full-local-restore-cutover.mjs";
describe("action notification backup coverage", () => {
  it("keeps durable owner-generation history in the existing public-table backup classification", () => {
    const dump = "COPY public.action_notifications (id, owner_user_id, account_generation, title) FROM stdin;\nnotice\towner\t1\t요리를 완성했어요\n\\.\n";
    const result = buildSanitizedPlatformData(dump);
    expect(result.sql).toContain("COPY public.action_notifications");
    expect(result.sql).toContain("요리를 완성했어요");
    expect(result.manifest.unclassified).toEqual([]);
  });
});
