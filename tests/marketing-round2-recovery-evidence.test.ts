import { describe, expect, it } from "vitest";
import { assertRecoveryZoomCombinations } from "./helpers/marketing-round2-recovery-evidence.mjs";

const rows = ["recording", "homeflow"].flatMap(topic =>
  [[320,568],[390,844],[393,852],[1280,900]].map(([width,height]) => ({ topic, viewport: {width,height} })),
);
describe("R2-AP-002 finalized recovery evidence", () => {
  it("accepts exactly two topics across the four required viewports", () => {
    expect(() => assertRecoveryZoomCombinations(rows)).not.toThrow();
  });
  it("rejects the in-progress recording-only four-row snapshot", () => {
    expect(() => assertRecoveryZoomCombinations(rows.slice(0,4))).toThrow();
  });
  it("rejects eight rows if a duplicate replaces one required combination", () => {
    expect(() => assertRecoveryZoomCombinations([...rows.slice(0,7),rows[0]])).toThrow();
  });
  it("rejects a mislabeled viewport even when the row count is eight", () => {
    expect(() => assertRecoveryZoomCombinations([...rows.slice(0,7),{topic:"homeflow",viewport:{width:1280,height:844}}])).toThrow();
  });
});
