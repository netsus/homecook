# planner-shell #10 Stage 1 fresh independent design critique

> task ID: `019fecf3-dac5-78e0-983d-deed2ac687b2`
> review date: `2026-08-11`
> role: fresh independent `design-critic`
> verdict: `PASS` — blocker `0`, major `0`, minor `0`
> scope: Stage 1 design contract and review evidence only. Product implementation, repair, product-design-authority, internal 1.5, Ready transition, merge, activation and external notification are not approved or performed here.

## Reviewed exact tuple

- PR: `#1326`, `OPEN`, `Draft`
- branch: `docs/planner-shell-stage1-relock`
- reviewed head: `0e48463d4aac784fd06be9014fd34ed73514a710`
- reviewed tree: `31b9ca5e6df9cdd9e71c74d1e5bd761f600e6035`
- base: `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`
- PR body SHA-256: `3dde10d220eedb3cd923d49b16cfa5fd2f878cd9f0b18d5a80b49e577fa47d29`
- current-head check-runs at review: raw started `17` = success `12` + intended skip `5`; canonical unique contexts `14` = success `9` + intended skip `5`; fail/pending/cancel/rerun `0`; commit statuses `0`

## Fresh re-review of previous HOLD

Previous critic task `019fecc9-c471-7e02-9722-43b6ca6f3d89` reported B1 `1`, major `3`, and one evidence-separation minor. This review independently read the governing documents, current official five-source tuple, the complete 1,018-line managed plan artifact, PR body/diff/tests and the repaired workpack/design projections.

### B1 — resolved

- managed artifact: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`
- measured bytes: `233,219`
- measured newline-terminated lines: `1,018`
- measured SHA-256: `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`
- `tests/planner-shell-stage1-relock.test.ts` reads the artifact as a `Buffer`, hashes the actual bytes, counts actual newline bytes after UTF-8 decoding, checks the governed repository path, and rejects the displaced external absolute path. The exact hash locks the full byte length/content even though `233,219` is not a separate numeric test assertion.

### M1 — resolved

- `ui/designs/PLANNER_WEEK.md:17-92` locks 390px, 320px and desktop; all seven dates; at least two-day overview; dynamic 1/3/5 meal columns; long custom names; 200% scaling; localization expansion; planner-local scroll/sticky containment; bottom-tab safe area; virtual keyboard; and no page-level overflow.
- The same contract is projected into `docs/workpacks/planner-shell/README.md:48-54`, acceptance and automation assertions, so this is not only an illustrative wireframe.

### M2 — resolved

- `ui/designs/PLANNER_WEEK.md:108-124` fixes the official empty label to `비어 있음`, retains current tap behavior, and puts any new add affordance/CTA behind a separately approved Contract Evolution Candidate.
- README and acceptance repeat the no-new-CTA rule; the focused test rejects the prior `plan empty CTA` wording.

### M3 — resolved

- `ui/designs/PLANNER_WEEK.md:94-102` defines a tablist with selected-tab-only `tabindex=0`, Arrow Left/Right and Home/End focus+selection movement inside the tablist, and Tab entry into the selected panel.
- Ordinary selection does not force panel focus. Forced panel/heading focus is limited to deep-link, auth-return, or invoker-loss fallback, eliminating the earlier contradiction.

### Evidence responsibility — resolved

- `ui/designs/PLANNER_WEEK.md:126-135` limits PNGs to static geometry, assigns browser history/focus/trap/restore/Escape sequences to Playwright, and keeps physical keyboard, screen reader, real-device safe-area and virtual-keyboard behavior as Manual evidence.
- Stage 1 explicitly does not claim component/browser/screenshot/device/screen-reader/server-Mac/OAuth/merged-exact rehearsal/activation completion.

## Boundary and lifecycle audit

- no unofficial route, API, schema, migration, RLS, RPC, field, status or writer is introduced; existing `401 UNAUTHORIZED`, `403 FORBIDDEN` and `404 RESOURCE_NOT_FOUND` are official API contracts.
- #10 owns Planner shell and plan-only `PLANNER_WEEK`; #11 remains `COOK_MODE/LEFTOVERS`, #12 remains `MEAL_LOG` body, and #13 remains compatibility/tombstones.
- lifecycle stays `planned`; approval is `not_started`; verification is `pending`; evaluation is `not_started`; `auto_merge_eligible=false`.
- Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, capability, R/R+1/R+2, physical device and activation remain pending. No such completion is inferred from #9's merged backend code.

## Verification

- `pnpm validate:source-of-truth-sync` — pass
- `pnpm validate:workflow-v2` — pass
- `BRANCH_NAME=docs/planner-shell pnpm validate:workpack -- --slice planner-shell` — pass
- `node scripts/validate-automation-spec.mjs --slice planner-shell` — pass
- `pnpm validate:omo-bookkeeping` — pass
- focused Vitest — `6 files / 57 tests` pass, including planner-shell relock `8/8`
- `pnpm lint` — pass
- `pnpm typecheck` — pass
- `pnpm audit --audit-level high` — exit `0`; existing low `1`, moderate `1`, high/critical `0`
- `git diff --check` — pass

## Residual limitations, not findings

- Static Stage 1 markdown cannot prove final rendered density, sticky behavior, scroll containment or bottom safe-area behavior.
- Playwright evidence is future Stage 4 work and does not substitute for physical-keyboard or screen-reader verification.
- Physical 390px/320px devices, VoiceOver/TalkBack-equivalent checks, server-Mac/OAuth, merged-exact rehearsal, capability/R/R+1/R+2 and activation remain explicitly pending.

---

# Historical PLANNER_WEEK design reviews

> 검토 대상: `ui/designs/PLANNER_WEEK.md`
> 기준 문서: 화면정의서 v1.2.3 §5 / 요구사항기준선 v1.6.3 §1-4 / API v1.2.2 §3 / `05-planner-week-core` accepted contract / AGENTS.md
> 검토일: 2026-04-13
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: `PLANNER_WEEK`는 day-card + 4끼 고정 슬롯 baseline을 기준으로 slice06이 기대는 anchor 화면으로 쓸 수 있다. 다만 planner add 이후의 5-column 밀도, 작은 모바일 폭, range bar proximity는 Stage 4 authority evidence에서 다시 잠가야 한다.

---

## 크리티컬 이슈

없음.

---

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | 5-column 밀도 | slice06 이후 5-column 상태에서 slot 텍스트와 상태 메타가 급격히 빽빽해질 수 있다. | Stage 4 authority evidence에 5-column mobile/default+narrow 캡처를 포함한다. |
| 2 | range bar proximity | 주간 범위 바와 첫 day card 사이가 벌어지면 planner add 결과 확인 UX가 느려진다. | first viewport에서 range bar 바로 아래 첫 day card가 읽히도록 spacing을 유지한다. |
| 3 | 상태 뱃지 | `registered` / `shopping_done` / `cook_done`의 의미가 처음 보는 사용자에게는 낯설 수 있다. | badge 텍스트를 유지하고 색상만으로 구분하지 않는다. serving/status chip 분리 시에도 텍스트 의미를 유지한다. |
| 4 | 타이포 과밀/과대비 | HOME에서 PLANNER로 이동할 때 제목과 날짜 타이포가 갑자기 커 보이면 화면이 무겁게 느껴질 수 있다. | headline, range title, 날짜 라벨을 한 단계 절제해 홈과 스케일 격차를 줄인다. |

---

## 체크리스트 결과

- [x] `PLANNER_WEEK` 화면 범위만 다룬다
- [x] 상단 CTA 3개가 노출된다
- [x] 같은 날짜의 4끼가 같은 day card 안에서 읽힌다
- [x] planner add 이후에도 기존 planner mental model을 유지한다
- [x] 로그인 게이트가 planner 탭 진입 기준으로 명시된다
- [x] loading / empty / error / unauthorized 상태가 포함된다
- [x] unauthorized / loading 상태가 shared state shell 기준과 충돌하지 않는다
- [x] small mobile / authority evidence 보강 계획이 문서에 있다

---

## 결론

> **2026-07-16 prepared-food-planner-entry Stage 1 계약 승인:** 위 역사적 판정은 새 product entry anchor extension의 구현 화면을 승인하지 않는다. fresh independent Stage 1.5 reviewer는 설계 계약만 exact head에서 승인했으며, mobile baseline 375/구현 390, narrow 320, desktop, primary CTA, scroll containment, Recipe Meal/product 구분, workflow status 부재와 PLANNER_WEEK anchor 회귀의 실제 구현 판정은 Stage 4·5·final authority에서 pending이다.

### Independent Stage 1.5 Review Record — prepared-food-planner-entry

- reviewed head: `b137aa4e9d090827a80301ab47cc55710821a166`
- decision: `REQUEST_CHANGES` — Important 6건
- 이 화면 관련 finding: anchor extension evidence를 기존/신규 화면별로 구분하지 않아 PLANNER_WEEK before+after 390/320/desktop 보장이 충분히 machine-readable하지 않았다.
- repair disposition: PLANNER_WEEK의 before+after 6개 exact path를 유지·명시하고, MEAL_SCREEN/MENU_ADD도 같은 6-way matrix로 확장했다. 신규 picker/create는 after-only 3-way matrix로 분리했다.
- 전역 finding disposition: MEAL_SCREEN 예상 열량, picker cursor, real DB bootstrap/reset/cleanup, 5개 critique provenance, roadmap/status 정합성도 owning artifact에서 수정했다.
- repair-final은 자기 변경을 승인하지 않았다.

### Independent Exact-Head Re-review — prepared-food-planner-entry

- reviewed head: `fe210b7169094edc77b64e91a730d86720d598ae`
- decision: `DOC_GATE_APPROVED` — Blocker/Important/Suggestion `0/0/0`
- provenance: 첫 review `0/6/0`, 별도 repair-final 1회, fresh independent re-review `0/0/0`
- scope: PLANNER_WEEK product-entry anchor extension의 Stage 1 설계 계약과 future evidence 요구만 승인한다. Stage 4 실제 UI와 authority precheck/Stage 5/final authority/Stage 6은 pending이며 역사적 🟡 판정을 successor 구현 승인으로 간주하지 않는다.

위 문장은 역사적 slice06 판정에만 해당한다. `prepared-food-planner-entry` successor의 Stage 1 설계 계약은 exact-head 재검수에서 승인됐지만, Stage 2 진입은 docs PR #1016 merge 전까지 차단되고 실제 UI 권위 판정은 후속 단계에 남는다.

### Stage 5 Implementation Review — prepared-food-planner-entry

- review date: `2026-07-17`
- reviewed exact head: `737c799600647bac8faf8016f5940e12df2535a0`
- decision: `PASS` — Blocker/Major/Minor `0/0/0`
- `390`, `320`, `1280` before/after evidence에서 기존 week navigation, primary action, day-card geometry를 유지하면서 완제품 compact row가 Recipe Meal과 구분된다.
- 완제품 row에 레시피 조리 workflow status/action을 추가하지 않았고 anchor return도 보존된다.
- 이 판정은 Stage 5 구현 검수만 통과시킨다. `Design Status`는 final authority 전까지 `pending-review`이며 Stage 6은 승인하지 않았다.
