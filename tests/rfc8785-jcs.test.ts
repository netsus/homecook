import { describe, expect, it } from "vitest";

import {
  canonicalizeJcs,
  parseCanonicalJcs,
  sha256Jcs,
} from "../scripts/lib/rfc8785-jcs.mjs";

describe("RFC 8785 JSON Canonicalization Scheme", () => {
  it("serializes the RFC 8785 primitive example with ECMAScript number spelling", () => {
    expect(canonicalizeJcs({
      string: "€$\u000f\nA'B\"\\\"/",
      numbers: [333333333.33333329, 1e30, 4.5, 0.002, 1e-27],
      literals: [null, true, false],
    })).toBe(
      "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\"/\"}",
    );
  });

  it("sorts object properties by UTF-16 code units at every depth", () => {
    const value = {
      "\ufb33": 7,
      "😀": 6,
      "€": 5,
      "ö": 4,
      "\u0080": 3,
      "1": 2,
      "\r": 1,
      nested: { z: 1, a: 2 },
    };

    expect(canonicalizeJcs(value)).toBe(
      "{\"\\r\":1,\"1\":2,\"nested\":{\"a\":2,\"z\":1},\"\u0080\":3,\"ö\":4,\"€\":5,\"😀\":6,\"דּ\":7}",
    );
  });

  it("rejects duplicate keys, whitespace, key reordering, alternate escapes, and alternate numbers", () => {
    for (const invalid of [
      "{\"a\":1,\"a\":2}",
      "{ \"a\":1}",
      "{\"b\":2,\"a\":1}",
      "{\"a\":1.0}",
      "{\"a\":1e+0}",
      "{\"a\":\"\\u0061\"}",
    ]) {
      expect(() => parseCanonicalJcs(invalid), invalid).toThrow(
        /duplicate|canonical/iu,
      );
    }
  });

  it("rejects non-I-JSON values and hashes exact canonical UTF-8 bytes", () => {
    expect(() => canonicalizeJcs(Number.NaN)).toThrow(/finite|number/iu);
    expect(() => canonicalizeJcs(Number.POSITIVE_INFINITY)).toThrow(/finite|number/iu);
    expect(() => canonicalizeJcs("\ud800")).toThrow(/surrogate|I-JSON/iu);
    expect(() => canonicalizeJcs({ value: undefined })).toThrow(/unsupported|undefined/iu);
    expect(sha256Jcs({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
});
