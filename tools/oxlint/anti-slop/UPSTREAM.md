# Vendored Anti Slop provenance

- Source: `https://github.com/dmmulroy/anti-slop`
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- License: MIT; see `LICENSE` in this directory.
- Dependency pair: `oxlint@1.78.0` and `@oxlint/plugins@1.78.0`, exactly pinned. The official npm registry integrity values recorded in `pnpm-lock.yaml` are `sha512-QgQePuxIqKOzo1KSjG2EnITEeWvWnKAm77eq8nrMtf6AGoA+zyGc4PFYtDNJSD25g/ibOwfQ851hZ4/SPkMVoA==` and `sha512-Ypt8KeRYw+4jUtlPirfcHWMrn5ms12VrrFPD+Mds477/7tJxG1Kcz2Yrg2nVcTQEUx/GdlhS+BUg1kmxNm04Ug==` respectively.

The following files are byte-for-byte copies from that commit:

| Vendored path | Upstream path | SHA-256 |
| --- | --- | --- |
| `rules/no-array-filter-map.ts` | `src/rules/no-array-filter-map.ts` | `528bba857b84712c038e35e59079cc1e6c78a0421c65bb3c6117c9d412a2f28a` |
| `rules/no-reduce-accumulator-copy.ts` | `src/rules/no-reduce-accumulator-copy.ts` | `dce4b08ee7ac4bbedfe743f6fa4a3d423cde50b37691130b899cc4573c05d2ae` |
| `rules/no-chained-type-assertions.ts` | `src/rules/no-chained-type-assertions.ts` | `72f8e981520f94adac0ffbdab8f8e84e5f2a4595f14e4a6471be917a85a20a15` |
| `rules/no-conditional-empty-object-spread.ts` | `src/rules/no-conditional-empty-object-spread.ts` | `33f044030d208fcc10be73bb19c8172c275c5229df4b0ca8ec10f069bbe60062` |
| `shared/array-method.ts` | `src/shared/array-method.ts` | `e360557253c56ab7c256623f3338415743e5027e9d999f801fb79d98240d217b` |

The vendored `LICENSE` is also byte-for-byte identical to upstream (`SHA-256 10ed33bf340d6d63dc0633dfc917a346b369b6aa41fe20734aefc6a3fb75ba17`).

`index.ts` is Homecook-owned glue that exports only the reviewed rules above. The remaining generic rules and the complete Effect rule group are intentionally not vendored or enabled. Homecook has valid module mocks, runtime boundary checks, `unknown` inputs, and dynamic reflection, and does not directly depend on Effect. Existing findings are retained in a checked-in baseline; CI rejects only findings beyond that baseline so unrelated changes are not forced into a repository-wide rewrite.
