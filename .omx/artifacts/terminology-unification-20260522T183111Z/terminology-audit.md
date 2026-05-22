# Terminology Audit: MYPAGE copy cleanup

Generated: 2026-05-22T18:31:11Z

## Scope

- Change type: low-risk product-frontend copy polish.
- First-pass editable area: `components/mypage/**` plus MYPAGE-focused tests.
- Contract boundary: no API, DB, endpoint, field, status enum, or state-transition changes.
- Official docs are read-only evidence for this PR. This artifact does not replace the source-of-truth documents.

## 기준표

| Concept ID | UI role | Canonical copy | Allowed copy | Non-preferred copy | Evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `MYPAGE_RECIPEBOOK_TAB` | MYPAGE tab/heading | `레시피북` | `레시피북` in tab/heading, `새 레시피북 만들기` as creation action | `레시피북 관리` as tab label | `docs/화면정의서-v1.5.6.md` MYPAGE section names `레시피북 탭`; mobile MYPAGE already used `레시피북` | 즉시 수정 |
| `MYPAGE_SHOPPING_HISTORY_TAB` | MYPAGE tab/heading/helper copy | `장보기 기록` | `장보기 기록`, `완료된 장보기 기록` | `장보기 내역` for MYPAGE tab/heading/helper copy | `docs/화면정의서-v1.5.6.md` uses `장보기 기록 탭`; mobile MYPAGE already used `장보기 기록` | 즉시 수정 |
| `MYPAGE_SCREEN_LABEL` | page/nav label | `마이페이지` | `마이페이지` | none in first-pass scope | `docs/화면정의서-v1.5.6.md` screen title is `MYPAGE: 마이페이지` | 허용 유지 |
| `MOBILE_BOTTOM_TAB_MYPAGE` | narrow mobile bottom tab | `마이` | `마이` only for constrained bottom tab | forcing `마이페이지` without design review | `components/layout/wave1-mobile-bottom-tab.tsx` uses short tab labels | authority-sensitive 예외 |
| `LEFTOVERS_LABEL` | leftovers screen/short label vs natural sentence | `남은요리` / `남은 요리` by role | `남은요리` for screen/compact label, `남은 요리` in sentence/helper copy | one-way global replacement | Official docs contain both `남은요리` and sentence copy such as `남은 요리가 없어요` | 허용 유지 |
| `MEAL_ADD_ACTIONS` | planner entry / post-create CTA / modal title | role-specific copy | `식사 추가`, `이 끼니에 추가`, `끼니에 추가` when each keeps its existing flow role | merging all action copy into one label | official flow separates `MENU_ADD (식사 추가)` and post-create `이 끼니에 추가` | 허용 유지 |
| `STATUS_COPY` | user-facing status/action copy | Korean user copy only | `식사 등록 완료`, `장보기 완료`, `요리 완료` | changing internal enum names | internal enum values remain `registered`, `shopping_done`, `cook_done` | 허용 유지 |

## Audit 결과

| Surface | Finding | Classification | Action |
| --- | --- | --- | --- |
| desktop MYPAGE tabs | `레시피북 관리` differed from official/mobile `레시피북` | 즉시 수정 | Changed desktop tab text and `aria-label` to `레시피북`. |
| desktop MYPAGE tabs | `장보기 내역` differed from official/mobile `장보기 기록` | 즉시 수정 | Changed desktop tab text and `aria-label` to `장보기 기록`. |
| desktop MYPAGE shopping history | section headings used `장보기 내역` while empty copy used `장보기 기록` | 즉시 수정 | Changed section headings to `장보기 기록`. |
| desktop MYPAGE FAQ | FAQ question/answer used `장보기 내역` | 즉시 수정 | Changed FAQ copy to `장보기 기록`. |
| mobile MYPAGE | already used `레시피북` and `장보기 기록` | 허용 유지 | No code change. |
| bottom tab | short label `마이` | authority-sensitive 예외 | No first-pass change; mobile density/prototype review needed before changing. |
| leftovers/ate-list | mixed `남은요리` and `남은 요리` | 허용 유지 | No first-pass change; role split is acceptable. |
| planner/manual/youtube add flow | `식사 추가`, `끼니에 추가`, `이 끼니에 추가` | 허용 유지 | No first-pass change; each label maps to a different action role. |
| official source-of-truth docs | terminology evidence only | 문서 이슈 없음 for this PR | No official docs changed. |

## Diff guard evidence

- Expected changed code/test paths:
  - `components/mypage/mypage-screen.tsx`
  - `tests/mypage-screen.test.tsx`
  - `tests/e2e/slice-17a-mypage.spec.ts`
  - `tests/e2e/qa-a11y.spec.ts`
  - `tests/e2e/qa-visual.spec.ts`
  - `.omx/artifacts/terminology-unification-20260522T183111Z/terminology-audit.md`
- Forbidden changes for this PR:
  - `app/api/**`
  - `supabase/**`
  - official source-of-truth docs
  - `package.json`
  - `pnpm-lock.yaml`
- Internal status values `registered`, `shopping_done`, `cook_done` are not changed.
