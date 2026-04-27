# RECIPE_DETAIL Baemin-Style Retrofit 설계 리뷰

> 검토 대상: `ui/designs/RECIPE_DETAIL.md` — Baemin-Style Visual Retrofit Addendum 섹션
> 기준 문서: 화면정의서 v1.2.3 §3 / 디자인 토큰 C2+additive / BAEMIN_STYLE_DIRECTION.md / h5-modal-system-redesign decisions
> 검토일: 2026-04-27
> 검토자: design-critic (Stage 1 pre-implementation)
> 관련 workpack: `docs/workpacks/baemin-style-recipe-detail-retrofit/README.md`

---

## 종합 평가

**등급**: 조건부 통과

**한 줄 요약**: RECIPE_DETAIL 정보 구조 보존 + 토큰/프리미티브 교체 범위가 명확하게 정의되어 있다. `COOKING_METHOD_TINTS` color-mix() 전환의 시각적 정확도가 핵심 authority risk이다. 구현 시 주의할 risk 포인트 5건을 아래에 기록한다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## Authority Risk 포인트 (Stage 4/5 주의)

| # | 위치 | Risk | 권장 대응 |
|---|------|------|-----------|
| R1 | `COOKING_METHOD_TINTS` → `color-mix()` 전환 | CSS `color-mix(in srgb, var(--cook-boil) 14%, transparent)` 결과가 원래 `rgba(232, 69, 60, 0.14)` 와 미세하게 다를 수 있다. `color-mix`의 alpha 처리는 색상 공간에 따라 다르며, `in srgb`는 직선 보간이므로 대부분 일치하지만 반올림 차이 가능 | Stage 4에서 각 cooking method 배지를 before/after 비교. 유의미한 시각적 차이가 있으면 퍼센트 조정. Authority screenshot에 StepCard 영역 포함 필수 |
| R2 | `glass-panel` 공유 범위 | `glass-panel`은 `recipe-detail-screen.tsx`에서 5+ 사용, `planner-add-sheet.tsx`와 `save-modal.tsx`에서도 사용. 모두 inline token 교체 시 `glass-panel` CSS class 자체가 다른 화면(PLANNER_WEEK 등)에서 여전히 참조됨 | RECIPE_DETAIL 파일 내에서만 `glass-panel` → inline token 교체. `glass-panel` global CSS 규칙은 이 슬라이스 범위 밖 |
| R3 | `getRecipeActionToneClass` 4-variant 교체 | brand/olive/signal/neutral 4개 tone에 각각 hardcoded rgba가 있다. `color-mix()` 교체 시 tone 간 시각적 구분이 약해질 수 있음 (특히 signal vs brand) | Stage 4에서 좋아요 활성(signal) vs 요리하기(brand) tone을 나란히 비교. Authority screenshot에 utility metrics row 포함 필수 |
| R4 | LoginGateModal `components/auth/` 경로 | 현재 RECIPE_DETAIL에서만 소비되지만 `components/auth/` 경로에 있어 향후 다른 화면에서 import 시 scope 충돌 가능 | Stage 4에서 LoginGateModal 소비처를 grep 확인 후 단일 소비자면 retrofit 진행. 다중 소비자 발견 시 scope 재평가 |
| R5 | Badge contrast 이슈 (Tailwind v4 specificity) | HOME 리트로핏에서 Badge `brand` variant의 WCAG 4.5:1 위반을 inline `style` prop으로 해결했다. RECIPE_DETAIL에서 Badge 소비 시 동일 패턴 필요 | HOME 리트로핏의 `style={{ color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}` 패턴을 동일 적용. A11y scan으로 검증 |

---

## 체크리스트 결과

### A. RECIPE_DETAIL 정보 구조 보존

- [x] Overview card layout 보존: breadcrumb → tags → title → meta → utility metrics → description → CTA
- [x] Utility metrics row 구조 보존: 플래너 · 공유 · 좋아요 · 저장 compact wrap row
- [x] Primary CTA row 구조 보존: [플래너에 추가] [요리하기] 2열
- [x] Ingredient list 구조 보존: 재료명 + 수량 좌우 배치, TO_TASTE/옵션 배지
- [x] Step card 구조 보존: 번호 원 + 조리방법 배지 + instruction + 사용재료 칩
- [x] Serving stepper 위치 보존: 재료 섹션 내

### B. 토큰 계약 준수

- [x] Brand tokens (`--brand`, `--brand-deep`, `--brand-soft`) 사용 계획 명시
- [x] Additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-*`) 사용 계획 명시
- [x] `--cook-*` 변경 금지 명시 — 파생 tint만 `color-mix()` 전환
- [x] `--olive` 보존 명시 (PlannerAddSheet/SaveModal per H5)
- [x] 신규 토큰 추가 금지 명시
- [x] `color-mix()` 파생 전략 문서화 (COOKING_METHOD_TINTS 매핑 테이블 포함)

### C. 공유 프리미티브 소비 계획

- [x] Badge primitive 소비 계획 (해당 시)
- [x] Skeleton primitive 소비 계획 (RecipeDetailLoadingSkeleton)
- [x] `components/ui/*` 파일 수정 금지 명시
- [x] Card primitive 호환성 검토 (HOME에서 Link wrapper 비호환 확인 — 동일 판단 적용)

### D. H5 Modal Chrome 보존

- [x] PlannerAddSheet: eyebrow 제거, icon-only close, olive accent 보존
- [x] SaveModal: eyebrow 제거, icon-only close, olive CTA 보존
- [x] LoginGateModal: 기존 chrome 보존 (eyebrow pill은 LoginGateModal 고유 — H5 제거 대상 아님)

### E. 비적용 항목 명확성

- [x] Prototype hero + transparent AppBar fade 제외 명시
- [x] Prototype tabs/reviews 구조 제외 명시
- [x] BottomTabs 제외 명시 (앱 전체 slice로 분리)
- [x] Jua 폰트 import 금지 명시
- [x] COOK_MODE 화면 제외 명시 (후속 slice 14/15)
- [x] 프로토타입 HANDOFF.md REFERENCE ONLY 명시

### F. 기존 상태 보존

- [x] Loading 상태 보존 계획 (RecipeDetailLoadingSkeleton 교체, 패턴 유지)
- [x] Error 상태 보존 계획 (ContentState error 경유)
- [x] PlannerAddSheet loading/error 상태 보존 계획
- [x] SaveModal loading/ready/error 상태 보존 계획

### G. Evidence 계획

- [x] Before/after mobile default (390px) 계획
- [x] After narrow (320px) 계획
- [x] Key active states (planner-add sheet, save modal, login gate, loading, error) 계획
- [x] Authority report path 명시
- [x] Cooking method 배지 tint before/after 비교 계획

---

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| M1 | ContentState 소비 | RECIPE_DETAIL error 상태가 shared `ContentState`를 사용하는데, HOME 리트로핏에서 `ContentState`를 out-of-scope로 두었다. RECIPE_DETAIL에서도 동일하게 `ContentState`는 건드리지 않아야 한다 | `ContentState` 수정 금지 — out of scope 유지. 내부 hardcoded 값은 별도 shared component retrofit slice에서 처리 |
| M2 | `text-red-600` in PlannerAddSheet | `planner-add-sheet.tsx` line 189의 `text-red-600`는 Tailwind preset 색상이다. 토큰 기반이 아닌 preset 참조 | Stage 4에서 `text-[var(--brand-deep)]` 또는 `color-mix()` error tone으로 교체 |
| M3 | Desktop grid layout | `recipe-detail-screen.tsx` line 831의 `xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]`는 구조 변경 없이 유지해야 한다 | 토큰 교체만 — grid template는 건드리지 않음 |
| M4 | `shadow-[var(--shadow)]` ambiguity | 5+ 곳에서 `shadow-[var(--shadow)]`를 사용하는데, `--shadow` 토큰이 명시적이지 않다. `--shadow-1` / `--shadow-2` 명확화 필요 | Stage 4에서 `--shadow` → `--shadow-1` 또는 `--shadow-2`로 의미에 맞게 분화 |

---

## 통과 조건

이 리트로핏 설계가 Stage 4 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] Authority risk 포인트 5건 → Stage 4 구현 시 before/after 비교로 검증 가능
- [x] RECIPE_DETAIL 정보 구조 보존이 와이어프레임에서 확인됨
- [x] 토큰 계약과 프리미티브 소비 계획이 명확함
- [x] H5 modal chrome 결정 보존이 명시됨
- [x] COOKING_METHOD_TINTS color-mix() 전환 매핑 테이블이 문서화됨
- [x] 프로토타입 참조 범위가 REFERENCE ONLY로 제한됨

---

## Stage 4/5 Authority 리뷰 시 확인 사항

Stage 4 구현 완료 후, Stage 5 authority 리뷰에서 다음을 확인해야 한다:

1. **R1~R5 risk 포인트**가 before/after screenshot으로 검증되었는가
2. **RECIPE_DETAIL 정보 구조**가 실제 구현에서 보존되었는가 (overview, metrics, CTA, 재료, 스텝)
3. **Hardcoded hex/rgba**가 0건인가 (`grep` scan) — `--cook-*` 토큰 참조 자체는 허용
4. **COOKING_METHOD_TINTS** `color-mix()` 전환 결과가 기존 rgba와 시각적으로 동등한가
5. **Mobile default (390px) + narrow (320px)**에서 horizontal overflow가 없는가
6. **Loading/error 상태**가 모두 정상 동작하는가 (RecipeDetailScreen + PlannerAddSheet + SaveModal)
7. **H5 modal 결정**이 PlannerAddSheet/SaveModal에서 보존되었는가
8. **`components/ui/*` 파일**이 수정되지 않았는가 (소비만)
9. **LoginGateModal** 소비처가 여전히 단일(RECIPE_DETAIL)인가
10. **Exploratory QA bundle**이 실행되었는가 (high-risk UI)
