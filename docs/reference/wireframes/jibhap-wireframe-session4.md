# 집밥 서비스 — 와이어프레임 세션 4

> 세션 1~3의 공통 컴포넌트(BottomTabBar, Toast, ConfirmModal, RecipeCard, ServingStepper, LoginRequiredModal)를 그대로 재사용한다.
> 모바일 기준: width 375px / Tailwind CSS 클래스명 기준

---

## 목차

- [12. LEFTOVERS — 남은요리 목록](#12-leftovers--남은요리-목록)
- [13. ATE_LIST — 다먹음 목록](#13-ate_list--다먹음-목록)
- [14. PANTRY — 팬트리](#14-pantry--팬트리)
- [15. PANTRY_BUNDLE_PICKER — 팬트리 묶음 선택](#15-pantry_bundle_picker--팬트리-묶음-선택)

---

## 12. LEFTOVERS — 남은요리 목록

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  남은요리          [다먹음 목록 >] │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  김치찌개           │  │  <- LeftoverCard
│  │  │  thumb   │  3월 3일 (월) 요리  │  │
│  │  │          │                     │  │
│  │  └──────────┘  ┌────────┐ ┌─────┐ │  │
│  │                │플래너+ │ │다먹음│ │  │
│  │                └────────┘ └─────┘ │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  된장국             │  │
│  │  │  thumb   │  3월 4일 (화) 요리  │  │
│  │  │          │                     │  │
│  │  └──────────┘  ┌────────┐ ┌─────┐ │  │
│  │                │플래너+ │ │다먹음│ │  │
│  │                └────────┘ └─────┘ │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (빈 상태: empty state UI)               │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')      │
└──────────────────────────────────────────┘
```

#### 빈 상태 (leftovers.length === 0)

```
┌──────────────────────────────────────────┐
│                                          │
│               🍱                         │
│        남은 요리가 없어요                 │
│   요리를 완료하면 남은 음식을             │
│   여기서 관리할 수 있어요                 │
│                                          │
└──────────────────────────────────────────┘
```

#### PlannerAddPopup — 플래너 추가 팝업 (세션 3 RECIPE_DETAIL과 동일 컴포넌트 재사용)

```
┌──────────────────────────────────────────┐
│  dim overlay bg-black/50                 │
│  ┌────────────────────────────────────┐  │
│  │  플래너에 추가하기                  │  │  <- 제목
│  │                                    │  │
│  │  날짜 선택                         │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  ◀  2025년 3월  ▶            │  │  │  <- 달력
│  │  │  일  월  화  수  목  금  토   │  │  │
│  │  │  ...                         │  │  │
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  끼니 선택                         │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  아침                     ▼  │  │  │  <- 끼니 드롭다운
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  인분                              │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │       [−][  2  ][+]          │  │  │  <- ServingStepper
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │        플래너에 추가          │  │  │  <- CTA
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 h-14`
- **타이틀**: `text-lg font-bold text-gray-900`
- **[다먹음 목록 >] 버튼**: `flex items-center gap-1 text-sm text-green-600 font-semibold`
  - 아이콘: `w-4 h-4 chevron-right`

#### LeftoverCard

- **카드 컨테이너**: `flex flex-col px-4 py-4 bg-white border-b border-gray-100`
- **상단 행**: `flex items-start gap-3 mb-3`
  - **썸네일**: `w-16 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0`
  - **정보 영역**: `flex-1 flex flex-col gap-1`
    - 레시피 제목: `text-sm font-bold text-gray-900 line-clamp-2`
    - 요리한 날짜: `text-xs text-gray-400`
      - 형식: `"3월 3일 (월) 요리"` (`cooked_at` 기준)
- **하단 버튼 행**: `flex gap-2`
  - **[플래너에 추가] 버튼**:
    `flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-lg`
    - 아이콘: 📅 `w-3.5 h-3.5`
  - **[다먹음 ✓] 버튼**:
    `flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg`
    - 아이콘: ✓ `w-3.5 h-3.5`
    - 탭 후 로딩 중: 스피너 표시 + `pointer-events-none`

#### 빈 상태 UI

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-20 gap-3`
- **아이콘**: `text-5xl` → 🍱
- **제목**: `text-sm font-semibold text-gray-600`
- **설명**: `text-xs text-gray-400 text-center leading-relaxed`

#### PlannerAddPopup

- 세션 3 RECIPE_DETAIL의 PlannerAddPopup 컴포넌트와 동일하게 재사용
- **차이점**: `POST /meals` body에 `leftover_dish_id` 필드 추가 필수
  - body: `{ recipe_id, date, column_id, servings, leftover_dish_id }`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `leftovers` | `LeftoverDish[]` | API 응답 | 남은요리 목록 |
| `targetLeftover` | `LeftoverDish \| null` | `null` | 플래너 추가 팝업 대상 항목 |
| `isPlannerPopupOpen` | `boolean` | `false` | 플래너 추가 팝업 열림 |
| `plannerDate` | `string \| null` | `null` | 팝업 선택 날짜 |
| `plannerColumnId` | `string \| null` | `null` | 팝업 선택 끼니 ID |
| `plannerServings` | `number` | `2` | 팝업 인분 |
| `eatingId` | `string \| null` | `null` | 다먹음 처리 중인 항목 ID |

### 인터랙션

- **화면 진입** → `GET /leftovers` 호출 → `leftovers` 세팅
- **[다먹음 목록 >] 탭** → ATE_LIST 이동
- **[플래너에 추가] 탭**:
  - `targetLeftover` = 해당 카드 데이터로 세팅
  - `GET /planner` (columns 조회)
  - `isPlannerPopupOpen = true`
- **PlannerAddPopup [플래너에 추가] 탭**:
  - `POST /meals` body: `{ recipe_id: targetLeftover.recipe_id, date: plannerDate, column_id: plannerColumnId, servings: plannerServings, leftover_dish_id: targetLeftover.id }`
  - 성공 → 팝업 닫기 → Toast("플래너에 추가됐어요")
  - 실패 → Toast("추가에 실패했어요. 다시 시도해주세요")
- **[다먹음 ✓] 탭**:
  - `eatingId` = 해당 항목 ID (버튼 로딩 상태)
  - `POST /leftovers/{id}/eat` 호출
  - 성공 → 로컬 `leftovers`에서 해당 항목 즉시 제거 → Toast("다먹음 처리됐어요")
  - 실패 → `eatingId = null` → Toast("처리에 실패했어요")

### ⚠️ 비즈니스 로직 주의사항

- **leftover_dish_id 필수 포함**: `POST /meals` 호출 시 `leftover_dish_id`를 반드시 포함해야 플래너 셀에 남은요리(bg-yellow-50 배경)로 표시됨. 누락 시 일반 식사로 등록되므로 팝업 컴포넌트에서 leftover 컨텍스트 분기 처리 필요.
- **다먹음 후 즉시 목록 제거**: `POST /leftovers/{id}/eat` 성공 시 전체 재조회 없이 로컬 `leftovers` 배열에서 해당 항목 filter 제거. UX 응답성 확보.
- **다먹음 중복 탭 방지**: `eatingId !== null`인 동안 해당 카드의 [다먹음] 버튼 `pointer-events-none`.
- **인증 필수**: 전체 화면 🔒. 비로그인 접근 불가 (BottomTabBar에서 이미 차단됨).

---

## 13. ATE_LIST — 다먹음 목록

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   다먹음 목록                   │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  김치찌개           │  │  <- AteCard
│  │  │  thumb   │  3월 3일 먹음       │  │
│  │  │          │  [D-27일 후 삭제]   │  │  <- 자동삭제 배지 (일반)
│  │  └──────────┘                     │  │
│  │                     ┌──────────┐  │  │
│  │                     │  덜먹음  │  │  │  <- [덜먹음] 버튼
│  │                     └──────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  계란말이           │  │
│  │  │  thumb   │  3월 1일 먹음       │  │
│  │  │          │  [D-1일 후 삭제]    │  │  <- 자동삭제 배지 (D-3 이하 red)
│  │  └──────────┘                     │  │
│  │                     ┌──────────┐  │  │
│  │                     │  덜먹음  │  │  │
│  │                     └──────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (빈 상태: empty state UI)               │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')      │
└──────────────────────────────────────────┘
```

#### 빈 상태 (ateList.length === 0)

```
┌──────────────────────────────────────────┐
│                                          │
│               ✅                         │
│      다 먹은 요리가 없어요                │
│   남은요리에서 다먹음 처리를 하면         │
│     여기에 표시돼요                       │
│                                          │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[← 뒤로가기] 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **타이틀**: `flex-1 text-center text-base font-bold text-gray-900`

#### AteCard

- **카드 컨테이너**: `flex flex-col px-4 py-4 bg-white border-b border-gray-100`
- **상단 행**: `flex items-start gap-3 mb-3`
  - **썸네일**: `w-16 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0`
  - **정보 영역**: `flex-1 flex flex-col gap-1.5`
    - 레시피 제목: `text-sm font-bold text-gray-900 line-clamp-2`
    - 먹은 날짜: `text-xs text-gray-400`
      - 형식: `"3월 3일 먹음"` (`eaten_at` 기준)
    - **자동삭제 배지**: `self-start text-[11px] px-2 py-0.5 rounded-full font-semibold`
      - D-4 이상: `bg-gray-100 text-gray-500` → `"D-N일 후 삭제"`
      - D-3 이하: `bg-red-100 text-red-600` → `"D-N일 후 삭제"`
      - D-0 (당일): `bg-red-500 text-white` → `"오늘 삭제됩니다"`

```
자동삭제 예정일 계산:
  daysLeft = Math.ceil((eaten_at + 30일 - today) / 1일)
  daysLeft >= 4  ->  bg-gray-100 text-gray-500
  1 <= daysLeft <= 3  ->  bg-red-100 text-red-600
  daysLeft === 0  ->  bg-red-500 text-white
```

- **하단 행**: `flex justify-end`
  - **[덜먹음] 버튼**:
    `px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-semibold rounded-lg flex items-center gap-1`
    - 아이콘: ↩ `w-3.5 h-3.5`
    - 탭 후 로딩 중: 스피너 + `pointer-events-none`

#### 빈 상태 UI

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-20 gap-3`
- **아이콘**: `text-5xl` → ✅
- **제목**: `text-sm font-semibold text-gray-600`
- **설명**: `text-xs text-gray-400 text-center leading-relaxed`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `ateList` | `AteItem[]` | API 응답 | 다먹음 목록 |
| `uneatingId` | `string \| null` | `null` | 덜먹음 처리 중인 항목 ID |

### 인터랙션

- **화면 진입** → `GET /leftovers?status=eaten` 호출 → `ateList` 세팅
- **[← 뒤로가기] 탭** → LEFTOVERS로 복귀
- **[덜먹음] 탭**:
  - `uneatingId` = 해당 항목 ID (버튼 로딩 상태)
  - `POST /leftovers/{id}/uneat` 호출
  - 성공 → 로컬 `ateList`에서 해당 항목 즉시 제거 → Toast("남은요리로 돌아갔어요")
  - 실패 → `uneatingId = null` → Toast("처리에 실패했어요")
- **자동삭제 배지 D-값 계산**: 화면 렌더링 시 클라이언트에서 `eaten_at + 30일 - today`를 계산해 실시간 표시

### ⚠️ 비즈니스 로직 주의사항

- **자동삭제는 서버 처리**: `eaten_at + 30일` 후 서버가 자동 삭제. 클라이언트는 배지 표시만 담당하며 삭제 트리거 없음.
- **덜먹음 후 즉시 목록 제거**: `POST /leftovers/{id}/uneat` 성공 시 로컬 `ateList`에서 filter 제거. LEFTOVERS 화면은 다음 진입 시 재조회로 자동 반영.
- **덜먹음 중복 탭 방지**: `uneatingId !== null`인 동안 해당 카드 [덜먹음] 버튼 `pointer-events-none`.
- **D-값 경계 처리**: `daysLeft`가 음수(이미 삭제 예정일 경과)인 경우 → `bg-red-500 text-white` + `"삭제 예정"` 텍스트 표시. 실제 삭제는 서버 처리.

---

## 14. PANTRY — 팬트리

### 레이아웃

#### 일반 모드

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  팬트리          [편집]  [+ 추가]  │  │  <- Header h-14
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  🔍  재료명으로 검색               │  │  <- 검색바 (sticky)
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  채소 (4)  ──────────────────────────   │  <- 카테고리 섹션 헤더
│  ┌────────────────────────────────────┐  │
│  │  양파                        [X]  │  │  <- IngredientRow
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  두부                        [X]  │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  파                          [X]  │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  당근                        [X]  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  양념 (3)  ──────────────────────────   │
│  ┌────────────────────────────────────┐  │
│  │  간장                        [X]  │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  소금                        [X]  │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  된장                        [X]  │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
│                                          │
│  (빈 상태: empty state UI)               │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='pantry')       │
└──────────────────────────────────────────┘
```

#### 편집 모드 (isEditMode=true)

```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │  팬트리              [완료]        │  │  <- 편집 모드 Header
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  🔍  재료명으로 검색               │  │  <- 검색바
│  └────────────────────────────────────┘  │
│                                          │
│  채소 (4)  ──────────────────────────   │
│  ┌────────────────────────────────────┐  │
│  │  □  양파                           │  │  <- 체크박스 + 재료명
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ☑  두부                           │  │  <- 선택된 행
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ☑  파                             │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │     선택 삭제 (2개)                │  │  <- 하단 고정 버튼
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### 추가 BottomSheet

```
┌──────────────────────────────────────────┐
│  배경 dim bg-black/40                    │
│  ┌────────────────────────────────────┐  │
│  │  ─────  (드래그 핸들)              │  │
│  │  팬트리에 추가하기                  │  │  <- 시트 헤더
│  │                                    │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  🔍  재료명 검색 또는 입력    │  │  │  <- 재료 검색 인풋
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  [검색 결과 재료 칩 목록]     │  │  │  <- 검색 결과
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  📦  묶음으로 추가            │  │  │  <- 묶음 추가 경로
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### 빈 상태 (pantryItems.length === 0 + 검색 결과 없음)

```
┌──────────────────────────────────────────┐
│                                          │
│               🧊                         │
│      팬트리가 비어있어요                  │
│  집에 있는 재료를 추가하면               │
│  장보기 목록에서 자동으로 제외돼요        │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │        + 재료 추가하기           │   │  <- CTA 버튼
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

**일반 모드**:
- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 h-14`
- **타이틀**: `text-lg font-bold text-gray-900`
- **우측 버튼 그룹**: `flex items-center gap-2`
  - **[편집] 버튼**: `text-sm text-gray-600 font-medium px-2 py-1`
  - **[+ 추가] 버튼**: `flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg`

**편집 모드**:
- **컨테이너**: 동일
- **타이틀**: 동일
- **[완료] 버튼**: `text-sm text-green-600 font-semibold px-2 py-1`

#### 검색바 (sticky)

- **컨테이너**: `px-4 py-2 bg-white border-b border-gray-100 sticky top-0 z-10`
- **인풋 래퍼**: `flex items-center gap-2 bg-gray-100 rounded-xl px-3 h-10`
  - 아이콘: `w-4 h-4 text-gray-400`
  - 인풋: `flex-1 text-sm bg-transparent outline-none placeholder-gray-400`
  - placeholder: `"재료명으로 검색"`
  - 검색어 입력 시 [X] 초기화 버튼 노출

#### 카테고리 섹션 헤더

- **컨테이너**: `flex items-center gap-2 px-4 py-2 bg-gray-50 border-y border-gray-200 sticky top-[52px] z-10`
- **카테고리명**: `text-xs font-bold text-gray-600 uppercase tracking-wide`
- **재료 수**: `text-xs text-gray-400` → `"(N)"`

#### IngredientRow — 일반 모드

- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100`
- **재료명**: `text-sm text-gray-900`
- **[X] 삭제 버튼**: `w-7 h-7 flex items-center justify-center text-gray-400 rounded-full`
  - 탭 → ConfirmModal("이 재료를 삭제할까요?") → 확인 → `DELETE /pantry` body: `{ ingredient_ids: [id] }`

#### IngredientRow — 편집 모드

- **컨테이너**: `flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100`
  - 선택된 행: `bg-green-50`
- **체크박스**: 세션 1 공통 컴포넌트 스타일 동일
  - 미선택: `w-5 h-5 rounded border-2 border-gray-300 bg-white`
  - 선택: `w-5 h-5 rounded border-2 border-green-600 bg-green-600` + 흰 체크
- **재료명**: `flex-1 text-sm text-gray-900`

#### 하단 고정 버튼 — 편집 모드

- **컨테이너**: `fixed bottom-16 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200`
- **[선택 삭제 (N개)] 버튼**:
  - 활성(1개 이상 선택): `w-full py-3.5 bg-red-500 text-white text-base font-semibold rounded-xl`
  - 비활성(0개 선택): `w-full py-3.5 bg-gray-200 text-gray-400 text-base font-semibold rounded-xl cursor-not-allowed`

#### 추가 BottomSheet

- **오버레이**: `fixed inset-0 bg-black/40 z-40`
- **시트 본체**: `fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl px-4 pt-3 pb-8`
  - 드래그 핸들: `mx-auto w-10 h-1 bg-gray-300 rounded-full mb-4`
- **시트 헤더**: `text-base font-bold text-gray-900 mb-3`
- **재료 검색 인풋**: SearchBar와 동일 스타일
  - 검색 결과: 재료 칩 그리드 형태 (`flex flex-wrap gap-2`)
    - 재료 칩 탭 → 즉시 `POST /pantry` 호출 → Toast("추가됐어요") → 칩 비활성 처리
    - 검색 결과 없을 때: `text-xs text-gray-400` → `"직접 입력하여 추가할 수 있어요"`
      - 엔터 또는 [추가] 버튼 → 직접 입력 텍스트로 `POST /pantry`
- **[📦 묶음으로 추가] 버튼**: `flex items-center gap-2 w-full py-3.5 mt-2 bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl`
  - 탭 → BottomSheet 닫기 → PANTRY_BUNDLE_PICKER 이동

#### 빈 상태 UI

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-20 gap-3`
- **아이콘**: `text-5xl` → 🧊
- **제목**: `text-sm font-semibold text-gray-600`
- **설명**: `text-xs text-gray-400 text-center leading-relaxed`
- **[+ 재료 추가하기] 버튼**: `mt-3 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl`
  - 탭 → 추가 BottomSheet 오픈

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `pantryItems` | `PantryItem[]` | API 응답 | 팬트리 전체 재료 목록 |
| `searchQuery` | `string` | `""` | 재료 검색어 |
| `filteredItems` | `PantryItem[]` | `pantryItems` | 검색 필터 적용된 목록 |
| `isEditMode` | `boolean` | `false` | 편집 모드 여부 |
| `selectedIds` | `Set<string>` | `new Set()` | 편집 모드 선택된 재료 ID 집합 |
| `isAddSheetOpen` | `boolean` | `false` | 추가 BottomSheet 열림 |
| `addSearchQuery` | `string` | `""` | 추가 시트 내 검색어 |
| `addSearchResults` | `Ingredient[]` | `[]` | 추가 시트 검색 결과 |
| `isDeletingIds` | `Set<string>` | `new Set()` | 삭제 처리 중인 ID 집합 |

### 인터랙션

- **화면 진입** → `GET /pantry` → `pantryItems` 세팅
- **검색바 입력** → `searchQuery` 업데이트 → `filteredItems`를 클라이언트에서 filter (표준명 + 동의어는 이미 `pantryItems`에 포함) → 즉시 반영 (API 미호출)
- **[편집] 탭** → `isEditMode = true`, Header 버튼 [완료]로 교체
- **[완료] 탭** → `isEditMode = false`, `selectedIds = new Set()` 초기화
- **편집 모드 재료 행 탭** → `selectedIds` 토글
- **[선택 삭제 (N개)] 탭**:
  - if `selectedIds.size === 0` → 아무 동작 없음
  - if `selectedIds.size > 0` → ConfirmModal("N개 재료를 삭제할까요?", `destructive`)
    - 확인 → `DELETE /pantry` body: `{ ingredient_ids: [...selectedIds] }`
    - 성공 → 로컬 `pantryItems`에서 해당 항목 제거 → `selectedIds` 초기화 → Toast("삭제됐어요")
- **[X] 단건 삭제 탭** (일반 모드) → ConfirmModal → 확인 → `DELETE /pantry` body: `{ ingredient_ids: [id] }` → 로컬 제거
- **[+ 추가] 탭** → `isAddSheetOpen = true`
- **추가 시트 내 재료 검색** → 디바운스 300ms → `GET /ingredients?q={query}` → `addSearchResults` 세팅
- **검색 결과 칩 탭** → `POST /pantry` body: `{ ingredient_id }` → Toast("추가됐어요") → 로컬 `pantryItems` 즉시 반영
- **[📦 묶음으로 추가] 탭** → 시트 닫기 → PANTRY_BUNDLE_PICKER 이동

### ⚠️ 비즈니스 로직 주의사항

- **팬트리 = 장보기 자동 제외 기준**: 팬트리에 등록된 재료는 `POST /shopping/lists` 시 서버가 `is_pantry_excluded=true`로 자동 세팅. 클라이언트는 이 연동 로직을 별도 처리하지 않음.
- **COOK_MODE 소진 재료 삭제 연동**: COOK_MODE 완료 팝업에서 선택된 재료는 서버가 팬트리에서 자동 삭제. PANTRY 화면 재진입 시 `GET /pantry` 재조회로 반영.
- **검색 클라이언트 필터**: 팬트리 검색은 API 미호출. 이미 불러온 `pantryItems` 배열을 클라이언트에서 filter. 표준명 + 동의어 매칭은 `pantryItems`의 `synonyms` 필드를 포함해 필터링.
- **편집 모드 중 [+ 추가] 비활성**: `isEditMode === true`인 동안 Header의 [+ 추가] 버튼 숨김 처리 (편집/추가 모드 중첩 방지).
- **카테고리 섹션 헤더 sticky**: 카테고리 헤더가 scroll 시 검색바 바로 아래에 고정되도록 `sticky top-[52px]` 처리.

---

## 15. PANTRY_BUNDLE_PICKER — 팬트리 묶음 선택

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   묶음으로 추가                 │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │  <- BundleCard (접힘 상태)
│  │  기본 양념 세트        재료 8개  ▼ │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │  <- BundleCard (펼침 상태)
│  │  조미료 모음           재료 6개  ▲ │  │  <- 카드 헤더
│  │  ┌──────────────────────────────┐  │  │
│  │  │  ☑  간장          (없음)     │  │  │  <- 재료 행 (미보유, 기본 선택)
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  ☑  된장          (없음)     │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  □  소금    [보유중]         │  │  │  <- 재료 행 (보유중, 기본 미선택)
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  □  후추    [보유중]         │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  ☑  설탕          (없음)     │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  ☑  참기름        (없음)     │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │  <- BundleCard (접힘)
│  │  국물 재료             재료 5개  ▼ │  │
│  └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │         4개 추가하기               │  │  <- 하단 고정 CTA
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### 빈 상태 (bundles.length === 0)

```
┌──────────────────────────────────────────┐
│                                          │
│               📦                         │
│      등록된 묶음이 없어요                 │
│                                          │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[← 뒤로가기] 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **타이틀**: `flex-1 text-center text-base font-bold text-gray-900`

#### BundleCard (아코디언)

**접힘 상태**:

- **카드 컨테이너**: `bg-white border-b border-gray-100`
- **카드 헤더**: `flex items-center justify-between px-4 py-4`
  - 묶음명: `text-sm font-bold text-gray-900`
  - 우측 정보: `flex items-center gap-2`
    - 재료 수: `text-xs text-gray-400`
    - 아코디언 아이콘: `w-4 h-4 text-gray-400` (▼ 접힘 / ▲ 펼침)
  - 탭 → 펼침/접힘 토글

**펼침 상태**:

- 카드 헤더 동일 (▲ 아이콘으로 변경)
- **재료 목록**: `border-t border-gray-100`

#### BundleIngredientRow (묶음 내 재료 행)

```
미보유 재료 (is_in_pantry=false):
┌──────────────────────────────────────────┐
│  ☑  간장                    (없음)       │
│  체크박스  재료명             상태 텍스트  │
└──────────────────────────────────────────┘

보유중 재료 (is_in_pantry=true):
┌──────────────────────────────────────────┐
│  □  소금        [보유중]                 │
│  체크박스  재료명  보유중 배지            │
└──────────────────────────────────────────┘
```

- **행 컨테이너**: `flex items-center gap-3 px-4 py-3 border-b border-gray-100`
  - 보유중 선택 상태: `bg-green-50`
- **체크박스**: 세션 1 공통 스타일
  - 미보유 기본: **선택 상태** (`bg-green-600 border-green-600`)
  - 보유중 기본: **미선택 상태** (`bg-white border-gray-300`)
  - 사용자가 직접 토글 가능 (보유중도 강제 선택 추가 가능)
- **재료명**: `flex-1 text-sm`
  - 미보유: `text-gray-900`
  - 보유중(미선택): `text-gray-400`
  - 보유중(선택): `text-gray-900`
- **상태 표시**:
  - 미보유: `text-xs text-gray-300` → `"(없음)"` (선택 시 숨김)
  - 보유중 배지: `text-[11px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full` → `"보유중"`

#### 하단 고정 CTA

- **컨테이너**: `fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200`
- **[N개 추가하기] 버튼**: `w-full py-3.5 text-base font-semibold rounded-xl`
  - 활성(1개 이상): `bg-green-600 text-white`
  - 비활성(0개): `bg-gray-200 text-gray-400 cursor-not-allowed`
  - N 계산: `selectedIds` 중 `is_in_pantry=false`인 항목 수
    - 보유중 재료를 강제 선택한 경우도 N에 포함

```
N 계산 로직:
  selectedCount = [...selectedIds].filter(id => {
    const item = findIngredientById(id)
    return true  // 선택된 모든 항목 카운트
  }).length
```

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `bundles` | `PantryBundle[]` | API 응답 | 묶음 목록 |
| `expandedBundleId` | `string \| null` | `null` | 현재 펼친 묶음 ID |
| `selectedIds` | `Set<string>` | 미보유 재료 전체 | 추가할 재료 ID 집합 |
| `isAdding` | `boolean` | `false` | POST /pantry 호출 중 |

```typescript
// 초기 selectedIds 세팅 로직 (화면 진입 시)
const initialSelected = new Set(
  bundles
    .flatMap(b => b.ingredients)
    .filter(i => !i.is_in_pantry)
    .map(i => i.ingredient_id)
)
```

### 인터랙션

- **화면 진입** → `GET /pantry/bundles` 호출 → `bundles` 세팅 → `selectedIds` 초기화 (미보유 전체 선택)
- **BundleCard 헤더 탭**:
  - if `expandedBundleId === bundle.id` → `expandedBundleId = null` (접힘)
  - else → `expandedBundleId = bundle.id` (펼침, 이전 펼침 카드 자동 접힘)
- **BundleIngredientRow 탭** → `selectedIds` 토글
  - 보유중 재료 선택 시: 체크박스 활성화, 재료명 `text-gray-900` 변경
  - 보유중 재료 해제 시: 체크박스 비활성화, 재료명 `text-gray-400` 변경
- **[N개 추가하기] 탭**:
  - if `selectedIds.size === 0` → 아무 동작 없음
  - if `selectedIds.size > 0`:
    - `isAdding = true`
    - `POST /pantry` body: `{ ingredient_ids: [...selectedIds] }`
    - 성공 → Toast("N개 재료를 팬트리에 추가했어요") → PANTRY 화면으로 복귀
    - 실패 → `isAdding = false` → Toast("추가에 실패했어요. 다시 시도해주세요")
- **[← 뒤로가기] 탭** → PANTRY로 복귀

### ⚠️ 비즈니스 로직 주의사항

- **is_in_pantry=true 기본 미선택**: 중복 추가 방지를 위해 이미 보유 중인 재료는 체크박스 기본 해제. 단, 사용자가 직접 선택 가능 (강제 추가 허용). 이 경우 `POST /pantry`에 포함되며 서버가 중복 처리.
- **N 카운트 = 선택된 전체**: [N개 추가하기] 버튼의 N은 `selectedIds.size`로 계산. 보유중 재료를 강제 선택한 경우도 포함.
- **아코디언 단일 펼침**: 한 번에 하나의 묶음만 펼침 상태 유지. 다른 카드 탭 시 이전 카드 자동 접힘.
- **`POST /pantry` 멱등 처리**: 이미 보유 중인 재료를 다시 추가해도 서버가 중복 INSERT 없이 처리 (upsert 방식). 클라이언트는 별도 예외 처리 불필요.
- **복귀 시 팬트리 목록 갱신**: 추가 완료 후 PANTRY 복귀 시 `GET /pantry` 재조회. 직전 화면이 PANTRY이므로 스택 pop 후 useEffect re-fetch 또는 `onFocus` 재조회로 처리.
