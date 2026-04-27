# PLANNER_WEEK Baemin-Style Retrofit 설계 리뷰

> 검토 대상: `ui/designs/PLANNER_WEEK.md` — Baemin-Style Visual Retrofit Addendum 섹션
> 기준 문서: 화면정의서 v1.3.0 §5 / 디자인 토큰 C2+additive / BAEMIN_STYLE_DIRECTION.md / H2/H4 day-card interaction contract / PLANNER_WEEK-v2.md
> 검토일: 2026-04-27
> 검토자: design-critic (Stage 1 pre-implementation)
> 관련 workpack: `docs/workpacks/baemin-style-planner-week-retrofit/README.md`

---

## 종합 평가

**등급**: 조건부 통과

**한 줄 요약**: H2/H4 day-card interaction contract 보존 + 토큰 교체 범위가 명확하게 정의되어 있다. 단일 파일 대상(`planner-week-screen.tsx`)이며 `STATUS_META` color-mix() 전환과 sticky week context bar의 반투명 처리가 핵심 authority risk이다. 구현 시 주의할 risk 포인트 5건을 아래에 기록한다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## Authority Risk 포인트 (Stage 4/5 주의)

| # | 위치 | Risk | 권장 대응 |
|---|------|------|-----------|
| R1 | `STATUS_META` rgba → `color-mix()` 전환 | `registered` status의 원래 rgba는 `#FF6C3C`(old brand) 기반 12% alpha이고, 토큰 `--brand`는 `#ED7470`(new brand)이다. `color-mix(in srgb, var(--brand) 12%, transparent)` 결과가 원래보다 분홍빛이 강해질 수 있다 | Stage 4에서 status chip before/after 비교. 유의미한 차이 시 퍼센트 조정(10~14% 범위). Authority screenshot에 day card slot row 영역 포함 필수 |
| R2 | Week context bar `bg-white/88` + `backdrop-blur` → token 전환 | `bg-white/88`은 88% opacity white로 backdrop-blur와 결합해 frosted glass 효과를 만든다. `bg-[var(--panel)]`으로 교체하면 panel이 opaque(100%)이므로 backdrop-blur가 무의미해진다 | `bg-[var(--panel)]` 사용 시 `backdrop-blur` 제거하거나, `color-mix(in srgb, var(--surface) 88%, transparent)` 형태로 반투명 유지. Stage 4에서 sticky bar 스크롤 시 시각적 느낌 비교 |
| R3 | `glass-panel` 공유 범위 | `glass-panel`은 PLANNER_WEEK에서 5+ 사용. inline token 교체 시 `glass-panel` CSS class 자체는 전역에서 여전히 정의됨 (app-header, bottom-tabs 등 다른 소비처). global CSS 규칙을 건드리면 안 됨 | PLANNER_WEEK 파일 내에서만 `glass-panel` → inline token 교체. global CSS의 `.glass-panel` 규칙은 이 슬라이스 범위 밖 |
| R4 | CTA toolbar inset shadow `rgba(255,255,255,0.78)` | `shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]`은 subtle inner highlight 효과다. 토큰에 직접 매핑되는 값이 없어 `color-mix()` 파생 또는 제거가 필요하다 | `color-mix(in srgb, var(--surface) 78%, transparent)` 으로 파생하거나, 배민 스타일에서 inset highlight가 불필요하면 제거. Stage 4에서 CTA toolbar 영역 before/after 비교 |
| R5 | 390px 2일 이상 overview 보존 | 토큰 radius 변경으로 card padding/margin이 미세하게 바뀌면 첫 화면에서 2일 카드가 안 보일 수 있다 | Stage 4에서 390px viewport로 첫 화면 캡처 시 2번째 day card 상단이 보이는지 확인. Authority screenshot에 first viewport full capture 포함 필수 |

---

## 체크리스트 결과

### A. H2/H4 Day-Card Interaction Contract 보존

- [x] 세로 스크롤 전용 유지 — 가로 스크롤 재도입 없음
- [x] Day card slot row 구조 유지: 끼니명 | 식사명 | 인분 chip | 상태 chip
- [x] 390px에서 2일 이상 overview 자연 달성 계획
- [x] Weekday strip swipe gesture 보존
- [x] Slot row 최소 height 44px 보존

### B. PLANNER_WEEK 정보 구조 보존

- [x] Hero section + "Planner Week" / "식단 플래너" 제목 보존
- [x] Secondary CTA toolbar 3-button 구조 보존 (장보기/요리하기/남은요리)
- [x] Week context bar + range label + meal count 보존
- [x] Weekday strip 7-day grid 보존
- [x] Day card header (weekday badge + date) 보존
- [x] Slot row 4-column layout (끼니명/식사명/인분/상태) 보존

### C. 토큰 계약 준수

- [x] Brand tokens (`--brand`, `--brand-deep`, `--brand-soft`) 사용 계획 명시
- [x] Additive tokens (`--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-sm/md/lg/xl/full`) 사용 계획 명시
- [x] `--olive` 보존 명시 (STATUS_META shopping_done, range context label)
- [x] 신규 토큰 추가 금지 명시
- [x] `color-mix()` 파생 전략 문서화 (STATUS_META 매핑 테이블 포함)

### D. 공유 프리미티브 소비 계획

- [x] Skeleton primitive 소비 계획 (loading skeleton)
- [x] `components/ui/*` 파일 수정 금지 명시

### E. 상태 보존

- [x] checking (auth check) 상태 보존 명시
- [x] authenticated (ready/empty/error/loading) 상태 보존 명시
- [x] unauthorized (gate + SocialLoginButtons) 상태 보존 명시
- [x] Error with retry action 보존 명시

---

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | Unauthorized state `bg-white/78` | unauthorized 상태 info box의 `bg-white/78`이 반투명이다. `--surface-fill` (#F8F9FA)로 교체하면 반투명 효과가 사라지지만, unauthorized 상태에서는 backdrop 위에 올라가는 것이 아니므로 opaque가 적절하다 | `bg-[var(--surface-fill)]` 사용 권장 |
| 2 | CTA toolbar `opacity-72` | 비활성 CTA 버튼에 `opacity-72`가 사용된다. 이는 Tailwind 기본값이 아닌 임의값이다 | Tailwind 기본값(60 또는 75)으로 정규화하거나 유지. 기능에 영향 없으므로 non-blocking |
| 3 | Day card `⋯` 더보기 버튼 | 현재 disabled 상태의 더보기 버튼이 `opacity-50`이다. 배민 스타일에서 disabled 톤이 일관되는지 확인 | Stage 4에서 disabled 요소의 opacity 일관성 확인. Non-blocking |

---

## 결론

Stage 1 산출물로 사용 가능하다. 구현 전 blocking issue는 없고, 위 authority risk 포인트 5건은 Stage 4 구현 시 before/after 비교로 해소하고 Stage 5 authority evidence에서 잠그면 충분하다. 단일 파일 대상이므로 scope 관리가 명확하다.
