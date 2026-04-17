# H1: home-first-impression — HOME Anchor Screen First-Impression Redesign

> **분류**: Anchor Screen High-Risk Redesign — Design Decision Gate
> **대상 화면**: `HOME` (anchor screen)
> **선행 workpack**: 없음 (최초 HOME redesign gate)
> **단계**: Stage 1 — Design Decision + Contract-Evolution Draft
> **작성일**: 2026-04-17

---

## Slice ID / Branch 정책

| 항목 | 값 |
|------|----|
| Slice ID (workpack 폴더) | `h1-home-first-impression` |
| FE 브랜치 | `feature/fe-h1-home-first-impression` |
| Docs 브랜치 | `docs/h1-home-first-impression-stage1` |
| Policy slug (check-workpack-docs) | `h1-home-first-impression` |

> 모든 slug는 lowercase로 통일한다. H2/H3 교훈: 대문자 포함 시 policy mismatch 유발.

---

## 목표

현행 HOME은 공통 브랜드 헤더 → discovery panel → 테마 섹션 → 모든 레시피 구조로
**처음 진입 시 실제 레시피 콘텐츠가 first viewport 바깥으로 밀리는 구조**다.

이 gate는 다음 두 가지를 확정한다:

1. **First viewport 정보 구조** — 사용자가 앱을 열었을 때 첫 화면에서 무엇을 봐야 하는가
2. **탐색 컨트롤의 상대적 우선순위** — 검색 / 재료 필터 / 정렬이 어디에 얼마나 강하게 배치되는가

이 결정이 잠기지 않으면 후속 HOME 개선(필터 강화, 개인화 섹션 등)에서 기준이 흔들린다.

---

## 현행 baseline 분석

### 현재 구조 (화면정의서 v1.3.1 §1)

```
[공통 브랜드 헤더] HOMECOOK
[discovery panel]
  └ 검색바 (레시피 제목 검색)
  └ [재료로 검색] 칩
[테마 섹션 ①] 이번 주 인기 레시피 ─ 더보기 >
  └ 2열 카드 그리드 (2행 = 4장)
[테마 섹션 ②] 간단 한끼 ─ 더보기 >
  └ 2열 카드 그리드
[모든 레시피]  [N개] [정렬 기준 ▾]
  └ 2열 카드 그리드 (무한 스크롤)
```

### 현행 구조의 문제점

| # | 문제 | 영향 |
|---|------|------|
| P1 | first viewport 진입 시 검색바 + 테마 섹션 헤더 + 카드 1~2장만 보임 — 실제 탐색 가능한 레시피 밀도가 낮다 | 앱이 비어 보이는 첫인상 |
| P2 | 테마 섹션이 고정 위치에 크게 자리잡아 "발견하러 왔다"는 사용자보다 "큐레이션을 보러 왔다"는 포지션으로 읽힘 | 홈쿡의 핵심 가치(탐색)와 어긋남 |
| P3 | 정렬 컨트롤이 스크롤 한참 아래에 있어, 사용자가 조회수/좋아요 기준으로 바꾸려면 헤더 → 테마 → 모든레시피 섹션까지 내려야 함 | control proximity 위반 (mobile-ux-rules §3a) |
| P4 | 테마 섹션 콘텐츠와 "모든 레시피" 콘텐츠가 시각적으로 같은 2열 카드 그리드라 섹션 구분이 약하다 | 정보 위계 불명확 |

### 현행 baseline critique 결과

`ui/designs/critiques/HOME-critique.md` — 2026-03-21: **조건부 통과**
- 크리티컬 이슈: 0개
- 마이너 이슈: 테마 empty 처리, 활성 필터 시각 언어
- 위 P1~P4는 critique 당시 명시된 문제가 아니라 **first-impression 관점 재검토**에서 새로 도출된 이슈다

---

## In Scope

- HOME first viewport 정보 구조 재설계 — 3개 안 비교 + 최종 방향 확정
- discovery panel 위치/비중 조정 여부
- 테마 섹션 처리 방식 (full / compact carousel / removed)
- 검색/필터/정렬의 시각적 우선순위 재배치
- mobile 390px / 320px 기준 first viewport 검증
- 화면정의서 §1 HOME 섹션 갱신 여부 결정
- authority evidence 계획 확정 (before/after 스크린샷 경로 잠금)

## Out of Scope

- INGREDIENT_FILTER_MODAL 내부 구조 변경 — 별도 slice
- 레시피 카드 컴포넌트 내부 변경 — 별도
- API/DB 구조 변경 — 금지 (GET /recipes, GET /themes 계약 그대로)
- 하단 탭바 구조 변경 — 공통 shell, 별도 gate 없이 변경 금지
- 개인화/추천 알고리즘 — 백엔드 범위
- 검색 결과 화면 분리 (별도 SEARCH 화면) — 별도 slice

---

## 비교안

### 안 A — Theme-first 유지안 (현행 폴리시)

> "큐레이션이 먼저, 탐색은 스크롤 후"

```
┌─────────────────────────────────┐
│ HOMECOOK                        │  ← 공통 브랜드 헤더 (현행 유지)
├─────────────────────────────────┤
│ 🔍 레시피 제목 검색              │  ← 검색바 (현행 유지)
│ [재료로 검색]                   │  ← 보조 액션 (현행 유지)
├─────────────────────────────────┤
│ 이번 주 인기      더보기 >       │  ← 테마 섹션 헤더 (현행 유지)
│ [카드][카드]                    │
│ [카드][카드]                    │  ← 4장 (2행)
├─────────────────────────────────┤
│ 모든 레시피   [12개] [정렬▾]    │
│ [카드][카드]                    │
│  ...                            │
└─────────────────────────────────┘
```

**특성**
- 화면정의서 §1 변경 최소: 구현 리스크 낮음
- 테마 섹션이 editorial 느낌 — "홈쿡 팀이 추천" 포지션 유지
- first viewport: 브랜드 헤더 + discovery panel + 테마 섹션 상단만 → 레시피 카드 1~2장

**장점**
- 계약 변경 없이 polish만으로 진행 가능
- 큐레이션이 먼저 보이므로 "발견의 즐거움" 제공
- 알려진 앱 패턴: Airbnb Experiences, Netflix 큐레이션 개념

**단점**
- P1: first viewport 레시피 밀도 낮음 — 탐색 목적으로 진입한 사용자는 즉시 원하는 것을 못 봄
- P3: 정렬 컨트롤이 스크롤 아래에 있어 control proximity 위반 지속
- "지금 인기" 같은 테마 데이터가 stale하면 의미 없는 공간 낭비

**Mobile UX 리스크**: 중간 — 기존 구조 유지지만 P1·P3 미해결

---

### 안 B — All-recipes-first 카탈로그안

> "탐색이 먼저, 큐레이션은 보조"

```
┌─────────────────────────────────┐
│ HOMECOOK                        │
├─────────────────────────────────┤
│ 🔍 레시피 제목 검색  [재료🔽] [정렬🔽]│  ← 검색+필터+정렬을 한 줄 컨트롤 바로
├─────────────────────────────────┤
│ 레시피 [152개]                  │  ← 섹션 헤더 (테마 없음)
│ [카드][카드]                    │
│ [카드][카드]                    │  ← first viewport에 카드 4~6장 진입
│ [카드][카드]                    │
│  ...                            │
└─────────────────────────────────┘
  (테마 섹션 없음 — 또는 맨 하단 "이런 레시피도")
```

**특성**
- 검색 + 재료 필터 + 정렬을 한 줄 컨트롤 바에 통합
- first viewport에 실제 레시피 카드 4~6장 노출
- 테마 섹션 제거 또는 하단 이동

**장점**
- P1/P3 해결: first viewport 레시피 밀도 극대화, 정렬이 콘텐츠 바로 위
- 식품 탐색/장보기 앱(쿠팡이츠, 배달의민족, Deliveroo) 패턴과 일치
- 검색+필터+정렬이 한 덩어리라 control proximity 완벽 준수
- API 변경 없음 — GET /recipes만 사용, 테마 섹션 API 호출 생략 가능

**단점**
- 테마 섹션 제거 시 화면정의서 §1 구조 변경 → contract-evolution 필요
- "큐레이션" 없어지면 앱의 editorial 느낌 약화 — 단순 레시피 DB 브라우저처럼 보일 수 있음
- 정렬/필터가 한 줄에 압축되면 320px 폭에서 잘릴 수 있음 (레이아웃 리스크)
- 재료로 검색이 filter icon으로 압축되면 기능 발견성 낮아짐

**Mobile UX 리스크**: 중간 — 컨트롤 바 레이아웃 깨질 가능성, 큐레이션 empty 리스크

---

### 안 C — Compact-header + Carousel 하이브리드안 (권고안)

> "탐색 컨트롤 첫 화면, 큐레이션은 compact strip, 정렬은 대상 섹션에"

```
┌─────────────────────────────────┐
│ HOMECOOK                        │  ← 공통 헤더 (현행 유지)
├─────────────────────────────────┤
│ 🔍 레시피 제목 검색              │  ← 검색바 (현행 유지)
│ [🥕 재료로 검색]                │  ← 재료 필터 단독 행 (discovery area)
├─────────────────────────────────┤
│ 이번 주 인기 ──────────── >     │  ← compact 수평 strip (카드 1.5개 노출)
│ [카드] [카드] [카드 ...]         │  ← 가로 스크롤, peek 패턴
├─────────────────────────────────┤
│ 모든 레시피  [152개]  [정렬▾]   │  ← 섹션 헤더 + 정렬 컨트롤 (현행 위치 유지)
│ [카드][카드]                    │
│ [카드][카드]                    │  ← 카드 1행은 first viewport 하단 peek
│  ...                            │
└─────────────────────────────────┘
  390px first viewport:
  헤더(50) + 검색바(52) + 재료필터행(44) + carousel헤더(28) + strip(130) + 섹션헤더(36) = 340px
  → 390px에서 "모든 레시피 [정렬▾]"가 first viewport 안에 들어오고, 카드 상단이 peek됨
```

**특성**
- 검색과 재료 필터는 discovery area에 그룹화 (정렬과 분리)
- 정렬은 "모든 레시피" 섹션 헤더에 위치 — **정렬이 모든 레시피를 정렬하는 것임을 명확히**
- 테마 섹션을 compact horizontal carousel strip (1.5~2장 peek)으로 축소
- carousel strip이 130px 수준으로 작아져 "모든 레시피 [정렬▾]" 섹션 헤더가 first viewport 안에 진입

**장점**
- P1 해결: 테마 strip 축소로 레시피 섹션 헤더가 first viewport에 들어옴 (정렬 포함)
- P3 해결: 정렬이 "모든 레시피"라는 정렬 대상과 같은 헤더에 위치 — control proximity 의미상 준수
- 의미 일관성: 정렬=모든레시피 연결이 명확, 재료필터=검색 연결이 명확
- 큐레이션 feel 유지: 테마 strip은 없애지 않고 compact 처리
- 안 B보다 계약 변경 범위 작음: 테마 섹션 형태 변경이지 제거가 아님
- Naver 레시피, 만개의레시피, Yummly 등 유사 레퍼런스 패턴

**단점**
- carousel strip은 가로 스크롤이므로 mobile-ux-rules §1 "localized horizontal scroll" 허용 구간
  — 단, 시각적 affordance(peek + hint)가 명확해야 함

**Mobile UX 리스크**: 낮음 — 320px에서 재료 필터가 단독 행이라 레이아웃 리스크 없음

---

## 최종 권고안: 안 C

### 왜 안 C인가

| 기준 | 안 A | 안 B | 안 C |
|------|------|------|------|
| first viewport 레시피 밀도 | ❌ 낮음 | ✅ 높음 | ✅ 중간~높음 |
| 정렬 control proximity | ❌ 위반 | ✅ 준수 | ✅ 준수 |
| 큐레이션 editorial feel | ✅ 강함 | ❌ 없음 | ✅ 유지 (compact) |
| contract-evolution 범위 | ✅ 없음 | ⚠️ 큼 | 🔶 소규모 |
| 320px 레이아웃 안정성 | ✅ 검증됨 | ⚠️ 리스크 | 🔶 검증 필요 |
| 익숙한 앱 패턴 fit | 🔶 보통 | ✅ 높음 | ✅ 높음 |
| 구현 리스크 | 낮음 | 중간 | 낮음~중간 |

안 C는 **안 A의 편집 가치**와 **안 B의 탐색 효율**을 함께 가져가는 접점이다.
특히 정렬을 discovery panel 행으로 올리는 것만으로도 P3를 해결하면서 계약 변경은 최소화된다.
테마 섹션을 carousel strip으로 compact화하면 P1도 부분 해결된다.

### 안 C 핵심 결정 사항

| ID | 결정 | 내용 |
|----|------|------|
| D1 | 정렬 컨트롤 위치 | "모든 레시피" 섹션 헤더에 유지 (`모든 레시피 [N개] [정렬▾]`) — 정렬 대상과 같은 헤더에 두어 의미 명확 |
| D2 | 테마 섹션 처리 | compact horizontal carousel strip (높이 ~130px, 카드 1.5개 peek) |
| D3 | 재료 필터 위치 | 검색바 아래 단독 행 — discovery area에 그룹화, 정렬과 분리 |
| D4 | 전체 방향 | 안 C (compact carousel hybrid) |

---

## 계약 영향도

### 화면정의서 §1 HOME 변경

| 항목 | 현재 (v1.3.1) | 변경 방향 (안 C 확정) |
|------|--------------|---------------------|
| UI 구성 순서 | 헤더 → discovery panel → 테마 섹션(2열 그리드) → 모든 레시피(정렬) | 헤더 → discovery panel(검색 + 재료 필터 단독 행) → 테마 carousel strip → 모든 레시피(정렬 유지) |
| 정렬 컨트롤 위치 | 모든 레시피 섹션 헤더 | **변경 없음** — 모든 레시피 섹션 헤더에 유지 |
| 테마 섹션 형태 | 2열 그리드 섹션 | compact horizontal carousel strip (1.5장 peek, ~130px) |
| 재료 필터 위치 | 검색바 아래 단독 행 | **변경 없음** — 검색바 아래 단독 행 유지 |

→ **contract-evolution 필요**: 화면정의서 §1 HOME 테마 섹션 형태 변경 → v1.4.0
→ **변경 최소화**: 정렬 위치·재료 필터 위치 모두 현행 유지, 테마 섹션 형태만 변경

### 유저플로우 §① 레시피 탐색 여정

- 탐색 → 상세 기본 플로우: 변경 없음
- 정렬 컨트롤 위치 이동: 플로우 자체 변경 없음 (진입/이탈 경로 동일)

→ **유저플로우 변경 불필요** (D1~D4 기준)

### API/DB

- `GET /recipes` 계약 — 변경 없음
- 테마 섹션 API — carousel strip으로 재사용, 계약 변경 없음
- DB 구조 — 변경 없음

---

## Authority 계획

### 왜 high-risk redesign인가

- `HOME`은 `docs/design/anchor-screens.md`에 명시된 3개 anchor screen 중 하나
- 정보 구조 재배치(테마 섹션 형태 변경, 섹션 위계 변경) → anchor screen extension 조건 충족
- "첫 인상과 탐색 패턴을 결정"하는 화면이므로 UI change가 전체 서비스 인상에 직접 영향
- `docs/engineering/product-design-authority.md`: anchor screen 확장은 authority review 필수

### Stage 4 Evidence 계획

| # | artifact | 경로 | 설명 |
|---|----------|------|------|
| E1 | HOME before (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-before-mobile.png` | 구현 전 현행 first viewport |
| E2 | HOME after (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-mobile.png` | 구현 후 first viewport |
| E3 | HOME after narrow (320px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-narrow.png` | 좁은 폭 레이아웃 안정성 |
| E4 | HOME scrolled (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-after-scrolled.png` | 스크롤 후 레시피 그리드 |
| E5 | filter active (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-filter-active.png` | 재료 필터 활성 상태 |
| E6 | sort active (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-sort-active.png` | 정렬 bottom sheet 상태 |
| E7 | carousel strip (390px) | `ui/designs/evidence/h1-home-first-impression/HOME-carousel-strip.png` | 테마 compact strip + peek |

---

## Contract-Evolution 실행 순서

```
Stage 1 문서 확정 (이 README)
  ↓ 사용자 승인 (D1/D2/D3/D4) — ✅ 2026-04-17 확정
화면정의서 v1.4.0 §1 HOME 갱신
  → 테마 섹션: 2열 그리드 → compact horizontal carousel strip 으로 명시
  → 정렬 컨트롤 위치: 현행 유지 (모든 레시피 섹션 헤더)
  → 재료 필터 위치: 현행 유지 (검색바 아래 단독 행)
  ↓ contract-evolution PR (화면정의서 v1.4.0 + CURRENT_SOURCE_OF_TRUTH.md)
  ↓
feature/fe-h1-home-first-impression 구현 시작 허가
```

---

## Frontend Delivery Mode

- 공식 계약 변경(contract-evolution PR) **이후** 구현 시작
- FE-only — API/DB 변경 없음
- 브랜치: `feature/fe-h1-home-first-impression`
- 변경 대상 컴포넌트 (Stage 4 시):
  - `HomeScreen` — 섹션 구조 재배치
  - 테마 섹션 → compact horizontal carousel strip (주요 변경)
  - 정렬 컨트롤 — 위치 변경 없음, "모든 레시피" 섹션 헤더 유지
  - 재료 필터 — 위치 변경 없음, 검색바 아래 단독 행 유지

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현 완료, Stage 5 디자인/authority review 대기
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> `h1-home-first-impression`은 2026-04-17 Stage 5 authority review에서 `pass`를 받아 현재 상태를 `confirmed`로 올린다.

---

## Design Authority

- UI risk: `anchor-screen-redesign` (HIGH)
- **왜 high-risk인가**:
  - HOME은 서비스 최초 인상을 결정하는 anchor screen
  - 섹션 위계 변경 (테마 형태 + 정렬 위치) — anchor extension 조건 완전 충족
  - 가로 스크롤 carousel 도입: `mobile-ux-rules §1` localized horizontal scroll 허용 구간이나 affordance 검증 필수
  - 320px에서 discovery panel 보조 행(필터+정렬) 레이아웃 안정성 검증 필수
- authority report 예정 경로: `ui/designs/authority/HOME-authority.md`

### Blocker 판정 기준

- carousel strip이 page-level 가로 스크롤처럼 느껴짐 (affordance 실패)
- first viewport에서 실제 레시피 카드 0장이고 "모든 레시피 [정렬▾]" 헤더도 보이지 않음
- 재료 필터 칩 / 정렬 칩 / carousel 카드 터치 타겟 44px 미달
- 테마 섹션이 여전히 2열 full 그리드 형태 (D2 미이행)

---

## Dependencies

| 선행 | 상태 |
|------|------|
| 없음 — HOME redesign 최초 gate | — |

---

## Stage 1 Delivery Checklist

- [x] In Scope / Out of Scope 정의
- [x] 비교안 3개 (A 유지 / B 카탈로그 / C 하이브리드) 옵션 정리
- [x] 최종 권고안 및 근거 명시 (안 C)
- [x] UX 결정 사항 D1/D2/D3/D4 정리
- [x] 계약 영향도 분석 (API/DB 불변, 화면정의서 v1.4.0 필요)
- [x] contract-evolution 경로 정리
- [x] authority 위험도 분류 + evidence plan 잠금 (E1~E7)
- [x] Slice ID / Branch slug policy 명시
- [x] 사용자 승인 (D1/D2/D3/D4 결정 확인) — ✅ 2026-04-17 (D2/D4 승인, D1/D3 수정 확정)
- [x] contract-evolution PR (화면정의서 v1.4.0) — ✅ PR #139 merged 2026-04-17
- [x] feature/fe-h1-home-first-impression 구현 시작 허가 (PR #139 merge 후)

## Delivery Checklist

- [x] ThemeSection → ThemeCarouselStrip 교체 (compact horizontal carousel, 200px 카드, 88px 썸네일) <!-- omo:id=h1-delivery-theme-carousel;stage=4;scope=frontend;review=5,6 -->
- [x] 재료 필터 standalone row 확인 (mobile 기존 동작 유지, desktop도 단독 행) <!-- omo:id=h1-delivery-filter-row;stage=4;scope=frontend;review=5,6 -->
- [x] 정렬은 "모든 레시피" 섹션 헤더에 유지 (위치 변경 없음) <!-- omo:id=h1-delivery-sort-placement;stage=4;scope=frontend;review=5,6 -->
- [x] `scrollbar-hide` + `overscroll-x-contain` + `scroll-snap-type: x mandatory` 적용 <!-- omo:id=h1-delivery-carousel-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] 우측 gradient fade overlay (`pointer-events-none`) 구현 <!-- omo:id=h1-delivery-carousel-affordance;stage=4;scope=frontend;review=5,6 -->
- [x] E1~E7 evidence 캡처 완료 <!-- omo:id=h1-delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] vitest home-screen 14/14 pass <!-- omo:id=h1-delivery-vitest;stage=4;scope=frontend;review=6 -->
- [x] TypeScript 타입 오류 0개 <!-- omo:id=h1-delivery-typecheck;stage=4;scope=frontend;review=6 -->
- [x] ESLint 0 errors <!-- omo:id=h1-delivery-lint;stage=4;scope=frontend;review=6 -->
- [x] qa-visual (HOME baselines 갱신), qa-a11y 18/18 pass <!-- omo:id=h1-delivery-qa;stage=4;scope=frontend;review=5,6 -->
- [x] authority review (`ui/designs/authority/HOME-authority.md`) <!-- omo:id=h1-delivery-authority-review;stage=4;scope=frontend;review=5,6 -->
