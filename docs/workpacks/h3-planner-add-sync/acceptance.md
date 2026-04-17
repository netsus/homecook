# H3: planner-add-sync — Acceptance Criteria

---

## Stage 1 Acceptance

| # | 기준 | 상태 |
|---|------|------|
| S1 | 선행 workpack 확인 (06-recipe-to-planner merged, H2 merged, H4 승인) | ✅ |
| S2 | `docs/workpacks/h3-planner-add-sync/README.md` 존재 | ✅ |
| S3 | UX 결정 사항 D1/D2/D3 옵션이 README에 명시됨 | ✅ |
| S4 | 계약 영향도 분석 완료 (API/DB 불변, 화면정의서 v1.3.1 필요) | ✅ |
| S5 | contract-evolution 경로가 README에 명시됨 | ✅ |
| S6 | Stage 4 authority evidence 목록이 경로와 함께 잠겨 있음 | ✅ |
| **S7** | **사용자 승인: D1/D2/D3 결정 확인** | **✅ 2026-04-17** |
| S8 | contract-evolution PR (화면정의서 v1.3.1) merge 확인 | ⬜ PR #136 merge 후 |

**S7이 닫혀야 contract-evolution PR을 오픈할 수 있다.**
**contract-evolution PR이 merge되어야 FE 구현(Stage 4)을 시작할 수 있다.**

---

## Stage 4 Implementation Acceptance

### 기능 요건

| # | 기준 | 검증 |
|---|------|------|
| F1 | 로그인 게이트 return-to-action 유지 — 비로그인 사용자가 [플래너에 추가]를 탭하면 로그인 후 바텀시트로 복귀한다 | e2e 흐름 확인 |
| F2 | planner-add 성공 토스트가 target date + 끼니명을 포함한다 (예: "4월 17일 아침에 추가됐어요") | 토스트 텍스트 확인 |
| F3 | 바텀시트 내 선택된 날짜 표시가 `요일 M월 D일` 포맷을 사용한다 | 날짜 레이블 확인 |
| F4 | POST /meals 계약 변경 없음 — request body 구조 그대로 | API spec 대조 |
| F5 | D1 결정(성공 후 동작)에 따라 구현됨 | D1 승인 결과 확인 |

### Mobile UX

| # | 기준 | 검증 |
|---|------|------|
| M1 | 390px에서 바텀시트 내 날짜 캘린더, 끼니 드롭다운, 인분 stepper, CTA 버튼이 잘림·가림 없음 | `planner-add-sheet-mobile.png` |
| M2 | 320px에서 바텀시트 레이아웃 붕괴 없음, CTA 버튼 접근 가능 | `planner-add-sheet-narrow.png` |
| M3 | 성공 토스트가 390px에서 CTA 위계를 가리지 않음 | `planner-add-toast-mobile.png` |

### RECIPE_DETAIL CTA 위계 유지

| # | 기준 | 검증 |
|---|------|------|
| C1 | `[플래너에 추가]`, `[요리하기]` primary CTA row 위계가 변경 전과 동일하게 유지됨 | `recipe-detail-cta-hierarchy.png` |
| C2 | 바텀시트 open/close 후 RECIPE_DETAIL 스크롤 위치가 복원됨 | 수동 확인 |
| C3 | 비로그인 → 로그인 게이트 → 로그인 성공 후 바텀시트 자동 복귀 (return-to-action) | e2e 흐름 확인 |

### Authority Evidence 필수 목록

| # | artifact | 필수 여부 |
|---|----------|----------|
| E1 | `RECIPE_DETAIL-baseline.png` (구현 전 현행) | 필수 |
| E2 | `planner-add-sheet-mobile.png` (390px) | 필수 |
| E3 | `planner-add-sheet-narrow.png` (320px) | 필수 |
| E4 | `planner-add-sheet-date-label.png` (날짜 포맷 확인) | 필수 |
| E5 | `planner-add-toast-mobile.png` (성공 토스트) | 필수 |
| E6 | `recipe-detail-cta-hierarchy.png` (CTA 위계) | 필수 |

---

## Closeout 금지 조건

| # | 조건 |
|---|------|
| C1 | authority evidence 필수 항목 E1~E6 누락 |
| C2 | 성공 토스트에 target date/끼니 미포함 |
| C3 | 320px에서 바텀시트 CTA 가림 또는 레이아웃 붕괴 |
| C4 | POST /meals 계약 변경 발생 |
| C5 | RECIPE_DETAIL primary CTA 위계 훼손 |
| C6 | contract-evolution PR 없이 구현 선행 |
| C7 | authority report에 unresolved blocker 존재 |
| C8 | 비로그인 return-to-action 복귀 흐름 파손 |
