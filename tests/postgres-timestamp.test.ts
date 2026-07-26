import { describe, expect, it } from "vitest";

import { parsePostgresTimestamp } from "@/lib/server/postgres-timestamp";

describe("PostgreSQL timestamp parser", () => {
  it("preserves microseconds at the largest RFC 3339 offset", () => {
    expect(parsePostgresTimestamp(
      "2030-07-25T14:00:00.123456+14:00",
    )).toEqual({
      iso: "2030-07-25T00:00:00.123456Z",
      microseconds: BigInt("1911168000123456"),
      milliseconds: 1911168000123,
    });
  });

  it.each([
    "0000-07-25T00:00:00.000000Z",
    "2030-07-25T00:00:00.000000+14:01",
    "2030-07-25T00:00:00.000000-23:59",
  ])("rejects timestamp evidence outside the RFC 3339 domain: %s", (value) => {
    expect(parsePostgresTimestamp(value)).toBeNull();
  });
});
