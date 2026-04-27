# HOME Baemin-Style Retrofit 설계 리뷰

> 검토 대상: `ui/designs/HOME.md` — Baemin-Style Visual Retrofit Addendum 섹션
> 기준 문서: 화면정의서 v1.5.0 §1 HOME / 디자인 토큰 C2+additive / BAEMIN_STYLE_DIRECTION.md / h1-home-first-impression decisions (D1-D4)
> 검토일: 2026-04-27
> 검토자: design-critic (Stage 1 pre-implementation)
> 관련 workpack: `docs/workpacks/baemin-style-home-retrofit/README.md`

---

## 종합 평가

**등급**: 조건부 통과

**한 줄 요약**: H1 정보 구조 보존 + 토큰/프리미티브 교체 범위가 명확하게 정의되어 있다. 구현 시 주의할 authority risk 포인트 4건을 아래에 기록한다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## Authority Risk 포인트 (Stage 4/5 주의)

| # | 위치 | Risk | 권장 대응 |
|---|------|------|-----------|
| R1 | RecipeCard thumbnail gradient | `rgba(255,108,60,0.22)` / `rgba(46,166,122,0.18)` 3-stop gradient를 `color-mix()`로 교체 시 시각적 느낌이 달라질 수 있다 | Stage 4에서 before/after 비교 후 최종 `color-mix()` 파라미터 조정. `--brand` 12~22% 범위 내 실험 |
| R2 | Discovery panel `glass-panel` | `glass-panel` CSS class는 `app-header.tsx`, `bottom-tabs.tsx`, `home-screen.tsx`에서 공유된다. HOME에서만 inline override하면 다른 화면과 시각적 불일치 발생 가능 | HOME 파일 내 inline override 우선. `glass-panel` global 수정은 이 슬라이스 범위 밖 |
| R3 | Ingredient filter button 비활성 색상 | 현행 `#9f3614` + `rgba(224,80,32,...)` 는 C2 토큰 어디에도 매핑되지 않는 독립 색상이다. `color-mix(--brand-deep, ...)` 으로 교체하면 기존 "따뜻한 오렌지" 뉘앙스가 "분홍-레드" 계열로 전이된다 | Stage 4에서 `color-mix(in srgb, var(--brand-deep), black N%)` 비율을 조정해 가장 가까운 톤을 찾되, brand palette 범위 안에서 결정. Authority screenshot에 before/after 포함 필수 |
| R4 | SortMenu `bg-white/92` → token surface | `bg-white/92`는 92% opacity white이다. `--surface: #ffffff`는 100% opacity이므로 반투명 효과가 사라진다. `glass-panel` 효과와 연관 | `color-mix(in srgb, var(--surface) 92%, transparent)` 또는 `bg-[var(--surface)]/92` 형태로 토큰 기반 반투명 유지 |

---

## 체크리스트 결과

### A. H1 정보 구조 보존

- [x] D1 (정렬=섹션헤더 유지): 리트로핏 와이어프레임에서 "모든 레시피 [정렬 기준▾]" 섹션 헤더 우측 배치 보존 확인
- [x] D2 (테마=compact carousel strip): 리트로핏에서 ThemeCarouselStrip 구조 보존, 시각만 교체
- [x] D3 (재료필터=discovery 단독행): 리트로핏에서 discovery panel 내 단독 행 보존
- [x] D4 (안 C compact hybrid): first viewport 레이아웃 보존 — 헤더 + discovery + carousel + 섹션헤더 구조 유지

### B. 토큰 계약 준수

- [x] Brand tokens (`--brand`, `--brand-deep`, `--brand-soft`) 사용 계획 명시
- [x] Additive tokens (`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-*`) 사용 계획 명시
- [x] `--cook-*` 변경 금지 명시
- [x] `--olive` 보존 명시 (재료 필터)
- [x] 신규 토큰 추가 금지 명시
- [x] `color-mix()` 파생 전략 문서화

### C. 공유 프리미티브 소비 계획

- [x] Card primitive 소비 계획 (RecipeCard, ThemeCarouselCard)
- [x] Badge primitive 소비 계획 (source label)
- [x] Skeleton primitive 소비 계획 (ThemeCarouselSkeleton, RecipeListSkeleton)
- [x] EmptyState/ErrorState primitive 소비 검토 (현행 ContentState 경유 — 호환성 확인 필요)
- [x] `components/ui/*` 파일 수정 금지 명시

### D. 비적용 항목 명확성

- [x] BottomTabs 제외 명시 (앱 전체 slice로 분리)
- [x] AppShell 구조 변경 제외 명시
- [x] Jua 폰트 import 금지 명시
- [x] 프로토타입 HANDOFF.md REFERENCE ONLY 명시

### E. 기존 상태 보존

- [x] Loading 상태 보존 계획 (skeleton 교체, 패턴 유지)
- [x] Empty 상태 보존 계획 (ContentState 경유)
- [x] Error 상태 보존 계획 (ContentState 경유)

### F. Evidence 계획

- [x] Before/after mobile default (390px) 계획
- [x] After narrow (320px) 계획
- [x] Key active states (sort sheet, filter active, loading, empty, error) 계획
- [x] Authority report path 명시 (`ui/designs/authority/BAEMIN_STYLE_HOME_RETROFIT-authority.md`)

---

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| M1 | ContentState 소비 | 현행 HOME은 shared `ContentState` 를 사용하는데, 새 `EmptyState`/`ErrorState` primitive와의 관계가 불명확 | Stage 4에서 기존 `ContentState` 유지 vs 새 primitive 교체를 결정하고 acceptance에 반영. 기존 `ContentState`가 이미 토큰 기반이면 교체 불필요 |
| M2 | Desktop sanity | 리트로핏 와이어프레임이 mobile 375px만 보여줌 | Stage 4 evidence에서 desktop 스크린샷도 포함 (workpack evidence plan에는 있지만 와이어프레임에 미포함 — 허용 가능) |

---

## 통과 조건

이 리트로핏 설계가 Stage 4 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] Authority risk 포인트 4건 → Stage 4 구현 시 before/after 비교로 검증 가능
- [x] H1 D1-D4 구조 보존이 와이어프레임에서 확인됨
- [x] 토큰 계약과 프리미티브 소비 계획이 명확함
- [x] 프로토타입 참조 범위가 REFERENCE ONLY로 제한됨

---

## Stage 4/5 Authority 리뷰 시 확인 사항

Stage 4 구현 완료 후, Stage 5 authority 리뷰에서 다음을 확인해야 한다:

1. **R1~R4 risk 포인트**가 before/after screenshot으로 검증되었는가
2. **H1 정보 구조(D1-D4)**가 실제 구현에서 보존되었는가 (first viewport, section order, control placement)
3. **Hardcoded hex/rgba**가 0건인가 (`grep` scan)
4. **Mobile default (390px) + narrow (320px)**에서 horizontal overflow가 없는가
5. **Loading/empty/error 상태**가 모두 정상 동작하는가
6. **`components/ui/*` 파일**이 수정되지 않았는가 (소비만)
7. **Exploratory QA bundle**이 실행되었는가 (high-risk UI)
