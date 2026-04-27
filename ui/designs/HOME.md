# HOME — 홈(레시피 탐색)

> 기준 문서: 화면정의서 v1.4.0 §1 / 요구사항 v1.6.3 §1-1 / 유저Flow맵 v1.3.0 §① / 디자인 토큰 C2 명랑한 주방
> 생성일: 2026-03-21
> 최종 갱신: 2026-04-17 (H1 home-first-impression Stage 4 — carousel strip 전환)

---

## 레이아웃 와이어프레임 (v1.4.0 — H1 carousel strip)

```
┌─────────────────────────────────────────┐  ← 375px (모바일 기준)
│  HOMECOOK                               │  ← 공통 브랜드 헤더
│                                         │
│  ┌─────────────────────────────────┐    │  ← discovery panel (glass-panel)
│  │  🔍  레시피 제목 검색           │    │  ← search bar, min-h-14
│  │  [재료로 검색]                  │    │  ← 재료 필터 단독 행, min-h-11
│  └─────────────────────────────────┘    │
│                                         │
│  이번 주 인기 레시피          [N개]     │  ← compact carousel 헤더 (tertiary badge)
│  ┌────────┐ ┌────────┐ ┌──────      │  ← horizontal strip, overflow-x-auto
│  │[thumb] │ │[thumb] │ │ peek       │  ← 카드 width: 200px, height: ~128px
│  │ 제목   │ │ 제목   │ │            │  ← scrollbar-hide + gradient fade overlay
│  └────────┘ └────────┘ └──────      │  ← scroll-snap-type: x mandatory
│                                  ╌╌╌│  ← right gradient hint
│  모든 레시피     [N개] [정렬 기준▾]  │  ← 섹션 헤더 + 정렬 (first viewport 내)
│                                         │
│  ┌─────────────┐  ┌─────────────┐       │  ← 2열 그리드 (상단 peek)
│  │  [썸네일]   │  │  [썸네일]   │       │
│  └─────────────┘  └─────────────┘       │
│                                         │
└─────────────────────────────────────────┘

first viewport 390px:
  헤더(~50) + discovery panel(~110) + carousel헤더(~28) + strip(~105) + 섹션헤더(~44) = ~337px
  → "모든 레시피 [정렬▾]" 섹션 헤더 first viewport 안에 진입 ✅
  → 레시피 카드 상단 peek로 스크롤 유도
```

---

## 컴포넌트 상세

### 검색바

- **기본 상태**: 입력 전 placeholder "레시피 제목 검색" 표시, --muted 색상
- **활성 상태**: 포커스 시 border-color: --brand, 커서 표시
- **입력 중**: 우측에 [X] 초기화 버튼 표시 (44×44px 터치 타겟)
- **검색 결과 반영**: 입력값 변경 시 debounce(300ms) 후 레시피 그리드 즉시 갱신
- **Loading**: 그리드 영역 스켈레톤으로 전환
- **Empty**: "조건에 맞는 레시피가 없어요" + [필터 초기화] 버튼
- **Error**: "레시피를 불러오지 못했어요" + [다시 시도] 버튼
- **토큰**: `--surface` 배경, `--muted` placeholder, `--foreground` 입력 텍스트, `--brand` 포커스 보더

### 탐색 패널

#### [재료로 검색] 칩 버튼
- **기본 상태**: --olive 테두리 + 텍스트, 배경 투명 (ghost 스타일)
- **활성 상태 (재료 선택 후)**: --olive 배경 + 흰색 텍스트, 선택 재료 수 배지 표시 (--brand 배지)
- **탭**: `INGREDIENT_FILTER_MODAL` 진입
- **터치 타겟**: 44px 이상
- **배치**: 제목 검색 입력 바로 아래, discovery panel 안의 단일 보조 액션
- **토큰**: `--olive`, border-radius: 9999px, `--space-2` 내부 패딩

#### `INGREDIENT_FILTER_MODAL`
- **mobile**: bottom sheet 패턴. eyebrow 없는 `ModalHeader` + 검색 입력 + 카테고리 chip rail + 체크리스트 + sticky footer 액션
- **desktop**: centered modal 패턴. 동일한 header hierarchy를 유지하되 넓은 폭에서는 카테고리 chip wrap 허용
- **제목/도움말**: `재료로 검색` / `원하는 재료를 골라 레시피를 좁혀요`
- **닫기 버튼**: icon-only 원형 버튼
- **선택 요약**: 헤더 badge와 footer summary를 중복 사용하지 않고 한 군데만 강조
- **primary action**: `n개 적용` 형태로 선택 규모를 즉시 알 수 있게 표시
- **카테고리 선택**: mobile에서는 localized horizontal scroll rail, desktop에서는 wrap
- **rail affordance**: 초기 시스템 scrollbar가 아니라 fade/peek로 스크롤 가능성 표시
- **토큰**: `--panel`, `--surface`, `--line`, `--olive`, `--brand`

#### 정렬 드롭다운
- **기본값**: 조회수순
- **옵션**: 조회수순 / 저장순 / 좋아요순 / 플래너 등록순
- **배치**: 상단 검색 패널이 아니라 `모든 레시피` 섹션 헤더 우측에 배치
- **변경 시**: 즉시 재정렬, `모든 레시피` 리스트만 다시 요청하며 테마 섹션은 유지
- **제목/도움말**: `정렬 기준` / `모든 레시피 순서를 바꿔요`
- **스타일**: --surface 배경, --line 보더, border-radius: 9999px, --foreground 텍스트
- **선택 상태**: dark fill 대신 olive tint + check/dot 계열
- **불필요한 badge 제거**: `현재 {label}` badge는 사용하지 않음
- **레이어 정책**:
  - mobile: bottom sheet (`scrim z-30`, sheet `z-40`)
  - desktop: button 아래 또는 위로 여는 pop menu (`z-20`), viewport 남은 공간이 부족하면 위쪽으로 열린다
- **터치 타겟**: 44px 이상
- **토큰**: `--surface`, `--line`, `--foreground`, `--muted`

### 테마 섹션

- **구성**: 섹션 헤더 + 2열 레시피 카드 그리드
- **섹션 헤더**: 테마명(text-lg, --foreground) + "더보기 >" 링크(text-sm, --muted)
- **테마 종류**: 인기 / 간단 한끼 / 홈파티 등 (서버에서 동적 구성)
- **섹션 간 간격**: --space-8 (32px)
- **Loading**: 섹션 헤더 스켈레톤 1줄 + 카드 스켈레톤 4개 (2×2)
- **Empty**: 해당 테마 섹션 자체를 숨김 처리 (섹션이 0개면 전체 Empty 상태)
- **토큰**: `--foreground` 섹션 제목, `--muted` 더보기 링크

### 레시피 카드

```
┌───────────────────────┐
│                       │  ← 썸네일 (가로 전체, 높이 110px, object-fit: cover)
│      [썸네일 이미지]   │  ← border-radius 16px 16px 0 0
│                       │
├───────────────────────┤
│  [SOURCE TYPE]         │  ← source badge, panel bg, text-xs
│  #태그1  #태그2  +1    │  ← text tag row, text-xs (10~11px)
│  레시피 제목           │  ← text-base (16px), --foreground, 최대 2줄 말줄임
│  최대 2줄   [기본 N인분]│  ← font-weight: 600 + serving pill
│                       │
│  [조회 1.2k] [좋아요 84]│  ← compact muted stat pills
│  [저장 32]             │
└───────────────────────┘
  ← --surface 배경, border-radius: 16px
  ← box-shadow: 0 2px 10px rgba(0,0,0,0.08)
  ← --line 보더 (선택적)
```

- **기본 상태**: 썸네일 + source badge + 태그 + 제목 + 기본 인분 pill + 통계 pill row
- **source badge 라벨**: `system → 집밥 추천`, `youtube → 유튜브`, `manual → 직접 등록`
- **Loading**: 스켈레톤 카드 (썸네일 영역 회색 블록, 텍스트 영역 줄 스켈레톤 2줄)
- **썸네일 없음**: --background 배경 + 음식 아이콘 중앙 배치
- **태그 배치**: 제목 위 보조 row, 배경 없는 text tag로 유지
- **인분 배치**: 제목 row 우측에 `기본 N인분` pill
- **통계 배치**: 카드 하단 muted pill row (`조회 / 좋아요 / 저장`)
- **탭 동작**: 카드 전체 영역 탭 → RECIPE_DETAIL 진입
- **Pressed 상태**: opacity 0.85, scale 0.98 (100ms transition)
- **터치 타겟**: 카드 전체 (최소 높이 충분히 초과)
- **토큰**: `--surface` 카드 배경, `--foreground` 제목, `--olive` 태그, `--muted` 통계

### 레시피 그리드 공통 상태

- `HOME`의 Empty / Error는 shared `ContentState` shell을 사용한다.
- eyebrow pill + headline + 설명 + CTA 위계를 유지해 `RECIPE_DETAIL`, `PLANNER_WEEK`, 로그인 게이트와 상태 톤을 맞춘다.
- CTA가 있는 상태 셸은 하단 탭바 safe-area 위에서 읽히도록 `action-safe-bottom-panel` 여백 규칙을 공유한다.

- **Loading**
  ```
  ┌─────────────┐  ┌─────────────┐
  │  ░░░░░░░░   │  │  ░░░░░░░░   │  ← 회색 스켈레톤 블록
  │  ░░░░░░░    │  │  ░░░░░░░    │  ← pulse 애니메이션
  │  ░░░░        │  │  ░░░░        │
  └─────────────┘  └─────────────┘
  ```
  스켈레톤 카드 6개 (2×3) 표시

- **Empty** (검색/필터 결과 없음)
  ```
  ┌─────────────────────────────────┐
  │                                 │
  │     [다른 조합]                 │  ← eyebrow pill
  │   다른 조합을 찾아보세요         │  ← --foreground, text-base
  │   조건에 맞는 레시피가 없어요    │  ← --muted, text-sm
  │                                 │
  │   ┌───────────────────────┐     │
  │   │     필터 초기화        │     │  ← --brand CTA 버튼
  │   └───────────────────────┘     │
  │                                 │
  └─────────────────────────────────┘
  ```

- **Error** (네트워크/서버 오류)
  ```
  ┌─────────────────────────────────┐
  │                                 │
  │   [목록 동기화 오류]             │  ← eyebrow pill
  │   레시피를 불러오지 못했어요     │  ← --foreground, text-base
  │   연결/API 확인 후 다시 시도      │  ← --muted, text-sm
  │                                 │
  │   ┌───────────────────────┐     │
  │   │       다시 시도        │     │  ← --brand CTA 버튼
  │   └───────────────────────┘     │
  │                                 │
  └─────────────────────────────────┘
  ```

### 로그인 게이트 모달 (LoginRequiredModal)

좋아요/저장/플래너 추가 등 로그인 필요 액션 시도 시 표시.
HOME 화면 자체에서는 카드 탭(RECIPE_DETAIL 이동)만 발생하므로 모달 직접 트리거 없음.
단, 향후 카드 내 좋아요 버튼 추가 시 이 모달 사용.

```
┌─────────────────────────────────────────┐
│  ░░░░░░░░░ dim overlay bg-black/50 ░░░  │
│  ┌─────────────────────────────────┐    │  ← --panel 배경, border-radius: 20px
│  │                                 │    │
│  │          🔒                     │    │
│  │   로그인이 필요해요              │    │  ← text-lg, --foreground
│  │   이 기능은 로그인 후 사용       │    │  ← text-sm, --muted
│  │   가능해요.                     │    │
│  │                                 │    │
│  │  ┌─────────────────────────┐   │    │  ← --brand 배경, border-radius: 12px
│  │  │        로그인하기        │   │    │  ← 흰색 텍스트, text-base, 600
│  │  └─────────────────────────┘   │    │
│  │  ┌─────────────────────────┐   │    │  ← --surface 배경, --muted 텍스트
│  │  │         나중에           │   │    │
│  │  └─────────────────────────┘   │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 하단 탭바 (BottomTabBar)

```
┌─────────┬─────────┬─────────┬─────────┐
│   🏠    │   📅    │   🧊    │   👤    │
│   홈    │ 플래너  │ 팬트리  │마이페이지│
│ (활성)  │         │         │         │
└─────────┴─────────┴─────────┴─────────┘
  ← --panel 배경 (반투명), 상단 --line 보더
  ← 높이: 56px + safe-area-inset-bottom
  ← 활성 탭 아이콘 + 레이블: --brand (#FF6C3C)
  ← 비활성 탭 아이콘 + 레이블: --muted (#999999)
  ← 각 탭 터치 타겟: 44×44px 이상
```

- 플래너/팬트리/마이페이지 탭 탭 시 비로그인 → LoginRequiredModal 표시 (return-to-action 포함)

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | 로그인 필요 |
|------|--------|------|------------|
| 레시피 탐색 | 앱 실행/홈 탭 탭 | HOME 화면 진입, 기본 레시피 목록 로드 | N |
| 제목 검색 | 검색바 입력 (debounce 300ms) | 레시피 그리드 즉시 갱신 | N |
| 재료로 검색 | [재료로 검색] 칩 탭 | `INGREDIENT_FILTER_MODAL` 진입 | N |
| 정렬 변경 | 정렬 드롭다운 선택 | 즉시 재정렬 | N |
| 레시피 카드 탭 | 카드 전체 영역 탭 | RECIPE_DETAIL 진입 | N |
| 필터 초기화 | Empty 상태 [필터 초기화] 탭 | 검색어 + 재료 필터 + 정렬 초기화 → 기본 목록 로드 | N |
| 다시 시도 | Error 상태 [다시 시도] 탭 | 레시피 목록 API 재요청 | N |
| 플래너 탭 이동 | 하단 탭바 플래너 탭 탭 | 로그인 시 PLANNER_WEEK / 비로그인 시 LoginRequiredModal | Y (비로그인 시 게이트) |
| 팬트리 탭 이동 | 하단 탭바 팬트리 탭 탭 | 로그인 시 PANTRY / 비로그인 시 LoginRequiredModal | Y (비로그인 시 게이트) |
| 마이페이지 탭 이동 | 하단 탭바 마이페이지 탭 탭 | 로그인 시 MYPAGE / 비로그인 시 LoginRequiredModal | Y (비로그인 시 게이트) |
| 로그인 후 복귀 | LoginRequiredModal [로그인하기] | LOGIN 화면 → 로그인 완료 → return-to-action 복귀 | — |

---

## 스크롤 & 레이아웃 동작

- **전체 구조**: 공통 브랜드 헤더 / discovery panel / 테마 섹션 / `모든 레시피` 리스트 / `position: fixed` 하단 탭바
- **콘텐츠 영역**: 일반 세로 스크롤. discovery panel은 첫 화면 안에 남기되, 별도 fixed app bar처럼 분리하지 않는다.
- **브랜드 헤더**: `HOMECOOK` 로고는 공통 `AppHeader`를 사용하며, `PLANNER_WEEK`와 동일한 top shell을 공유한다.
- **small-mobile 기준**: `HOMECOOK` 헤더 + discovery panel 조합에서도 작은 모바일 sentinel에서 제목 검색 입력과 `재료로 검색` 버튼이 first viewport 안에 함께 보여야 한다.
- **정렬 위치**: 정렬 컨트롤은 검색 패널이 아니라 `모든 레시피` 섹션에 속한다. 테마 섹션은 별도 정렬 대상이 아니다.

---

## 화면 정의서 매핑

| 정의서 항목 | 구현 여부 | 비고 |
|------------|----------|------|
| 상단 검색바 (placeholder: "레시피 제목 검색") | ✅ | 공통 브랜드 헤더 아래 discovery panel에 배치 |
| [재료로 검색] 버튼 → INGREDIENT_FILTER_MODAL | ✅ | mobile sheet / desktop modal 패턴으로 구현 |
| 정렬 드롭다운 (기본: 조회수순) | ✅ | `모든 레시피` 섹션 헤더 우측에 배치 |
| 테마 섹션 (인기/간단 한끼/홈파티 등) | ✅ | 서버 동적 구성, 섹션 헤더 + 그리드 |
| 레시피 카드: 썸네일 | ✅ | 110px 고정 높이, fallback 아이콘 포함 |
| 레시피 카드: 제목 | ✅ | 최대 2줄 말줄임 |
| 레시피 카드: 조회수 | ✅ | 통계 행 (text-xs) |
| 레시피 카드: 좋아요 수 | ✅ | 통계 행 |
| 레시피 카드: 저장 수 | ✅ | 통계 행 |
| 레시피 카드: 태그 | ✅ | --olive 칩, 최대 3개 + +N |
| 카드 탭 → RECIPE_DETAIL | ✅ | 전체 카드 영역 탭 |
| 정렬 변경 → 즉시 재정렬 | ✅ | 클라이언트 우선 적용 후 서버 재요청 |
| 제목 검색 → 결과 리스트 갱신 | ✅ | debounce 300ms |
| Loading 상태: 스켈레톤 카드 | ✅ | pulse 애니메이션 6개 |
| Empty 상태 + [필터 초기화] | ✅ | --brand CTA |
| Error 상태 + [다시 시도] | ✅ | --brand CTA |
| 하단 탭바: 홈/플래너/팬트리/마이페이지 | ✅ | 4탭 고정 |

---

## 디자인 결정 사항

1. **공통 브랜드 헤더 사용**: `HOMECOOK` 로고는 공통 `AppHeader`를 사용해 HOME / PLANNER_WEEK / DETAIL의 상단 좌상단 구조를 맞춘다. 로고는 항상 `/` 링크로 동작한다.

2. **재료 필터와 정렬 패턴 통일**: `INGREDIENT_FILTER_MODAL`과 mobile 정렬 선택은 모두 bottom sheet 계열의 선택 패턴을 사용한다. 헤더 위계, 닫기 버튼, 선택 요약, 하단 액션 배치를 맞춰 같은 계열의 인터랙션으로 느껴지게 한다.

3. **2열 그리드 선택**: 화면정의서에 "레시피 그리드(카드)"로만 명시되어 있고 열 수 미지정. 모바일 375px 기준에서 썸네일 가독성과 정보 밀도를 고려하여 2열 고정 그리드를 채택한다. 썸네일 높이 110px는 카드 너비(약 165px) 대비 약 0.67 비율로 음식 사진 노출에 적합하다.

4. **discovery panel 우선 배치**: 검색과 재료 필터는 첫 패널에 압축해 두되, fixed 검색바처럼 별도 레이어로 분리하지 않는다. 브랜드 헤더와 검색 패널을 분리해 첫 인상을 단순하게 유지한다.

5. **태그 칩 최대 3개 + +N**: 카드 공간 한계상 전체 태그 노출 불가. 3개 초과 시 "+N" 표기. 화면정의서에 태그 표시 개수 미지정 — 이 설계 결정을 따른다.

6. **통계 아이콘 텍스트 표기**: 조회수(👁)/좋아요(❤)/저장(🔖) 순서로 배치. 순서는 화면정의서 §1 레시피 카드 정보 순서를 따른다(조회수 → 좋아요 수 → 저장 수).

---

## design-critic 검토 필요 항목

- [ ] 2열 그리드에서 카드 제목 2줄 말줄임 시 카드 높이 균등화 처리 방식 (CSS grid auto-rows vs 개별 고정 높이)
- [x] 공통 브랜드 헤더 + discovery panel 조합에서 작은 모바일 세로 높이와 safe-area 여유 확인
- [x] 정렬 드롭다운 열림 시 z-index 레이어 충돌 (테마 섹션 카드와의 겹침) 검토
- [ ] 테마 섹션이 0개일 때의 전체 Empty 처리 vs 섹션별 Empty 처리 기준 명확화
- [x] [재료로 검색] 활성 상태(재료 선택 적용 중)에서 선택 수와 요약 문구가 과하지 않게 유지되는지 확인
- [ ] 스켈레톤 카드 수(현재 6개)가 뷰포트에서 적절한지 — 더 많이 보이는 기기에서 빈 공간 발생 가능성

---

## Baemin-Style Visual Retrofit Addendum

> 추가일: 2026-04-27
> 관련 슬라이스: `baemin-style-home-retrofit`
> 선행 슬라이스: `baemin-style-shared-components` (merged), `baemin-style-token-values` (merged), `h1-home-first-impression` (merged)
> 프로토타입 참조: `ui/designs/prototypes/baemin-redesign/HANDOFF.md` §5.1 — **REFERENCE ONLY**. 공식 문서 및 workpack이 프로토타입과 충돌 시, 공식 문서/workpack이 우선한다.

### 목적

H1 정보 구조(D1-D4)를 **그대로 보존**하면서, 승인된 배민 스타일 토큰(`--brand` #ED7470, `--brand-deep` #C84C48, `--brand-soft` #FDEBEA)과 additive 토큰(`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-*`)으로 HOME의 시각적 레이어를 교체한다. `components/ui/` 공유 프리미티브(Card, Badge, Chip, Skeleton, EmptyState, ErrorState)를 적합한 곳에서 소비한다.

### 핵심 원칙: 구조 보존, 시각 교체

```
H1 정보 구조 (변경 없음)         배민 스타일 시각 레이어 (교체 대상)
─────────────────────────       ─────────────────────────────────
AppHeader (brand text)     →    토큰 기반 surface/shadow, brand hover
Discovery panel layout     →    토큰 기반 glass-panel, border, shadow
  - 검색바 위치/동작       →    토큰 기반 surface/border/shadow
  - 재료필터 단독행 위치   →    토큰 기반 olive/brand, color-mix()
Theme carousel strip       →    토큰 기반 card surface, shadow, gradient
  - compact 헤더 형태      →    토큰 기반 text color
  - horizontal scroll      →    토큰 기반 right-fade gradient
모든 레시피 section        →    토큰 기반 section header text
  - 정렬 = 섹션헤더 우측   →    토큰 기반 sort button/sheet
  - 2열 카드 그리드        →    Card primitive + 토큰 기반 surface
RecipeCard 구조            →    Card/Badge primitive, 토큰 기반 stats
Skeleton 패턴              →    Skeleton primitive 또는 토큰 기반 bg
Loading/Empty/Error 상태   →    보존 (ContentState 기반)
```

### 컴포넌트별 리트로핏 델타 테이블

| 컴포넌트 | 현행 스타일 | 리트로핏 대상 | 비고 |
| --- | --- | --- | --- |
| **AppHeader** | `glass-panel`, hardcoded `hover:text-[var(--brand-deep)]` | Surface/shadow 토큰, brand hover 토큰 | Jua 폰트 import 금지 (prototype 참조일 뿐) |
| **Discovery panel** | `glass-panel rounded-[24px] border-white/55 bg-white/76` | 토큰 기반 surface/border/radius/shadow | `glass-panel` inline override 또는 토큰 교체 |
| **검색바** | `border-[var(--line)] bg-white shadow-[0_12px_28px_rgba(...)]` | 토큰 기반 surface/line/shadow | `--surface`, `--shadow-1` 사용 |
| **재료필터 버튼 (비활성)** | `border-[color:rgba(224,80,32,0.16)] bg-white text-[color:#9f3614]` | `color-mix()` 기반 brand 파생 또는 `--brand-deep`/`--brand-soft` | Hardcoded hex/rgba 제거 |
| **재료필터 버튼 (활성)** | `border-[var(--olive)] bg-[var(--olive)] text-white` | `text-[var(--surface)]` (white literal 제거) | `--olive` 보존 per H5 |
| **필터 요약 바** | `border-[color:rgba(46,166,122,0.14)] bg-[color:rgba(46,166,122,0.08)]` | `color-mix(in srgb, var(--olive) 14%, transparent)` 등 | Hardcoded rgba 제거 |
| **ThemeCarouselStrip 헤더** | `text-base font-extrabold text-[var(--foreground)]` | 토큰 기반 (이미 토큰 사용 — 확인 후 유지) | |
| **ThemeCarouselCard** | `border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]` + hardcoded rgba gradient | Card primitive 또는 토큰 기반 card, gradient `color-mix()` | Right-fade `#fff9f2` → `var(--background)` fallback 이미 사용 |
| **ThemeCarouselCard thumb** | `rgba(26,26,46,0.06)` / `rgba(26,26,46,0.22)` overlay | `color-mix(in srgb, var(--foreground) 6%, transparent)` 등 | Hardcoded rgba 제거 |
| **ThemeCarouselCard source badge** | `bg-[var(--panel)] text-[var(--brand-deep)]` | Badge primitive 또는 토큰 유지 (이미 토큰) | |
| **RecipeCard** | `border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]` | Card primitive 소비 또는 토큰 유지 | 구조 변경 없이 시각만 |
| **RecipeCard source badge** | `bg-[var(--panel)] text-[var(--brand-deep)]` | 유지 또는 Badge primitive 소비 | |
| **RecipeCard serving pill** | `border-[color:rgba(255,108,60,0.14)] bg-[color:rgba(255,108,60,0.08)] text-[#c84316]` | `color-mix()` 기반 brand 파생 | Hardcoded hex/rgba 제거 |
| **RecipeCard stats pills** | `bg-[color:rgba(0,0,0,0.04)]` | `color-mix(in srgb, var(--foreground) 4%, transparent)` | |
| **RecipeCard thumb gradient** | `rgba(255,108,60,0.22)` / `rgba(255,249,242,0.85)` / `rgba(46,166,122,0.18)` | `color-mix()` 기반 brand/olive 파생 | |
| **SortMenu button** | `bg-white/92 shadow-[0_10px_24px_rgba(...)]` | 토큰 기반 surface/shadow | |
| **SortMenu mobile sheet** | `bg-black/42 backdrop-blur` + `bg-[var(--panel)]` | 토큰 기반 overlay/panel | |
| **SortMenu desktop dropdown** | `bg-[var(--panel)] shadow-[0_18px_44px_rgba(...)]` | 토큰 기반 shadow | |
| **Section header (모든 레시피)** | `text-[1.15rem] font-extrabold text-[var(--foreground)]` | 이미 토큰 — 확인 후 유지 | |
| **Count badge** | `bg-white/82 text-[var(--muted)] shadow-[0_8px_18px_rgba(...)]` | 토큰 기반 surface/text/shadow | |
| **ThemeCarouselSkeleton** | `bg-white/70`, `bg-white/60` | `Skeleton` primitive 또는 `bg-[var(--surface-fill)]` | |
| **RecipeListSkeleton** | `bg-white/70`, `bg-white/60` + `glass-panel` | `Skeleton` primitive 또는 토큰 기반 | |
| **IngredientFilterModal** | 대부분 shared component 경유 (이미 리스타일됨); 잔여 inline rgba | `color-mix()` 교체 | shared component는 이미 리스타일 완료 |

### 프로토타입 참조 범위

`ui/designs/prototypes/baemin-redesign/HANDOFF.md` §5.1은 다음 포인트를 참조용으로 제공한다:

- 브랜드 AppBar의 Jua 폰트 → **채택하지 않음** (Jua import 금지 per h6-direction non-goals)
- 재료 필터 chip-rail + 정렬 시트 → **공유 컴포넌트 이미 리스타일 완료**, 잔여 inline 스타일만 교체
- 테마 카루셀 1.5장 peek, gap 12, snap-x → **현행 구현 이미 유사**, 토큰 교체만
- RecipeCard large card 오버레이 위치 → **현행 구조 유지**, 시각 토큰만 교체
- 섹션 간 24px 간격, 헤더 18/700 → **참고**, 현행 Tailwind spacing이 이미 유사

**주의**: 프로토타입은 REFERENCE ONLY다. 프로토타입과 공식 문서/workpack이 충돌하면 공식 문서/workpack이 우선한다. 특히:
- Jua 폰트는 사용하지 않는다.
- 프로토타입 JSX/HTML을 직접 복사하지 않는다.
- `--cook-*` 토큰 값을 변경하지 않는다.
- H1 정보 구조(D1-D4)를 변경하지 않는다.

### 리트로핏 와이어프레임 (구조 보존 + 시각 교체)

```
┌─────────────────────────────────────────┐  ← 375px (모바일 기준)
│  HOMECOOK                               │  ← AppHeader: --surface bg, --shadow-1
│                                         │     brand text: --foreground, hover: --brand-deep
│  ┌─────────────────────────────────┐    │  ← discovery panel: token surface/border/shadow
│  │  🔍  레시피 제목 검색           │    │  ← --surface bg, --line border, --shadow-1
│  │  [재료로 검색]                  │    │  ← color-mix(brand) inactive / --olive active
│  └─────────────────────────────────┘    │
│                                         │
│  이번 주 인기 레시피          [N개]     │  ← 토큰 기반 text color (유지)
│  ┌────────┐ ┌────────┐ ┌──────      │  ← Card primitive surface, --shadow-1
│  │[thumb] │ │[thumb] │ │ peek       │  ← color-mix() thumbnail overlay
│  │ 제목   │ │ 제목   │ │            │  ← Badge primitive source label
│  └────────┘ └────────┘ └──────      │  ← right-fade: var(--background)
│                                         │
│  모든 레시피     [N개] [정렬 기준▾]  │  ← count badge: token surface/shadow
│                                         │     sort button: token surface/line/shadow
│  ┌─────────────┐  ┌─────────────┐       │  ← Card primitive, token shadow/border
│  │  [SOURCE]   │  │  [SOURCE]   │       │  ← Badge primitive source
│  │  #태그      │  │  #태그      │       │  ← --olive (유지)
│  │  레시피 제목 │  │  레시피 제목 │       │  ← --foreground (유지)
│  │  [N인분]    │  │  [N인분]    │       │  ← color-mix(brand) serving pill
│  │  [조회][좋아요]│  │  [조회][좋아요]│  │  ← color-mix(foreground 4%) stats
│  └─────────────┘  └─────────────┘       │
│                                         │
└─────────────────────────────────────────┘

정렬 Sheet (mobile, 변경없는 구조 + 토큰 교체):
┌─────────────────────────────────────────┐
│  ░░░░░ scrim: token overlay ░░░░░░░░░  │
│  ┌─────────────────────────────────┐    │  ← --panel bg, --radius-xl
│  │  [drag indicator]               │    │  ← token surface-fill
│  │  정렬 기준          [✕]        │    │  ← ModalHeader (이미 리스타일)
│  │  모든 레시피 순서를 바꿔요      │    │
│  │                                 │    │
│  │  ○ 조회수순                     │    │  ← OptionRow (token 기반)
│  │  ● 좋아요순   ✓                 │    │
│  │  ○ 저장순                       │    │
│  │  ○ 플래너 등록순                │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 리트로핏 비적용 항목 (명시적 제외)

| 항목 | 이유 |
| --- | --- |
| BottomTabs 리스타일 | 앱 전체 retrofit slice로 분리 |
| AppShell 구조 변경 | 구조 보존 원칙 |
| Jua 폰트 import | h6-direction non-goals |
| 새 CSS 토큰 추가 | 기존 승인 토큰만 사용 |
| `--cook-*` 토큰 값 변경 | 절대 가드레일 |
| H1 D1-D4 구조 변경 | 잠긴 결정 |
| `components/ui/*` 파일 수정 | 소비만 허용 |

### 관련 리뷰 아티팩트

- 리트로핏 설계 critique: `ui/designs/critiques/HOME-baemin-style-retrofit-critique.md`
- Authority report (Stage 4/5 생성): `ui/designs/authority/BAEMIN_STYLE_HOME_RETROFIT-authority.md`
- Evidence directory: `ui/designs/evidence/baemin-style/home-retrofit/`

---

## Baemin Prototype Parity Addendum

> 추가일: 2026-04-28
> 관련 슬라이스: `baemin-prototype-home-parity`
> 선행 게이트: `h7-baemin-prototype-parity-direction` (merged), `baemin-prototype-parity-foundation` (merged)
> 선행 리트로핏: `baemin-style-home-retrofit` (merged) — 현재 production baseline
> 프로토타입 참조: `ui/designs/prototypes/homecook-baemin-prototype.html`, `ui/designs/prototypes/baemin-redesign/screens/home.jsx`

### 목적

h6 retrofit 결과물(현재 production baseline)을 Baemin prototype 기준 near-100% parity로 끌어올린다. h7 direction gate가 정의한 3-way capture, visual-verdict 5축 채점(skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15), required-state matrix를 따라 HOME body 점수 >= 95, authority blocker 0을 달성한다.

### HOME Production 정보 구조 보존

아래 정보 구조는 화면정의서 v1.5.1 §1 기준으로 **변경하지 않는다**:

```
공통 브랜드 헤더 (AppHeader)
└─ Discovery panel
   ├─ 제목 검색바
   └─ [재료로 검색] 버튼 → INGREDIENT_FILTER_MODAL
테마 carousel strip (compact 헤더 + horizontal scroll)
"모든 레시피" 섹션
├─ 섹션 헤더 + 정렬 드롭다운
└─ 2열 레시피 카드 그리드
하단 탭바 (BottomTabBar)
```

Prototype의 HOME (`home.jsx`)도 동일한 섹션을 동일한 순서로 가진다. 차이는 skin·layout·interaction affordance의 시각 처리에 한정된다.

### Prototype-Only Exclusions (deficit 비채점)

h7 direction gate의 `prototype-exclusion-inventory.md`에 따라 아래 항목은 prototype capture에 보이더라도 after layer에서 부재를 deficit으로 채점하지 않는다:

| 제외 항목 | 이유 |
| --- | --- |
| Hero greeting ("오늘은 뭐 해먹지?") | Prototype demo copy, production에 해당 섹션 없음 |
| Promo strip (플래너 안내 배너) | Prototype marketing asset |
| Inline ingredient filter chips | Production은 모달 기반 `INGREDIENT_FILTER_MODAL` |
| Jua 폰트 | h6-direction non-goals, 새 폰트 의존성 금지 |
| Bottom tab bar styling, Pantry/MyPage 링크 | 앱 전체 retrofit slice로 분리 |

### Required State Evidence Plan

7개 required states × 2 viewports = 14 capture sets. 각 set은 3-way (current/after/prototype) × 3 layers를 포함한다.

| State ID | 390px (70%) | 320px (30%) | 트리거 |
| --- | --- | --- | --- |
| `initial` | ✅ | ✅ | HOME (`/`) 초기 로드 |
| `scrolled-to-recipes-entry` | ✅ | ✅ | "모든 레시피" 섹션 헤더가 viewport 상단에 닿을 때까지 스크롤 |
| `sort-open` | ✅ | ✅ | 정렬 드롭다운 열기 (mobile: bottom sheet) |
| `filter-active` | ✅ | ✅ | 재료 필터 1개 이상 적용 후 모달 닫기 |
| `loading` | ✅ | ✅ | 스켈레톤 카드 표시 (API 응답 지연) |
| `empty` | ✅ | ✅ | 검색/필터 결과 0건 |
| `error` | ✅ | ✅ | 네트워크/API 오류 |

Capture 파일 경로: `qa/visual/parity/baemin-prototype-home-parity/<viewport>-HOME-<state>-<layer>.png`

### Authority Path

- Authority report: `ui/designs/authority/HOME-parity-authority.md`
- Authority status: `required` (anchor-extension classification)
- Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority review 수행
- Blocker 0 + score >= 95 달성 후 `pending-review` 전환
- Stage 5 + final authority gate 통과 후 `confirmed`

### Contract Evolution

**Not required.** Visual implementation only — 공식 문서(화면정의서, 요구사항기준선, 유저Flow맵, API 계약, DB 스키마) 변경 없음. 상세 분석은 workpack README의 Contract Evolution Decision 참조.

### 관련 아티팩트

- Parity critique: `ui/designs/critiques/HOME-critique.md` §Baemin Prototype Parity Critique
- Workpack: `docs/workpacks/baemin-prototype-home-parity/README.md`
- Foundation evidence: `ui/designs/evidence/baemin-prototype-parity-foundation/`
- Visual-verdict artifact (Stage 4 생성): `ui/designs/evidence/baemin-prototype-home-parity/visual-verdict`
- Authority report (Stage 4 생성): `ui/designs/authority/HOME-parity-authority.md`
