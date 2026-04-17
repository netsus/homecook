# H1: home-first-impression — Acceptance Criteria

---

## Stage 1 Acceptance

| # | 기준 | 상태 |
|---|------|------|
| S1 | 선행 workpack 확인 (없음 — 최초 HOME redesign gate) | ✅ |
| S2 | `docs/workpacks/h1-home-first-impression/README.md` 존재 | ✅ |
| S3 | 비교안 2개 이상이 README에 명시됨 | ✅ (안 A/B/C 3개) |
| S4 | 계약 영향도 분석 완료 (API/DB 불변, 화면정의서 v1.4.0 필요) | ✅ |
| S5 | contract-evolution 경로가 README에 명시됨 | ✅ |
| S6 | Stage 4 authority evidence 목록이 경로와 함께 잠겨 있음 | ✅ (E1~E7) |
| **S7** | **사용자 승인: D1/D2/D3/D4 결정 확인** | **✅ 2026-04-17 (D2/D4 승인, D1/D3 수정 확정)** |
| S8 | contract-evolution PR (화면정의서 v1.4.0) merge 확인 | ⬜ S7 완료 후 |

**S7이 닫혀야 contract-evolution PR을 오픈할 수 있다.**
**contract-evolution PR이 merge되어야 FE 구현(Stage 4)을 시작할 수 있다.**

---

## Stage 4 Implementation Acceptance

### 기능 요건

| # | 기준 | 검증 |
|---|------|------|
| F1 | 비로그인 사용자도 HOME 전체 탐색 가능 (카드 탭 → RECIPE_DETAIL 이동 가능) | 브라우저 확인 |
| F2 | 정렬 컨트롤이 "모든 레시피" 섹션 헤더에 위치함 (`모든 레시피 [N개] [정렬▾]`) | `HOME-after-mobile.png` |
| F3 | 테마 섹션이 compact carousel strip으로 구현됨 (1.5장 peek, 가로 스크롤) | `HOME-carousel-strip.png` |
| F4 | first viewport에 "모든 레시피 [정렬▾]" 헤더가 보이고, 레시피 카드 상단이 peek됨 (390px 기준) | `HOME-after-mobile.png` |
| F5 | 정렬 변경 시 "모든 레시피" 섹션만 즉시 재정렬 (테마 strip 유지) | 기능 확인 |
| F6 | 재료 필터 적용 후 결과가 올바르게 반영됨 (기존 동작 유지) | 기능 확인 |
| F7 | GET /recipes / theme API 계약 변경 없음 | API spec 대조 |

### Mobile UX

| # | 기준 | 검증 |
|---|------|------|
| M1 | 390px first viewport: 브랜드 헤더 + 검색바 + 재료 필터 행 + carousel strip + "모든 레시피 [정렬▾]" 헤더까지 보임 | `HOME-after-mobile.png` |
| M2 | 320px에서 재료 필터 칩 단독 행 잘림·중첩 없음 | `HOME-after-narrow.png` |
| M3 | carousel strip에 가로 스크롤 affordance가 명확함 (카드 1.5개 peek + shadow/gradient hint) | `HOME-carousel-strip.png` |
| M4 | carousel strip이 page-level 가로 스크롤로 느껴지지 않음 | `HOME-carousel-strip.png` |
| M5 | 재료 필터 활성 상태에서 선택 수가 필터 칩에 명확히 표시됨 | `HOME-filter-active.png` |
| M6 | 정렬 bottom sheet가 390px에서 레시피 그리드를 가리지 않음 | `HOME-sort-active.png` |

### First Viewport 기준

| # | 기준 | 검증 |
|---|------|------|
| V1 | 사용자가 앱을 처음 열었을 때 "레시피 탐색 앱임"을 즉시 알 수 있어야 함 | 사용자 인상 확인 |
| V2 | 검색바 + 재료 필터가 first viewport 안에 보이고, "모든 레시피 [정렬▾]" 헤더도 보임 | `HOME-after-mobile.png` |
| V3 | 빈 것처럼 보이는 과도한 여백이나 설명 텍스트 없음 | `HOME-after-mobile.png` |
| V4 | HOME이 "내부 데모" 또는 "설명 패널" 처럼 보이지 않음 | authority review |

### CTA 위계 유지

| # | 기준 | 검증 |
|---|------|------|
| C1 | 검색바가 가장 시각적으로 강하게 읽힘 (primary discovery action) | `HOME-after-mobile.png` |
| C2 | 재료 필터와 정렬은 시각적으로 보조 컨트롤로 읽힘 | `HOME-after-mobile.png` |
| C3 | carousel strip의 "더보기" 링크가 CTA 위계에서 tertiary로 처리됨 | `HOME-carousel-strip.png` |

### Authority Evidence 필수 목록

| # | artifact | 경로 | 필수 여부 |
|---|----------|------|----------|
| E1 | HOME before (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-before-mobile.png` | 필수 |
| E2 | HOME after (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-mobile.png` | 필수 |
| E3 | HOME after narrow (320px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-narrow.png` | 필수 |
| E4 | HOME scrolled (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-scrolled.png` | 필수 |
| E5 | filter active (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-filter-active.png` | 필수 |
| E6 | sort active (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-sort-active.png` | 필수 |
| E7 | carousel strip (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-carousel-strip.png` | 필수 |

---

## Closeout 금지 조건

| # | 조건 |
|---|------|
| CB1 | authority evidence 필수 항목 E1~E7 누락 |
| CB2 | 390px first viewport에서 "모든 레시피 [정렬▾]" 헤더가 보이지 않음 (carousel 축소 효과 없음) |
| CB3 | 320px에서 재료 필터 칩 잘림 또는 중첩 |
| CB4 | carousel strip이 page-level 가로 스크롤처럼 느껴짐 |
| CB5 | GET /recipes 또는 theme API 계약 변경 발생 |
| CB6 | 정렬 컨트롤이 "모든 레시피" 섹션 헤더에 없음 (D1 위치 이탈) |
| CB7 | 테마 섹션이 여전히 2열 full 그리드 (D2 미이행) |
| CB8 | contract-evolution PR 없이 구현 선행 |
| CB9 | authority report에 unresolved blocker 존재 |
| CB10 | 터치 타겟 44px 미달 (필터 칩, 정렬 칩, carousel 카드) |
