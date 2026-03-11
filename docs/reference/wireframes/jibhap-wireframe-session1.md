# 집밥 서비스 — 와이어프레임 스펙 (AI 구현용)

> 기준: 요구사항 v1.5 / 화면정의서 v1.1 / DB v1.2 / API v1.2.1  
> 모바일 기준: width 375px / 플랫폼: PWA (모바일 우선 반응형)  
> 스타일: Tailwind CSS 클래스명 기준

---

## 목차

- [0. 공통 컴포넌트](#0-공통-컴포넌트)
  - [BottomTabBar](#bottomtabbar)
  - [LoginRequiredModal](#loginrequiredmodal)
  - [Toast](#toast)
  - [ConfirmModal](#confirmmodal)
  - [RecipeCard](#recipecard)
  - [ServingStepper](#servingstepper)
- [1. PLANNER_WEEK — 식단 플래너](#1-planner_week--식단-플래너)
- [2. MEAL_SCREEN — 끼니 화면](#2-meal_screen--끼니-화면)
- [3. MENU_ADD — 메뉴 추가](#3-menu_add--메뉴-추가)

---

## 0. 공통 컴포넌트

공통 컴포넌트는 모든 화면에서 import하여 재사용한다.  
각 컴포넌트는 독립적으로 렌더링되며 상태는 부모 화면이 관리한다.

---

### BottomTabBar

```
┌─────────────────────────────────────────┐
│  375px                                  │
│  ┌───────┬───────┬───────┬───────┐      │
│  │  🏠   │  📅   │  🧊   │  👤   │      │
│  │  홈   │플래너 │팬트리 │ 마이  │      │
│  └───────┴───────┴───────┴───────┘      │
│  h-16  bottom-0  fixed  w-full          │
└─────────────────────────────────────────┘
```

#### 컴포넌트

- **컨테이너**: `fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex z-50`
- **탭 아이템 (×4)**: `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs`
  - 비활성 상태: `text-gray-400`
  - 활성 상태: `text-green-600 font-semibold`
- **아이콘**: `w-6 h-6`
- **탭 레이블**: `text-[10px]`

#### Props

| prop | type | 설명 |
|------|------|------|
| `activeTab` | `'home' \| 'planner' \| 'pantry' \| 'mypage'` | 현재 활성 탭 |
| `isLoggedIn` | `boolean` | 로그인 여부 |
| `hidden` | `boolean` | 숨김 여부 (요리모드 진입 시 true) |

#### 인터랙션

- 홈 탭 탭 → HOME으로 이동
- 플래너 탭 탭:
  - if `isLoggedIn === true` → PLANNER_WEEK로 이동
  - if `isLoggedIn === false` → LoginRequiredModal 표시
- 팬트리 탭 탭:
  - if `isLoggedIn === true` → PANTRY로 이동
  - if `isLoggedIn === false` → LoginRequiredModal 표시
- 마이 탭 탭:
  - if `isLoggedIn === true` → MYPAGE로 이동
  - if `isLoggedIn === false` → LoginRequiredModal 표시

#### ⚠️ 비즈니스 로직 주의사항

- `hidden === true`이면 컴포넌트 전체를 `hidden` 처리 (`display: none`). COOK_MODE 진입 시 부모가 `hidden=true` 전달.
- 401 응답 수신 시 전역에서 LoginRequiredModal을 트리거.

---

### LoginRequiredModal

```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────┐    │
│  │  dim overlay  bg-black/50       │    │
│  │  ┌───────────────────────────┐  │    │
│  │  │  🔒                       │  │    │
│  │  │  로그인이 필요해요          │  │    │
│  │  │  (설명 텍스트)             │  │    │
│  │  │  ┌─────────────────────┐  │  │    │
│  │  │  │    로그인하기        │  │  │    │
│  │  │  └─────────────────────┘  │  │    │
│  │  │  ┌─────────────────────┐  │  │    │
│  │  │  │       나중에         │  │  │    │
│  │  │  └─────────────────────┘  │  │    │
│  │  └───────────────────────────┘  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

#### 컴포넌트

- **오버레이**: `fixed inset-0 bg-black/50 z-50 flex items-end justify-center`
- **모달 시트**: `bg-white rounded-t-2xl w-full px-6 pt-6 pb-10 flex flex-col items-center gap-4`
- **아이콘**: `text-4xl mb-1` (잠금 이모지 또는 아이콘)
- **제목**: `text-lg font-bold text-gray-900`
- **설명 텍스트**: `text-sm text-gray-500 text-center`
- **[로그인하기] 버튼**: `w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-base`
- **[나중에] 버튼**: `w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold text-base`

#### Props

| prop | type | 설명 |
|------|------|------|
| `isOpen` | `boolean` | 모달 표시 여부 |
| `returnToAction` | `string` | 로그인 후 복귀할 액션 식별자 (URL 파라미터로 전달) |
| `onClose` | `() => void` | 모달 닫기 콜백 |

#### 인터랙션

- [로그인하기] 탭 → `returnToAction` 파라미터를 포함하여 LOGIN 화면으로 이동
- [나중에] 탭 → `onClose()` 호출, 모달 닫기
- 오버레이 탭 → `onClose()` 호출, 모달 닫기

---

### Toast

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ✅  저장되었습니다              │    │
│  └─────────────────────────────────┘    │
│   fixed  bottom-20  mx-4  rounded-lg   │
└─────────────────────────────────────────┘
```

#### 컴포넌트

- **컨테이너**: `fixed bottom-20 left-4 right-4 z-50`
- **토스트 박스**: `bg-gray-900 text-white text-sm px-4 py-3 rounded-xl flex items-center gap-2 shadow-lg`
  - 진입 애니메이션: `animate-fade-in-up` (translate-y 12px → 0, opacity 0 → 1, duration 200ms)
  - 퇴장 애니메이션: `animate-fade-out` (opacity 1 → 0, duration 200ms)
- **아이콘 영역**: `w-5 h-5 flex-shrink-0`
- **메시지 텍스트**: `text-sm flex-1`

#### Props

| prop | type | 설명 |
|------|------|------|
| `message` | `string` | 표시할 메시지 |
| `isVisible` | `boolean` | 표시 여부 |
| `duration` | `number` | 자동 소멸 시간(ms), 기본값 `3000` |
| `onHide` | `() => void` | 소멸 후 콜백 |

#### 인터랙션

- `isVisible === true` → 토스트 렌더링
- `duration`(기본 3000ms) 후 → `onHide()` 호출 후 unmount
- BottomTabBar 위에 위치해야 하므로 `bottom-20` (탭바 높이 64px + 여백 16px)

---

### ConfirmModal

```
┌─────────────────────────────────────────┐
│  dim overlay bg-black/50                │
│  ┌───────────────────────────────────┐  │
│  │  제목 텍스트 (font-bold)           │  │
│  │  설명 텍스트 (text-gray-500)       │  │
│  │  ┌──────────┐  ┌──────────────┐  │  │
│  │  │  취소    │  │  확인        │  │  │
│  │  └──────────┘  └──────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

#### 컴포넌트

- **오버레이**: `fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6`
- **모달 박스**: `bg-white rounded-2xl w-full px-6 py-6 flex flex-col gap-4`
- **제목**: `text-base font-bold text-gray-900`
- **설명**: `text-sm text-gray-500 leading-relaxed`
- **버튼 영역**: `flex gap-3 mt-2`
- **[취소] 버튼**: `flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm`
- **[확인] 버튼**: `flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold text-sm`
  - 파괴적 액션(삭제, 탈퇴)은 `bg-red-500`, 일반 확인은 `bg-green-600`

#### Props

| prop | type | 설명 |
|------|------|------|
| `isOpen` | `boolean` | 모달 표시 여부 |
| `title` | `string` | 모달 제목 |
| `description` | `string` | 설명 텍스트 |
| `confirmLabel` | `string` | 확인 버튼 레이블, 기본값 `"확인"` |
| `confirmVariant` | `'destructive' \| 'primary'` | 확인 버튼 스타일 |
| `onConfirm` | `() => void` | 확인 콜백 |
| `onCancel` | `() => void` | 취소 콜백 |

#### 인터랙션

- [확인] 탭 → `onConfirm()` 호출 후 모달 닫기
- [취소] 탭 → `onCancel()` 호출 후 모달 닫기
- 오버레이 탭 → `onCancel()` 호출 (취소와 동일 처리)

#### 사용 예시

| 사용 화면 | title | description | confirmVariant |
|---------|-------|-------------|---------------|
| 컬럼 삭제 | "끼니를 삭제할까요?" | "삭제하면 되돌릴 수 없어요." | `destructive` |
| 요리 취소 | "요리를 취소할까요?" | "진행 중인 요리 세션이 종료됩니다." | `destructive` |
| 회원 탈퇴 | "정말 탈퇴할까요?" | "모든 데이터가 삭제됩니다." | `destructive` |

---

### RecipeCard

```
┌──────────────────┐
│  [썸네일 이미지]  │  ← aspect-ratio 4:3, rounded-t-xl
│  16:9 또는 4:3   │
├──────────────────┤
│  레시피 제목      │  ← 2줄 말줄임 (line-clamp-2)
│  (2줄까지 표시)  │
│  ┌──┐ ┌──┐ ┌──┐  │  ← 태그 칩 최대 3개
│  │태│ │그│ │칩│  │
│  └──┘ └──┘ └──┘  │
│  👁 1.2k ❤ 340 🔖 88 │  ← 메타 정보
└──────────────────┘
```

#### 컴포넌트

- **카드 컨테이너**: `bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100`
- **썸네일**: `w-full aspect-[4/3] object-cover bg-gray-100`
  - 이미지 없을 때: `bg-gray-200 flex items-center justify-center text-gray-400` + 기본 아이콘
- **콘텐츠 영역**: `p-3 flex flex-col gap-2`
- **제목**: `text-sm font-semibold text-gray-900 line-clamp-2 leading-snug`
- **태그 칩 영역**: `flex flex-wrap gap-1`
- **태그 칩**: `text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-200`
  - 최대 3개 표시, 초과 시 나머지 숨김
- **메타 정보 영역**: `flex items-center gap-2 text-[11px] text-gray-400`
  - 각 항목: `flex items-center gap-0.5`
  - 아이콘 크기: `w-3.5 h-3.5`

#### Props

| prop | type | 설명 |
|------|------|------|
| `id` | `string` | 레시피 ID |
| `title` | `string` | 레시피 제목 |
| `thumbnailUrl` | `string \| null` | 썸네일 URL |
| `tags` | `string[]` | 태그 목록 (최대 3개 표시) |
| `viewCount` | `number` | 조회수 |
| `likeCount` | `number` | 좋아요 수 |
| `saveCount` | `number` | 저장 수 |
| `onTap` | `() => void` | 카드 탭 콜백 |

#### 인터랙션

- 카드 탭 → `onTap()` 호출 (보통 RECIPE_DETAIL 이동)

---

### ServingStepper

```
┌────────────────────────┐
│  [ − ]  [  2  ]  [ + ] │
│   w-8     w-10    w-8  │
└────────────────────────┘
```

#### 컴포넌트

- **컨테이너**: `flex items-center gap-0`
- **[-] 버튼**: `w-8 h-8 flex items-center justify-center rounded-l-lg bg-gray-100 text-gray-700 text-lg font-bold`
  - 값이 최솟값(1)일 때: `text-gray-300 cursor-not-allowed` (비활성)
- **숫자 표시**: `w-10 h-8 flex items-center justify-center bg-gray-50 text-sm font-bold text-gray-900 border-y border-gray-200`
- **[+] 버튼**: `w-8 h-8 flex items-center justify-center rounded-r-lg bg-gray-100 text-gray-700 text-lg font-bold`

#### Props

| prop | type | 설명 |
|------|------|------|
| `value` | `number` | 현재 인분 수 |
| `min` | `number` | 최솟값, 기본값 `1` |
| `max` | `number \| undefined` | 최댓값 (없으면 무제한) |
| `onChange` | `(val: number) => void` | 변경 콜백 |
| `disabled` | `boolean` | 전체 비활성화 |

#### 인터랙션

- [-] 탭:
  - if `value > min` → `onChange(value - 1)`
  - if `value === min` → 아무 동작 없음 (버튼 비활성 스타일 유지)
- [+] 탭:
  - if `max === undefined || value < max` → `onChange(value + 1)`
  - if `value === max` → 아무 동작 없음

---

## 1. PLANNER_WEEK — 식단 플래너

### 레이아웃

```
┌─────────────────────────────────────────────┐  ← 375px
│ STATUS BAR                                  │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐   │
│ │  < 이전주   3/3(월) ~ 3/9(일)  다음주>│   │  ← WeekNavigator
│ └───────────────────────────────────────┘   │  h-10
│ ┌───────────┬───────────┬───────────┐       │
│ │  [🛒장보기]│[🍱남은요리]│[👨‍🍳요리하기]│       │  ← ActionButtons
│ └───────────┴───────────┴───────────┘       │  h-10
├─────────────────────────────────────────────┤
│ 스크롤 가능 영역 (가로 + 세로)               │
│ ┌──────┬──────────┬──────────┬──────────┬──┐│
│ │      │  아침    │  점심    │  저녁    │+ ││  ← 컬럼 헤더
│ ├──────┼──────────┼──────────┼──────────┼──┤│
│ │ 월3/3│ [빈셀+]  │김치찌개  │ [빈셀+]  │  ││
│ │      │          │2인분     │          │  ││
│ ├──────┼──────────┼──────────┼──────────┼──┤│
│ │ 화3/4│된장국    │ [빈셀+]  │ [남은요리││  ││
│ │      │1인분     │          │  노란배경││  ││
│ ├──────┼──────────┼──────────┼──────────┼──┤│
│ │ 수   │          │          │          │  ││
│ │ ...  │          │          │          │  ││
│ └──────┴──────────┴──────────┴──────────┴──┘│
│  (7행 × n열 그리드, 가로 스크롤 지원)        │
├─────────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')         │
└─────────────────────────────────────────────┘
```

### 컴포넌트

#### WeekNavigator

- **컨테이너**: `flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100`
- **[< 이전주] 버튼**: `flex items-center gap-1 text-sm text-gray-600 p-2`
  - 아이콘: `w-4 h-4 chevron-left`
- **날짜 범위 텍스트**: `text-sm font-semibold text-gray-900`
  - 형식: `"3/3(월) ~ 3/9(일)"`
- **[다음주 >] 버튼**: `flex items-center gap-1 text-sm text-gray-600 p-2`

#### ActionButtons

- **컨테이너**: `flex gap-2 px-4 py-2 bg-white border-b border-gray-100`
- **[🛒 장보기] 버튼**: `flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg`
- **[🍱 남은요리] 버튼**: `flex-1 flex items-center justify-center gap-1.5 py-2 bg-yellow-400 text-white text-xs font-semibold rounded-lg`
- **[👨‍🍳 요리하기] 버튼**: `flex-1 flex items-center justify-center gap-1.5 py-2 bg-orange-500 text-white text-xs font-semibold rounded-lg`

#### PlannerGrid (가로+세로 스크롤 테이블)

- **외부 래퍼**: `overflow-x-auto overflow-y-auto flex-1`
- **테이블**: `min-w-max` (컬럼 수에 따라 가로 확장)
- **요일 헤더 셀 (좌측 고정)**: `w-14 min-w-14 sticky left-0 bg-white z-10 border-r border-b border-gray-100 flex flex-col items-center justify-center py-2`
  - 요일 텍스트: `text-xs font-semibold text-gray-700`
  - 날짜 텍스트: `text-[10px] text-gray-400`
  - 오늘 날짜: `bg-green-600 text-white rounded-full px-1.5 py-0.5`
- **끼니 컬럼 헤더 셀**: `min-w-28 w-28 border-b border-r border-gray-100 py-2 px-1`
  - **컬럼 이름**: `text-xs font-semibold text-center text-gray-700`
  - **[수정] 버튼** (커스텀 컬럼만): `text-[10px] text-gray-400 탭 → 컬럼명 인라인 편집 모드`
  - **[삭제] 버튼** (커스텀 컬럼만): `text-[10px] text-red-400`
    - if `meals.length > 0` → 버튼 `opacity-30 cursor-not-allowed`
    - if `meals.length === 0` → 버튼 활성, 탭 → ConfirmModal
- **[+ 컬럼 추가] 헤더 버튼**: `min-w-10 w-10 border-b border-r border-gray-100 flex items-center justify-center`
  - 아이콘: `w-5 h-5 text-gray-400`
  - if `columnCount >= 5` → `opacity-30 cursor-not-allowed` (최대 5개 제한)

#### PlannerCell (각 끼니 셀)

세 가지 상태:

**상태 1 — 빈 셀**

```
┌───────────────────┐
│                   │
│        +          │  ← w-5 h-5 text-gray-300
│                   │
└───────────────────┘
```

- 스타일: `min-w-28 w-28 h-16 border-b border-r border-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-50 active:bg-gray-100`

**상태 2 — 채워진 셀 (일반 레시피)**

```
┌───────────────────┐
│ 김치찌개          │  ← text-xs font-medium text-gray-800 line-clamp-2
│ 2인분             │  ← text-[10px] text-gray-400
└───────────────────┘
```

- 스타일: `min-w-28 w-28 h-16 border-b border-r border-gray-100 px-2 py-1.5 cursor-pointer hover:bg-gray-50`

**상태 3 — 남은요리 셀**

```
┌───────────────────┐
│ 된장찌개(남은)     │  ← text-xs font-medium text-yellow-800
│ 1인분             │  ← text-[10px] text-yellow-600
└───────────────────┘
```

- 스타일: `min-w-28 w-28 h-16 border-b border-r border-gray-100 px-2 py-1.5 cursor-pointer bg-yellow-50 hover:bg-yellow-100`
- 레시피명 뒤에 `(남은)` 또는 `🍱` 배지 표시

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `currentWeekStart` | `Date` | 이번 주 월요일 | 현재 표시 중인 주의 시작일 |
| `columns` | `Column[]` | API 응답 | 끼니 컬럼 목록 (id, name, order) |
| `meals` | `Meal[]` | API 응답 | 현재 주 전체 meals |
| `editingColumnId` | `string \| null` | `null` | 인라인 편집 중인 컬럼 ID |
| `editingColumnName` | `string` | `""` | 편집 중인 컬럼명 임시 값 |
| `isColumnAddLoading` | `boolean` | `false` | 컬럼 추가 API 로딩 |
| `confirmModal` | `ConfirmModalState \| null` | `null` | 활성 ConfirmModal 데이터 |

### 인터랙션

- **[< 이전주] 탭** → `currentWeekStart -= 7일` → `GET /planner?week_start=YYYY-MM-DD` 재호출
- **[다음주 >] 탭** → `currentWeekStart += 7일` → `GET /planner` 재호출
- **스와이프 좌** → [다음주] 전환 (터치 스와이프 제스처)
- **스와이프 우** → [이전주] 전환
- **[🛒 장보기] 탭** → SHOPPING_FLOW 이동
- **[🍱 남은요리] 탭** → LEFTOVERS 이동
- **[👨‍🍳 요리하기] 탭** → COOK_READY_LIST 이동
- **빈 셀 탭** → MENU_ADD 이동 (`date`, `column_id` 파라미터 전달)
- **채워진 셀 탭** → MEAL_SCREEN 이동 (`date`, `column_id` 파라미터 전달)
- **[+ 컬럼 추가] 탭**:
  - if `columnCount < 5` → BottomSheet: 컬럼명 입력 인풋 + [추가] 버튼 → `POST /planner/columns`
  - if `columnCount >= 5` → Toast("끼니는 최대 5개까지 추가할 수 있어요")
- **컬럼 이름 탭 (커스텀 컬럼)** → 인라인 편집 모드 활성 (`editingColumnId` 세팅)
  - 텍스트 인풋: `border-b border-green-500 text-xs font-semibold text-center w-full outline-none`
  - 포커스 아웃 또는 엔터 → `PATCH /planner/columns/{id}` 호출
- **[삭제] 탭 (커스텀 컬럼, meals 없을 때)** → ConfirmModal("끼니를 삭제할까요?") → 확인 → `DELETE /planner/columns/{id}`

### ⚠️ 비즈니스 로직 주의사항

- **컬럼 삭제 제한**: `DELETE /planner/columns/{id}` 호출 전에 클라이언트에서 해당 컬럼에 속한 현재 주 meals 수를 확인. `meals.length > 0`이면 삭제 버튼 자체를 `opacity-30 cursor-not-allowed`으로 렌더링하고 탭 이벤트 차단. 서버에서도 409 반환하지만 UI에서 선제적으로 막아야 함.
- **최대 5컬럼**: `POST /planner/columns` 호출 전 클라이언트에서 `columns.length >= 5` 체크. 초과 시 API 호출 없이 Toast 표시.
- **남은요리 셀 구분**: `meal.leftover_dish_id !== null`인 경우 bg-yellow-50 배경으로 렌더링.
- **오늘 날짜 강조**: 요일 헤더의 오늘 날짜는 `bg-green-600 text-white` 동그라미 처리.
- **주간 데이터 범위**: `GET /planner` 호출 시 `week_start=YYYY-MM-DD` (해당 주 월요일) 파라미터 필수 전달.
- **인증 필수 화면**: 비로그인 상태로 접근 시 LoginRequiredModal 표시 후 LOGIN으로 유도. 플래너 데이터는 로그인 없이 조회 불가.

---

## 2. MEAL_SCREEN — 끼니 화면

### 레이아웃

```
┌─────────────────────────────────────────────┐  ← 375px
│ STATUS BAR                                  │
├─────────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐    │
│ │ ← 뒤로    3월 3일 (월) — 저녁        │    │  ← Header h-14
│ └──────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│                                             │
│ ┌──────────────────────────────────────┐    │
│ │ ┌──────┐  김치찌개              [🗑]│    │  ← MealCard
│ │ │thumb │  [─][  2  ][+]             │    │
│ │ └──────┘                            │    │
│ └──────────────────────────────────────┘    │
│                                             │
│ ┌──────────────────────────────────────┐    │
│ │ ┌──────┐  된장국                [🗑]│    │  ← MealCard
│ │ │thumb │  [─][  1  ][+]             │    │
│ │ └──────┘                            │    │
│ └──────────────────────────────────────┘    │
│                                             │
│ (식사 없을 때: 빈 상태 일러스트 + 안내 텍스트)│
│                                             │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐    │
│  │         + 메뉴 추가                 │    │  ← 하단 고정 버튼
│  └─────────────────────────────────────┘    │  h-14 pb-safe
├─────────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')         │
└─────────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 border-b border-gray-100 bg-white h-14`
- **뒤로가기 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
  - 아이콘: `w-5 h-5 chevron-left`
- **제목**: `flex-1 text-center text-base font-bold text-gray-900`
  - 형식: `"3월 3일 (월) — 저녁"`

#### MealCard

- **외부 래퍼**: `relative overflow-hidden` (스와이프 삭제를 위한 transform 기준)
- **카드 본체**: `flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 transition-transform`
- **썸네일**: `w-16 h-16 rounded-lg object-cover bg-gray-100 flex-shrink-0`
- **콘텐츠 영역**: `flex-1 flex flex-col gap-1.5`
  - 레시피명: `text-sm font-semibold text-gray-900 line-clamp-2`
- **ServingStepper**: (공통 컴포넌트 재사용, `min=1`)
- **삭제 버튼 (스와이프 시 노출)**: `absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex items-center justify-center text-white text-sm font-semibold`
  - 텍스트: "삭제"

**빈 상태 (meals.length === 0)**:

```
┌─────────────────────────────────────────────┐
│                                             │
│           🍽️                               │
│     아직 추가된 메뉴가 없어요                │
│     메뉴를 추가해서 식단을 채워보세요         │
│                                             │
└─────────────────────────────────────────────┘
```

- 아이콘: `text-5xl mb-3`
- 제목: `text-sm font-semibold text-gray-600 mt-2`
- 설명: `text-xs text-gray-400 text-center mt-1`

#### 하단 고정 버튼

- **컨테이너**: `fixed bottom-16 left-0 right-0 px-4 pb-2 bg-white border-t border-gray-100`
- **[+ 메뉴 추가] 버튼**: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `date` | `string` | 라우트 파라미터 | 선택된 날짜 (YYYY-MM-DD) |
| `columnId` | `string` | 라우트 파라미터 | 선택된 끼니 컬럼 ID |
| `columnName` | `string` | API 응답 | 끼니 이름 (헤더 표시용) |
| `meals` | `Meal[]` | API 응답 | 해당 끼니의 식사 목록 |
| `swipingMealId` | `string \| null` | `null` | 스와이프 삭제 열린 카드 ID |
| `isDeleting` | `boolean` | `false` | 삭제 API 로딩 중 |

### 인터랙션

- **화면 진입** → `GET /meals?date={date}&column_id={columnId}` 호출
- **카드 탭** → RECIPE_DETAIL 이동 (`recipe_id` 파라미터 전달)
- **카드 스와이프 좌** → 해당 카드 오른쪽에 삭제 버튼 노출 (`swipingMealId` 세팅)
  - 다른 카드 스와이프 시 → 이전 카드 원위치
  - 카드 외부 탭 시 → 원위치
- **[삭제] 버튼 탭** → ConfirmModal("이 메뉴를 삭제할까요?") → 확인 → `DELETE /meals/{id}` → 목록에서 제거 → Toast("메뉴가 삭제되었어요")
- **ServingStepper 변경** → 디바운스 500ms 후 → `PATCH /meals/{id}` (`servings` 업데이트)
- **[+ 메뉴 추가] 탭** → MENU_ADD 이동 (`date`, `column_id` 파라미터 전달)
- **뒤로가기 탭** → PLANNER_WEEK로 복귀

### ⚠️ 비즈니스 로직 주의사항

- **ServingStepper 즉시 반영**: 스테퍼 변경 시 UI는 즉시 업데이트하고, API 호출은 500ms 디바운스 적용. 연속 탭 시 마지막 값만 서버에 전송.
- **삭제 후 목록 갱신**: `DELETE /meals/{id}` 성공 시 로컬 `meals` 배열에서 해당 항목 제거. 전체 재조회(`GET /meals`) 불필요.
- **meals.status 표시 없음**: MEAL_SCREEN에서는 status(registered/shopping_done/cook_done)를 UI로 노출하지 않음. 단, `cook_done` 상태의 meal은 ServingStepper 및 삭제를 비활성화하고 읽기 전용으로 표시 (`text-gray-400`, 스테퍼 `disabled`).
- **인증 필수**: `GET /meals` 및 모든 수정 API는 🔒 인증 필요. 401 수신 시 LoginRequiredModal 표시.

---

## 3. MENU_ADD — 메뉴 추가

### 레이아웃

> MENU_ADD는 **BottomSheet + 전체 화면** 혼합 방식으로 구성한다.  
> - 초기 진입: BottomSheet (화면 하단에서 올라오는 시트, 높이 약 70vh)  
> - 특정 경로 선택 시: 해당 화면으로 전체 화면 전환 또는 내부 시트 확장

```
┌─────────────────────────────────────────────┐  ← 375px
│ 배경 (PLANNER_WEEK / MEAL_SCREEN) dim 처리  │
│ bg-black/40                                 │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │  ─────  (드래그 핸들)                 │  │  h=2 w=10 bg-gray-300 rounded
│  │                                       │  │
│  │  몇 인분으로 추가할까요?               │  │  ← 제목
│  │  ┌────────────────────────────────┐   │  │
│  │  │       [─]  [  2  ]  [+]       │   │  │  ← ServingStepper
│  │  └────────────────────────────────┘   │  │
│  │                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  🔍 레시피    │  │  📚 레시피북  │  │  │  ← 2열 그리드
│  │  │    검색       │  │  에서 선택   │  │  │
│  │  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  🍱 남은요리  │  │  🧊 팬트리   │  │  │
│  │  │  에서 선택   │  │    추천      │  │  │
│  │  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  📺 유튜브로  │  │  ✍️ 직접     │  │  │
│  │  │    추가      │  │    등록      │  │  │
│  │  └──────────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 컴포넌트

#### BottomSheet 컨테이너

- **오버레이**: `fixed inset-0 bg-black/40 z-40`
  - 탭 → 시트 닫기 (MEAL_SCREEN 또는 PLANNER_WEEK로 복귀)
- **시트 본체**: `fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl px-4 pt-3 pb-8`
  - 최소 높이: `min-h-[50vh]`
  - 드래그 핸들: `mx-auto w-10 h-1 bg-gray-300 rounded-full mb-4`
  - 아래로 드래그 → 시트 닫기

#### 제목 & ServingStepper 영역

- **섹션**: `flex flex-col items-center gap-3 mb-6`
- **제목**: `text-base font-bold text-gray-900`
- **ServingStepper**: 공통 컴포넌트 재사용, 기본값 `2`, `min=1`

#### 추가 경로 그리드

- **그리드**: `grid grid-cols-2 gap-3`
- **경로 카드**: `flex flex-col items-center justify-center gap-2 py-5 bg-gray-50 rounded-2xl border border-gray-100 active:bg-gray-100`
  - 아이콘: `text-2xl`
  - 레이블: `text-sm font-semibold text-gray-700`
  - 서브 텍스트: `text-[11px] text-gray-400 text-center`

| # | 아이콘 | 레이블 | 서브 텍스트 | 액션 |
|---|--------|--------|-----------|------|
| 1 | 🔍 | 레시피 검색 | "레시피명으로 찾기" | → RECIPE_SEARCH_PICKER |
| 2 | 📚 | 레시피북 | "저장한 레시피" | → RecipeBookSheet (내부 시트 확장) |
| 3 | 🍱 | 남은요리 | "먹다 남은 음식" | → LeftoverSheet (내부 시트 확장) |
| 4 | 🧊 | 팬트리 추천 | "집에 있는 재료로" | → PantryMatchSheet (내부 시트 확장) |
| 5 | 📺 | 유튜브로 추가 | "URL 붙여넣기" | → YT_IMPORT (전체 화면 전환) |
| 6 | ✍️ | 직접 등록 | "재료/스텝 직접 입력" | → MANUAL_RECIPE_CREATE (전체 화면 전환) |

#### [경로 2] RecipeBookSheet — 레시피북에서 선택

```
┌─────────────────────────────────────────────┐
│  ← 뒤로   레시피북에서 선택                  │  ← 시트 내부 헤더
├─────────────────────────────────────────────┤
│  내가 추가한 레시피  >                        │
│  저장한 레시피       >                        │
│  좋아요한 레시피     >                        │
│  나의 레시피북1      >                        │
├─────────────────────────────────────────────┤
│  (레시피북 선택 시 → RecipeCard 목록 표시)   │
└─────────────────────────────────────────────┘
```

- 레시피북 목록: `GET /recipe-books` 응답 렌더링
- 각 레시피북 탭 → 해당 book의 RecipeCard 목록 표시 (내부 스택 전환)
- RecipeCard 탭 → 해당 레시피를 선택, `POST /meals` 호출, 시트 닫기, Toast("메뉴가 추가되었어요")

#### [경로 3] LeftoverSheet — 남은요리에서 선택

```
┌─────────────────────────────────────────────┐
│  ← 뒤로   남은요리에서 선택                  │
├─────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐   │
│  │ 🍱 김치찌개 (3/1 요리)              │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 🍱 된장국 (3/2 요리)                │   │
│  └──────────────────────────────────────┘   │
│  (남은요리 없으면: 빈 상태 메시지 표시)      │
└─────────────────────────────────────────────┘
```

- `GET /leftovers` 호출 (status='leftover' 항목)
- 각 카드 탭 → `POST /meals` (`leftover_dish_id` 포함) 호출 → 시트 닫기 → Toast

#### [경로 4] PantryMatchSheet — 팬트리 기반 추천

```
┌─────────────────────────────────────────────┐
│  ← 뒤로   팬트리로 만들 수 있는 레시피        │
├─────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐   │
│  │ RecipeCard                           │   │
│  │ ✅ 가지고 있는 재료: 8/10             │   │  ← match_score
│  │ ❌ 부족한 재료: 파(2개), 두부(1모)    │   │
│  └──────────────────────────────────────┘   │
│  ... (match_score 내림차순 정렬)            │
└─────────────────────────────────────────────┘
```

- `GET /recipes/pantry-match` 호출 → `match_score` 내림차순 정렬
- 각 카드: RecipeCard + match_score 배지 + 부족 재료 목록 표시
  - match_score 배지: `text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full`
  - 부족 재료: `text-[10px] text-red-500`
- 카드 탭 → `POST /meals` 호출 → Toast

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `isOpen` | `boolean` | `true` | BottomSheet 표시 여부 |
| `servings` | `number` | `2` | 추가할 인분 수 |
| `date` | `string` | 라우트 파라미터 | 추가 대상 날짜 |
| `columnId` | `string` | 라우트 파라미터 | 추가 대상 끼니 ID |
| `activeSubSheet` | `'recipebook' \| 'leftover' \| 'pantry' \| null` | `null` | 현재 열린 내부 서브 시트 |
| `selectedBookId` | `string \| null` | `null` | 선택된 레시피북 ID |
| `isAddingMeal` | `boolean` | `false` | POST /meals 로딩 |

### 인터랙션

- **오버레이 탭** → `isOpen = false` → 이전 화면으로 복귀
- **드래그 핸들 아래로 스와이프** → 시트 닫기
- **ServingStepper 변경** → `servings` 상태 업데이트 (즉시)
- **[🔍 레시피 검색] 탭** → RECIPE_SEARCH_PICKER로 이동 (`servings`, `date`, `column_id` 파라미터 전달)
- **[📚 레시피북] 탭** → `activeSubSheet = 'recipebook'` → RecipeBookSheet 렌더링
- **[🍱 남은요리] 탭** → `activeSubSheet = 'leftover'` → LeftoverSheet 렌더링
- **[🧊 팬트리 추천] 탭** → `activeSubSheet = 'pantry'` → PantryMatchSheet 렌더링 + `GET /recipes/pantry-match` 호출
- **[📺 유튜브로 추가] 탭** → YT_IMPORT 전체 화면으로 이동 (`servings`, `date`, `column_id` 파라미터 전달)
- **[✍️ 직접 등록] 탭** → MANUAL_RECIPE_CREATE 전체 화면으로 이동
- **서브 시트 내 [← 뒤로] 탭** → `activeSubSheet = null` → 경로 그리드로 복귀
- **레시피/남은요리 선택 후** → `POST /meals` 호출 → 성공 시 시트 닫기 → MEAL_SCREEN으로 복귀 → Toast("메뉴가 추가되었어요")

### ⚠️ 비즈니스 로직 주의사항

- **인분 수 전달**: `POST /meals` 호출 시 BottomSheet 상단 ServingStepper의 `servings` 값을 반드시 포함. 서브 시트에서 레시피 선택 시에도 현재 `servings` 상태값을 사용.
- **남은요리 식사 추가**: `POST /meals` body에 `leftover_dish_id` 필드 포함. 서버에서 meal의 recipe_id는 해당 leftover_dish의 recipe_id로 자동 세팅됨.
- **팬트리 추천 빈 상태**: `GET /recipes/pantry-match` 응답이 빈 배열이면 "팬트리에 재료를 추가하면 추천해드릴게요" 빈 상태 UI 표시 + [팬트리 관리하기] 버튼 → PANTRY 이동.
- **인증 필수**: 이 화면 전체가 🔒 인증 필요. 비로그인 상태로 접근 불가 (플래너에서 진입하는 구조상 이미 인증된 상태이나, API 401 수신 시 LoginRequiredModal 표시).
- **date, column_id 유효성**: 진입 시 `date`와 `column_id` 파라미터가 없으면 화면 진입 불가 처리 (에러 Toast + 이전 화면 복귀).
- **중복 추가 방지**: `isAddingMeal === true` 동안 추가 경로 버튼 전체 `pointer-events-none` 처리하여 중복 `POST /meals` 방지.
