# 집밥 서비스 — 와이어프레임 세션 2

> 세션 1의 공통 컴포넌트(BottomTabBar, Toast, ConfirmModal, RecipeCard, ServingStepper, LoginRequiredModal)를 그대로 재사용한다.
> 모바일 기준: width 375px / Tailwind CSS 클래스명 기준

---

## 목차

- [4. SHOPPING_FLOW — 장보기 플로우](#4-shopping_flow--장보기-플로우)
- [5. SHOPPING_DETAIL — 장보기 상세](#5-shopping_detail--장보기-상세)
- [6. COOK_READY_LIST — 요리 준비 리스트](#6-cook_ready_list--요리-준비-리스트)
- [7. COOK_MODE — 요리모드](#7-cook_mode--요리모드)

---

## 4. SHOPPING_FLOW — 장보기 플로우

### 레이아웃

```
┌──────────────────────────────────────────┐  ← 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   장보기 목록 만들기             │  │  ← Header h-14
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  장볼 레시피를 확인하고            │  │
│  │  인분을 조정해보세요               │  │  ← 안내 텍스트
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│  ┌────────────────────────────────────┐  │
│  │ ☑  [썸네일]  김치찌개              │  │
│  │              합산 3인분            │  │  ← RecipeRow
│  │              [−][  3  ][+]        │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ☑  [썸네일]  된장국               │  │
│  │              합산 2인분            │  │
│  │              [−][  2  ][+]        │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ □  [썸네일]  계란말이              │  │  ← 체크 해제 상태
│  │              합산 2인분            │  │
│  │   (텍스트 전체 opacity-40)         │  │
│  │              [−][  2  ][+]        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (레시피 없을 때: 빈 상태 UI)            │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ 선택된 레시피: 2개 / 전체 3개      │  │  ← 선택 요약
│  │ ┌──────────────────────────────┐   │  │
│  │ │    장보기 목록 만들기         │   │  │  ← CTA 버튼
│  │ └──────────────────────────────┘   │  │
│  └────────────────────────────────────┘  │
│  BottomTabBar (activeTab='planner')      │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 border-b border-gray-100 bg-white h-14`
- **뒤로가기 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **제목**: `flex-1 text-center text-base font-bold text-gray-900`

#### 안내 텍스트 배너

- **컨테이너**: `px-4 py-3 bg-green-50 border-b border-green-100`
- **텍스트**: `text-sm text-green-800 leading-relaxed`

#### RecipeRow (레시피 행)

```
┌──────────────────────────────────────────┐
│  ┌──┐  ┌────┐  제목 (line-clamp-1)      │
│  │☑ │  │thumb│  합산 N인분               │
│  └──┘  └────┘  [−][  N  ][+]           │
└──────────────────────────────────────────┘
```

- **외부 컨테이너**: `flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100`
  - 체크 해제 상태: `bg-gray-50`
- **체크박스**: `w-5 h-5 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center`
  - 체크 상태: `bg-green-600 border-green-600` + 흰색 체크 아이콘
  - 미체크 상태: `bg-white border-gray-300`
- **썸네일**: `w-14 h-14 rounded-lg object-cover bg-gray-100 flex-shrink-0`
- **정보 영역**: `flex-1 flex flex-col gap-1.5`
  - 제목: `text-sm font-semibold text-gray-900 line-clamp-1`
    - 미체크 상태: `text-gray-400`
  - 합산 인분 텍스트: `text-xs text-gray-400`
    - 미체크 상태: `opacity-40`
- **ServingStepper**: 공통 컴포넌트 재사용
  - 미체크 상태: `opacity-40 pointer-events-none`

#### 하단 고정 영역

- **컨테이너**: `fixed bottom-16 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200`
- **선택 요약 텍스트**: `text-xs text-gray-500 text-center mb-2`
  - 형식: `"선택된 레시피: 2개 / 전체 3개"`
- **[장보기 목록 만들기] 버튼**:
  - 활성: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl`
  - 비활성(선택 0개): `w-full py-3.5 bg-gray-200 text-gray-400 text-base font-semibold rounded-xl cursor-not-allowed`

#### 빈 상태 UI (레시피 없을 때)

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-16 gap-3`
- **아이콘**: `text-5xl`  →  🛒
- **제목**: `text-sm font-semibold text-gray-600`  →  "장볼 레시피가 없어요"
- **설명**: `text-xs text-gray-400 text-center leading-relaxed`
  - 내용: "플래너에 메뉴를 추가하면\n장보기 목록을 만들 수 있어요"
- **[플래너 가기] 버튼**: `mt-2 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `recipes` | `ShoppingRecipe[]` | API 응답 | 취합된 레시피 목록 |
| `checkedIds` | `Set<string>` | 전체 선택 | 장보기에 포함할 recipe_id 집합 |
| `servingsMap` | `Record<string, number>` | API 응답 | recipe_id → shopping_servings |
| `isCreating` | `boolean` | `false` | 목록 생성 API 로딩 중 |

### 인터랙션

- **화면 진입** → `GET /shopping/preview` 호출 → `recipes` 세팅, 전체 `checkedIds` 초기화
- **체크박스 탭** → `checkedIds`에 토글 (추가/제거)
- **ServingStepper 변경** → `servingsMap[recipe_id]` 즉시 업데이트 (로컬 상태만, API 미호출)
- **[장보기 목록 만들기] 탭**:
  - if `checkedIds.size === 0` → Toast("최소 1개의 레시피를 선택해주세요")
  - if `checkedIds.size > 0` → `isCreating = true` → `POST /shopping/lists` 호출
    - body: `{ recipe_ids: [...checkedIds], servings_map: servingsMap }`
  - 성공 → `GET /shopping/lists/{id}` (응답의 list_id) → SHOPPING_DETAIL 자동 이동
  - 실패 → Toast("목록 생성에 실패했어요. 다시 시도해주세요")
- **[← 뒤로] 탭** → PLANNER_WEEK로 복귀

### ⚠️ 비즈니스 로직 주의사항

- **대상 조건 엄수**: 서버가 `status='registered' AND shopping_list_id IS NULL` 조건으로 meals를 필터링하여 레시피를 취합해 반환. 클라이언트는 이 결과를 그대로 렌더링하며 별도 필터링 불필요.
- **합산 인분 표시**: `합산 인분`은 해당 레시피가 플래너에 등록된 모든 meal의 servings 합계. ServingStepper의 `shopping_servings`는 장보기 계산용이며 플래너 meal servings를 수정하지 않음.
- **중복 목록 생성 방지**: `isCreating === true` 동안 [장보기 목록 만들기] 버튼 `pointer-events-none` + 로딩 스피너 표시.
- **전체 선택 기본값**: 화면 진입 시 모든 레시피가 체크된 상태(전체 선택)로 시작.

---

## 5. SHOPPING_DETAIL — 장보기 상세

### 레이아웃

```
┌──────────────────────────────────────────┐  ← 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   장보기 목록     [공유] [완료] │  │  ← Header h-14
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  3/3(월) ~ 3/5(수) · 레시피 3개   │  │  ← 메타 정보 배너
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ── 구매 목록 (N개) ─────────────────   │  ← 섹션 A 헤더
│  ┌────────────────────────────────────┐  │
│  │ ⠿  □  양파        2개  [채소]      │  │  ← ItemCard (미구매)
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ⠿  ☑  두부        1모  [두부/콩]   │  │  ← ItemCard (구매완료)
│  │       (취소선 텍스트 처리)          │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ ⠿  □  파          1단  [채소]      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ── 팬트리에 있어요 (N개) ────────────   │  ← 섹션 B 헤더
│  ┌────────────────────────────────────┐  │  bg-gray-50
│  │     간장        2큰술  [양념]       │  │  ← ExcludedCard
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │     소금        적당히  [양념]      │  │
│  └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')      │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 border-b border-gray-100 bg-white h-14`
- **뒤로가기 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **제목**: `flex-1 text-center text-base font-bold text-gray-900`
- **[공유] 버튼**: `text-sm text-green-600 font-semibold px-2`
  - read-only 상태에서도 공유 버튼은 활성 유지
- **[완료] 버튼**: `text-sm text-green-600 font-semibold px-2`
  - `is_completed === true`이면 렌더링 안 함 (숨김)

#### 메타 정보 배너

- **컨테이너**: `px-4 py-2.5 bg-green-50 border-b border-green-100`
- **텍스트**: `text-xs text-green-700`
  - 형식: `"3/3(월) ~ 3/5(수) · 레시피 3개"`
- **완료 배지** (`is_completed === true`):
  - `inline-flex items-center gap-1 text-xs text-green-700 font-semibold`
  - `"✅ 장보기 완료"` 텍스트 추가

#### 섹션 헤더

- **컨테이너**: `px-4 py-2 bg-gray-50 border-y border-gray-200 sticky top-0 z-10`
- **섹션명**: `text-xs font-semibold text-gray-500 uppercase tracking-wide`
  - 섹션 A: `"구매 목록 (N개)"`
  - 섹션 B: `"팬트리에 있어요 (N개)"`

#### ItemCard — 섹션 A (구매 목록)

```
┌──────────────────────────────────────────┐
│  ⠿   □   양파       2개    [채소]        │
│  드래그  체크  재료명  수량   카테고리태그  │
└──────────────────────────────────────────┘
```

- **외부 컨테이너**: `flex items-center gap-3 px-4 py-3.5 bg-white border-b border-gray-100`
  - 드래그 중 상태: `shadow-lg bg-white border border-green-400 rounded-xl z-20 opacity-95`
  - 구매 완료 상태(`is_checked=true`): `bg-gray-50`
- **드래그 핸들**: `w-5 h-5 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing`
  - 아이콘: `⠿` (dots-six) 또는 `≡`
  - read-only 상태: `opacity-0 pointer-events-none` (숨김)
- **체크박스**: `w-5 h-5 rounded border-2 flex-shrink-0`
  - 미체크: `border-gray-300 bg-white`
  - 체크: `border-green-600 bg-green-600` + 흰 체크 아이콘
  - read-only 상태: `pointer-events-none`
- **재료명**: `flex-1 text-sm font-medium text-gray-900`
  - 구매 완료: `line-through text-gray-400`
- **수량**: `text-sm text-gray-600 mr-2`
  - 복합 표기(단위 불일치) 예시: `"2개 + 200g"` → `text-xs text-orange-600`
- **카테고리 태그**: `text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200 flex-shrink-0`

#### ExcludedCard — 섹션 B (팬트리에 있어요)

```
┌──────────────────────────────────────────┐
│      간장          2큰술    [양념]         │
│   (드래그 핸들 없음, 체크박스 없음)        │
└──────────────────────────────────────────┘
```

- **외부 컨테이너**: `flex items-center gap-3 px-4 py-3.5 bg-gray-50 border-b border-gray-200`
  - 드래그 중 상태(위로 드래그 시): `shadow-lg bg-white border border-green-400 rounded-xl z-20`
- **재료명**: `flex-1 text-sm font-medium text-gray-400`
- **수량**: `text-sm text-gray-400`
- **카테고리 태그**: `text-[10px] px-2 py-0.5 bg-gray-200 text-gray-400 rounded-full`
- **복귀 안내 텍스트**: 섹션 B 최상단에 `text-[11px] text-gray-400 text-center py-1` → `"위로 드래그하면 구매 목록으로 이동해요"`

---

#### 드래그&드롭 동작 정의

**섹션 A 내 순서 변경:**

```
사용자 드래그 시작 (드래그 핸들 롱프레스 또는 터치홀드)
  → 해당 ItemCard: shadow-lg + 살짝 scale-105
  → 다른 카드들: 위아래로 자리 이동 애니메이션
드래그 놓기
  → 로컬 순서 즉시 반영
  → PATCH /shopping/lists/{id}/items/reorder 호출
    body: { ordered_ids: ["item1", "item3", "item2", ...] }
```

**섹션 A → 섹션 B 이동 (아래로 드래그):**

```
섹션 A 아이템을 섹션 B 영역으로 드래그
  → 드롭 존 하이라이트: 섹션 B 배경 bg-yellow-50 전환
드래그 놓기
  → PATCH /shopping/lists/{id}/items/{item_id}
    body: { is_pantry_excluded: true }
  → 클라이언트: is_checked 강제 false로 설정 (체크 해제)
  → 아이템을 섹션 B로 이동 (로컬 상태 즉시 반영)
```

**섹션 B → 섹션 A 복귀 (위로 드래그):**

```
섹션 B 아이템을 섹션 A 영역으로 드래그
  → 드롭 존 하이라이트: 섹션 A 하단 bg-green-50
드래그 놓기
  → PATCH /shopping/lists/{id}/items/{item_id}
    body: { is_pantry_excluded: false }
  → 아이템을 섹션 A 하단에 추가 (로컬 상태 즉시 반영)
```

---

#### PantryAddPopup — 장보기 완료 팝업

```
┌──────────────────────────────────────────┐
│  dim overlay bg-black/50                 │
│  ┌────────────────────────────────────┐  │
│  │  팬트리에 추가할 재료를 선택하세요  │  │  ← 제목
│  │  구매한 재료를 집 재료로 등록해요   │  │  ← 부제
│  │  ┌──────────────────────────────┐  │  │
│  │  │ [전체 선택 / 전체 해제]       │  │  │  ← 전체 선택 토글
│  │  └──────────────────────────────┘  │  │
│  │  스크롤 목록                        │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ☑  양파   2개               │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ☑  두부   1모               │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ☑  파     1단               │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │    팬트리에 추가              │  │  │  ← 주요 CTA
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │    추가 안 함                │  │  │  ← 서브 CTA
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- **시트 컨테이너**: `fixed inset-0 bg-black/50 z-50 flex items-end`
- **팝업 본체**: `bg-white rounded-t-2xl w-full px-4 pt-5 pb-8 max-h-[75vh] flex flex-col`
- **제목**: `text-base font-bold text-gray-900`
- **부제**: `text-xs text-gray-500 mt-0.5`
- **전체 선택 행**: `flex items-center justify-between py-2 border-b border-gray-200 mt-3 mb-1`
  - 텍스트: `text-sm font-semibold text-gray-700`
  - 토글: 전체 선택 ↔ 전체 해제 텍스트 전환
- **아이템 목록**: `overflow-y-auto flex-1 mt-1`
- **팝업 아이템 행**: `flex items-center gap-3 py-3 border-b border-gray-100`
  - 체크박스: 공통 스타일
  - 재료명: `text-sm text-gray-900`
  - 수량: `text-sm text-gray-500 ml-auto`
- **[팬트리에 추가] 버튼**: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl mt-4`
- **[추가 안 함] 버튼**: `w-full py-3 bg-white text-gray-500 text-sm font-medium mt-2`

---

#### ReadOnly 상태 오버레이

`is_completed === true`일 때 전체 인터랙션 차단:

- ItemCard 체크박스: `pointer-events-none opacity-60`
- 드래그 핸들: `opacity-0 pointer-events-none`
- 섹션 이동(드래그): 완전 비활성
- Header [완료] 버튼: 숨김
- 상단 완료 배너: `"✅ 장보기 완료"` 표시

---

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `listId` | `string` | 라우트 파라미터 | 현재 장보기 리스트 ID |
| `listMeta` | `ShoppingListMeta` | API 응답 | 날짜 범위, 레시피 수, is_completed |
| `sectionA` | `ShoppingItem[]` | API 응답 | 구매 목록 (is_pantry_excluded=false) |
| `sectionB` | `ShoppingItem[]` | API 응답 | 팬트리 제외 목록 (is_pantry_excluded=true) |
| `isDragging` | `boolean` | `false` | 드래그 중 여부 |
| `draggingItemId` | `string \| null` | `null` | 드래그 중인 아이템 ID |
| `isCompletePopupOpen` | `boolean` | `false` | 완료 팝업 표시 여부 |
| `pantryAddSelection` | `Set<string>` | 체크 아이템 전체 | 팬트리 추가 선택 아이템 ID 집합 |
| `isCompleting` | `boolean` | `false` | 완료 API 호출 중 |

### 인터랙션

- **화면 진입** → `GET /shopping/lists/{id}` 호출 → sectionA / sectionB 분리 렌더링
- **체크박스 탭 (섹션 A)**:
  - if `is_completed === false` → `PATCH /shopping/lists/{id}/items/{item_id}` (`is_checked` 토글)
  - if `is_completed === true` → Toast("완료된 장보기 목록은 수정할 수 없어요") [409 안내]
- **드래그 핸들 롱프레스 (섹션 A)** → 드래그 모드 진입 (`isDragging=true`, `draggingItemId` 세팅)
  - 섹션 A 내 드롭 → 순서 변경 → `PATCH /shopping/lists/{id}/items/reorder`
  - 섹션 B 영역으로 드롭 → A→B 이동 → `PATCH` (`is_pantry_excluded: true`) + 로컬 `is_checked=false`
- **섹션 B 아이템 위로 드래그** → 섹션 A로 이동 → `PATCH` (`is_pantry_excluded: false`) → sectionA 하단에 추가
- **[공유] 버튼 탭** → `GET /shopping/lists/{id}/share-text` 호출 → 네이티브 공유 시트 오픈
  - 공유 텍스트에 섹션 B(팬트리 제외) 항목 미포함
- **[완료] 버튼 탭** → `isCompletePopupOpen = true` → PantryAddPopup 표시
  - 팝업 초기값: 섹션 A에서 `is_checked=true`인 아이템 전체 선택
- **PantryAddPopup [팬트리에 추가] 탭**:
  - `POST /shopping/lists/{id}/complete`
  - body: `{ add_to_pantry_item_ids: [...pantryAddSelection] }`
  - 성공 → `listMeta.is_completed = true` → ReadOnly 전환 → Toast("장보기 완료! 팬트리에 추가했어요") → COOK_READY_LIST 이동
- **PantryAddPopup [추가 안 함] 탭**:
  - `POST /shopping/lists/{id}/complete`
  - body: `{ add_to_pantry_item_ids: [] }`
  - 성공 → ReadOnly 전환 → Toast("장보기가 완료되었어요") → COOK_READY_LIST 이동
- **[← 뒤로] 탭** → PLANNER_WEEK로 복귀

### ⚠️ 비즈니스 로직 주의사항

- **A→B 이동 시 is_checked 강제 해제**: `is_pantry_excluded=true` 세팅과 동시에 로컬 `is_checked=false` 처리. 서버도 자동 정리하지만 클라이언트에서도 선제 반영.
- **완료 후 read-only 409 처리**: `is_completed=true` 상태에서 PATCH/reorder 호출 시 서버 409 반환. 클라이언트는 409 수신 전에 UI 레벨에서 차단(`pointer-events-none`). 409 수신 시 Toast("완료된 장보기 목록은 수정할 수 없어요") 표시.
- **드래그&드롭 낙관적 업데이트**: 드롭 즉시 로컬 상태 업데이트 후 API 호출. API 실패 시 로컬 상태 롤백 + Toast("순서 저장에 실패했어요").
- **복합 표기 수량**: 단위 변환 불가 재료(예: 양파 2개 + 200g)는 `text-xs text-orange-600`으로 표시.
- **공유 텍스트 섹션 B 제외**: `GET /shopping/lists/{id}/share-text`는 서버가 제외 처리하지만, 공유 버튼 탭 시 클라이언트 안내 문구("팬트리 재료는 제외됩니다")를 공유 시트 미리보기에 표시.
- **멱등성**: [팬트리에 추가] 또는 [추가 안 함] 버튼 탭 후 `isCompleting=true`로 중복 호출 차단. 완료 API는 멱등 보장(200 반환).

---

## 6. COOK_READY_LIST — 요리 준비 리스트

### 레이아웃

```
┌──────────────────────────────────────────┐  ← 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   요리 준비                     │  │  ← Header h-14
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  장보기 완료된 메뉴예요             │  │
│  │  요리를 시작해보세요 🍳             │  │  ← 안내 배너
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  김치찌개            │  │
│  │  │  thumb   │  🍽 2끼니 · 합산 4인분│  │  ← CookReadyCard
│  │  │          │                     │  │
│  │  └──────────┘  ┌───────────────┐  │  │
│  │                │  요리하기 ▶   │  │  │
│  │                └───────────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────┐                     │  │
│  │  │          │  된장국              │  │
│  │  │  thumb   │  🍽 1끼니 · 합산 2인분│  │
│  │  │          │                     │  │
│  │  └──────────┘  ┌───────────────┐  │  │
│  │                │  요리하기 ▶   │  │  │
│  │                └───────────────┘  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (빈 상태: 요리할 메뉴 없음 UI)          │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='planner')      │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 border-b border-gray-100 bg-white h-14`
- **뒤로가기 버튼**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **제목**: `flex-1 text-center text-base font-bold text-gray-900`

#### 안내 배너

- **컨테이너**: `px-4 py-3 bg-orange-50 border-b border-orange-100`
- **텍스트**: `text-sm text-orange-800 leading-relaxed`

#### CookReadyCard

```
┌──────────────────────────────────────────┐
│  ┌───────────┐                           │
│  │           │  레시피 제목              │
│  │  thumb    │  🍽 N끼니 · 합산 N인분    │
│  │  (정사각) │                           │
│  │           │  ┌─────────────────────┐  │
│  └───────────┘  │   요리하기  ▶       │  │
│                 └─────────────────────┘  │
└──────────────────────────────────────────┘
```

- **카드 컨테이너**: `flex items-center gap-4 px-4 py-4 bg-white border-b border-gray-100`
- **썸네일**: `w-20 h-20 rounded-xl object-cover bg-gray-100 flex-shrink-0`
- **정보 영역**: `flex-1 flex flex-col gap-2`
  - 제목: `text-base font-bold text-gray-900 line-clamp-2`
  - 메타 정보: `flex items-center gap-1.5 text-xs text-gray-500`
    - 형식: `"🍽 2끼니 · 합산 4인분"`
- **[요리하기 ▶] 버튼**: `px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg flex items-center gap-1 self-end`
  - 로딩 상태(세션 생성 중): 스피너 + `"준비 중..."` 텍스트 + `opacity-70`

#### 빈 상태 UI

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-20 gap-3`
- **아이콘**: `text-5xl`  →  🍳
- **제목**: `text-sm font-semibold text-gray-600`  →  "요리할 메뉴가 없어요"
- **설명**: `text-xs text-gray-400 text-center leading-relaxed`
  - 내용: "장보기를 완료하면\n요리할 메뉴가 표시돼요"
- **[장보기 하러 가기] 버튼**: `mt-2 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `cookReadyRecipes` | `CookReadyRecipe[]` | API 응답 | 요리 준비 레시피 목록 |
| `creatingSessionId` | `string \| null` | `null` | 세션 생성 중인 recipe_id |

```typescript
// CookReadyRecipe 타입 참고
interface CookReadyRecipe {
  recipe_id: string;
  title: string;
  thumbnail_url: string | null;
  meal_count: number;      // 대상 끼니 수
  total_servings: number;  // 합산 인분
  meal_ids: string[];      // POST /cooking/sessions에 전달
}
```

### 인터랙션

- **화면 진입** → `GET /cooking/ready` 호출 → `cookReadyRecipes` 세팅
- **[요리하기 ▶] 탭**:
  - `creatingSessionId = recipe_id` (해당 버튼 로딩 상태 전환)
  - `POST /cooking/sessions` 호출
    - body: `{ recipe_id, meal_ids: [...] }`
  - 성공 → `GET /cooking/sessions/{session_id}/cook-mode` → COOK_MODE 이동
    - 이동 시 `session_id`, `recipe_id` 파라미터 전달
  - 실패 → `creatingSessionId = null` → Toast("요리 세션 생성에 실패했어요")
- **[← 뒤로] 탭** → PLANNER_WEEK로 복귀
- **[장보기 하러 가기] 탭** (빈 상태) → SHOPPING_FLOW 이동

### ⚠️ 비즈니스 로직 주의사항

- **status='shopping_done' 필터**: `GET /cooking/ready`는 서버가 `status='shopping_done'` meals만 필터링하여 레시피별로 그룹핑해서 반환. 클라이언트 별도 필터 불필요.
- **동시 세션 방지**: `creatingSessionId !== null`인 동안 다른 [요리하기] 버튼 `pointer-events-none`. 한 번에 하나의 세션만 생성 가능.
- **세션 스냅샷**: `POST /cooking/sessions` 호출 시점에 서버가 `cooking_session_meals` 스냅샷 생성. 이후 플래너에서 해당 meal을 수정해도 진행 중 요리 세션에 영향 없음.

---

## 7. COOK_MODE — 요리모드

### 레이아웃

```
┌──────────────────────────────────────────┐  ← 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ✕ 취소    김치찌개    [요리 완료] │  │  ← Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  [   재료   ]  [  조리 단계  ]     │  │  ← TabBar
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│                                          │
│  [재료 탭 활성 시]                       │
│  ┌────────────────────────────────────┐  │
│  │  인분 조절:  [−][  4  ][+]        │  │  ← ServingStepper
│  │  (기준 인분에서 실시간 스케일링)    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  재료 목록                               │
│  ┌────────────────────────────────────┐  │
│  │  두부          300g                │  │  ← IngredientRow
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  양파          1/2개               │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  소금          적당히               │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [조리 단계 탭 활성 시]                  │
│  ┌────────────────────────────────────┐  │
│  │  1 / 5 단계                        │  │  ← 진행 상태 표시
│  │  ───────────────────               │  │  ← 프로그레스 바
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  [끓이기]                          │  │  ← 조리방법 배지
│  │                                    │  │
│  │  냄비에 물을 붓고 두부와 된장을     │  │  ← instruction
│  │  넣어 끓여주세요.                  │  │
│  │                                    │  │
│  │  📦 두부 300g · 된장 2큰술         │  │  ← 사용 재료
│  │  🔥🔥🔥  |  ⏱ 10분               │  │  ← 불세기 + 시간
│  └────────────────────────────────────┘  │
│  ← 이전    (● ○ ○ ○ ○)    다음 →      │  ← 스텝 네비게이션
│                                          │
│  (BottomTabBar 완전 숨김)               │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[✕ 취소] 버튼**: `flex items-center gap-1 text-sm text-gray-600 font-medium`
  - 아이콘: `w-4 h-4 X 아이콘`
- **제목**: `flex-1 text-center text-base font-bold text-gray-900 line-clamp-1`
- **[요리 완료] 버튼**: `px-3 py-1.5 bg-orange-500 text-white text-sm font-semibold rounded-lg`
  - 독립 요리(standalone) 동일 렌더링

#### TabBar

- **컨테이너**: `flex border-b border-gray-200 bg-white`
- **탭 아이템**: `flex-1 py-3 text-sm font-semibold text-center`
  - 활성: `text-gray-900 border-b-2 border-gray-900`
  - 비활성: `text-gray-400`

---

#### [재료 탭] 컴포넌트

##### 인분 조절 영역

- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-orange-50 border-b border-orange-100`
- **레이블**: `text-sm font-semibold text-orange-800`  →  `"인분 조절"`
- **ServingStepper**: 공통 컴포넌트 재사용

##### IngredientRow

- **컨테이너**: `flex items-center justify-between px-4 py-3 border-b border-gray-100`
- **재료명**: `text-sm font-medium text-gray-900`
- **수량 영역**: `flex items-center gap-1`
  - 정량 타입: `text-sm font-semibold text-gray-700`
    - 스케일링 예시: 기준 2인분 두부 150g → 4인분 선택 시 → `300g` (실시간 계산)
    - 변경된 수량 강조: `text-orange-600 font-bold` (기준 인분과 다를 때)
  - 적당히 타입: `text-sm text-gray-400 italic`  →  `"적당히"`

```
스케일링 계산식:
  표시 수량 = (원본 수량 / base_servings) × cooking_servings
  소수점 처리: 0.5 단위로 반올림, 1 미만은 분수 표기 (1/2, 1/3, 1/4)
```

---

#### [조리 단계 탭] 컴포넌트

##### 진행 상태 표시

- **컨테이너**: `px-4 py-2.5 bg-white border-b border-gray-100`
- **단계 텍스트**: `text-xs text-gray-500 mb-1.5`  →  `"1 / 5 단계"`
- **프로그레스 바**: `w-full h-1 bg-gray-200 rounded-full overflow-hidden`
  - 채움: `bg-orange-500 rounded-full transition-all duration-300`
  - 너비: `${(currentStep / totalSteps) * 100}%`

##### StepCard (스텝 카드)

```
┌──────────────────────────────────────────┐
│  [끓이기]                                │  ← 조리방법 배지
│                                          │
│  냄비에 물을 붓고 두부와 된장을 넣어     │  ← instruction
│  중불에서 10분간 끓여주세요.             │
│                                          │
│  📦 두부 300g · 된장 2큰술              │  ← 사용 재료 칩
│                                          │
│  🔥🔥🔥  ·  ⏱ 10분                    │  ← 불세기 + 시간
└──────────────────────────────────────────┘
```

- **카드 컨테이너**: `mx-4 my-3 p-5 bg-white rounded-2xl border border-gray-200 shadow-sm min-h-[280px] flex flex-col gap-4`
- **조리방법 배지**: `self-start text-xs font-bold px-3 py-1 rounded-full`

  | 조리방법 | 배경 | 텍스트 |
  |---------|------|--------|
  | 볶기 | `bg-orange-100` | `text-orange-700` |
  | 끓이기 | `bg-blue-100` | `text-blue-700` |
  | 썰기 | `bg-green-100` | `text-green-700` |
  | 굽기 | `bg-red-100` | `text-red-700` |
  | 찌기 | `bg-purple-100` | `text-purple-700` |
  | 삶기 | `bg-cyan-100` | `text-cyan-700` |
  | 무치기 | `bg-yellow-100` | `text-yellow-700` |
  | 기타/NEW | `bg-gray-100` | `text-gray-600` |
  | (new) 라벨 | 배지 옆에 `text-[10px] text-gray-400` `"(new)"` 표시 | |

- **instruction 텍스트**: `text-base text-gray-800 leading-relaxed flex-1`
- **사용 재료 영역**: `flex flex-wrap gap-1.5`
  - 재료 칩: `text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full`
  - 형식: `"두부 300g"`, `"된장 2큰술"`
- **불세기 + 시간 영역**: `flex items-center gap-3 text-sm text-gray-500`
  - 불세기: 🔥 개수로 표시 (1=약불, 2=중불, 3=강불, 0=불 사용 안 함 → 표시 안 함)
  - 시간: `"⏱ 10분"` (없으면 표시 안 함)

##### 스텝 네비게이션

- **컨테이너**: `fixed bottom-0 left-0 right-0 flex items-center justify-between px-4 py-4 bg-white border-t border-gray-100`
- **[← 이전] 버튼**: `flex items-center gap-1 text-sm font-semibold text-gray-600 px-4 py-2`
  - 첫 번째 스텝: `text-gray-300 pointer-events-none`
- **도트 인디케이터**: `flex items-center gap-1.5`
  - 현재 스텝 도트: `w-2 h-2 bg-gray-900 rounded-full`
  - 나머지 도트: `w-1.5 h-1.5 bg-gray-300 rounded-full`
  - 스텝 5개 초과 시: 도트 대신 `"1/8"` 텍스트 표시
- **[다음 →] 버튼**: `flex items-center gap-1 text-sm font-semibold text-gray-900 px-4 py-2`
  - 마지막 스텝: `text-gray-300 pointer-events-none`

---

#### DepletePopup — 소진 재료 체크 팝업

```
┌──────────────────────────────────────────┐
│  dim overlay bg-black/50                 │
│  ┌────────────────────────────────────┐  │
│  │  요리가 완료됐어요! 🎉              │  │  ← 제목
│  │  다 사용한 재료를 팬트리에서        │  │
│  │  제거해드릴게요                     │  │  ← 부제
│  │  ┌──────────────────────────────┐  │  │
│  │  │ [전체 선택 / 전체 해제]       │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  스크롤 목록                        │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ☑  두부   300g              │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ☑  양파   1/2개             │  │  │
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ □  소금   적당히             │  │  │  ← 적당히는 기본 미체크
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │    팬트리에서 제거하기        │  │  │  ← 주요 CTA
│  │  └──────────────────────────────┘  │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │    그냥 완료하기             │  │  │  ← 서브 CTA
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- **팝업 본체**: `bg-white rounded-t-2xl w-full px-4 pt-5 pb-8 max-h-[75vh] flex flex-col`
- **제목**: `text-base font-bold text-gray-900`
- **부제**: `text-xs text-gray-500 mt-0.5`
- **적당히 타입 재료**: 팬트리 소진 의미 없으므로 기본 미체크 + 연한 스타일 `text-gray-400`
- **[팬트리에서 제거하기] 버튼**: `w-full py-3.5 bg-orange-500 text-white text-base font-semibold rounded-xl mt-4`
- **[그냥 완료하기] 버튼**: `w-full py-3 bg-white text-gray-500 text-sm font-medium mt-2`

---

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `mode` | `'session' \| 'standalone'` | 라우트 파라미터 | 플래너 경유 여부 |
| `sessionId` | `string \| null` | 라우트 파라미터 | 요리 세션 ID (standalone은 null) |
| `recipeId` | `string` | 라우트 파라미터 | 레시피 ID |
| `cookModeData` | `CookModeData` | API 응답 | 재료 목록 + 조리 단계 전체 데이터 |
| `cookingServings` | `number` | `cookModeData.base_servings` | 현재 조리 인분 (스케일링 기준) |
| `activeTab` | `'ingredients' \| 'steps'` | `'ingredients'` | 현재 활성 탭 |
| `currentStepIndex` | `number` | `0` | 현재 조리 단계 인덱스 |
| `isDepletePopupOpen` | `boolean` | `false` | 소진 재료 팝업 표시 여부 |
| `depleteSelection` | `Set<string>` | 정량 재료 전체 | 팬트리 제거 선택 ingredient_id 집합 |
| `isCompleting` | `boolean` | `false` | 완료 API 호출 중 |

### 인터랙션

- **화면 진입**:
  - if `mode === 'session'` → `GET /cooking/sessions/{session_id}/cook-mode`
  - if `mode === 'standalone'` → `GET /recipes/{recipe_id}/cook-mode`
  - 응답 → `cookModeData` 세팅, `cookingServings = base_servings`
  - **BottomTabBar**: `hidden=true` 전달 (완전 숨김)
  - **화면 꺼짐 방지**: 사용자 설정 `screen_wake_lock=true`이면 `navigator.wakeLock.request('screen')` 호출

- **[재료] / [조리 단계] 탭 탭** → `activeTab` 전환

- **ServingStepper 변경 (재료 탭)** → `cookingServings` 즉시 업데이트 → 모든 재료 수량 실시간 재계산 (API 호출 없음, 클라이언트 계산)

- **스텝 카드 스와이프 좌** → `currentStepIndex + 1` (다음 단계)
- **스텝 카드 스와이프 우** → `currentStepIndex - 1` (이전 단계)
- **[← 이전] / [다음 →] 탭** → `currentStepIndex` 변경

- **[요리 완료] 탭** → `isDepletePopupOpen = true` → DepletePopup 표시
  - 팝업 초기값: `type='measured'`(정량) 재료 전체 선택, `type='to_taste'`(적당히) 전체 미선택

- **DepletePopup [팬트리에서 제거하기] 탭**:
  - if `mode === 'session'` → `POST /cooking/sessions/{session_id}/complete`
    - body: `{ depleted_ingredient_ids: [...depleteSelection] }`
  - if `mode === 'standalone'` → `POST /cooking/standalone-complete`
    - body: `{ recipe_id, depleted_ingredient_ids: [...depleteSelection] }`
  - 성공 → BottomTabBar `hidden=false` → LEFTOVERS 이동 (session 모드) 또는 RECIPE_DETAIL 이동 (standalone)
  - Toast("요리 완료! 수고하셨어요 👨‍🍳")

- **DepletePopup [그냥 완료하기] 탭**:
  - 동일 API 호출, body: `{ depleted_ingredient_ids: [] }`
  - 동일 이동 처리

- **[✕ 취소] 탭**:
  - ConfirmModal("요리를 취소할까요?", "진행 중인 요리 세션이 종료됩니다.", `destructive`)
  - 확인 탭:
    - if `mode === 'session'` → `POST /cooking/sessions/{session_id}/cancel`
    - if `mode === 'standalone'` → API 호출 없음
  - 완료 → BottomTabBar `hidden=false` → COOK_READY_LIST 이동 (session) 또는 RECIPE_DETAIL 이동 (standalone)

- **뒤로가기 하드웨어 버튼** → 취소 플로우와 동일 처리 (ConfirmModal 표시)

### ⚠️ 비즈니스 로직 주의사항

- **BottomTabBar 완전 숨김**: COOK_MODE 진입 시 `hidden=true`, 이탈(완료/취소) 시 `hidden=false`. 요리모드 중 탭바 노출 없음.
- **독립 요리(standalone) 분기**:
  - 진입 파라미터에 `session_id`가 없으면 `mode='standalone'`
  - `GET /recipes/{id}/cook-mode` 사용 (인증 불필요, 🔓)
  - 완료 시 `POST /cooking/standalone-complete` 사용
  - meals 상태 변경 없음 (플래너 연동 없음)
  - 완료/취소 후 RECIPE_DETAIL로 이동
- **실시간 스케일링**: 수량 계산은 클라이언트 전용. `표시 수량 = (원본 수량 / base_servings) × cookingServings`. 소수점 0.5 단위 반올림, 1 미만은 분수 표기(1/2, 1/4).
- **취소 시 meals 상태 변경 없음**: `POST /cooking/sessions/{id}/cancel`은 세션만 취소하며 `meals.status`는 `shopping_done` 유지. 다시 COOK_READY_LIST로 돌아가면 동일 레시피가 다시 표시됨.
- **화면 꺼짐 방지**: `navigator.wakeLock` API 사용. 화면 이탈 시(`visibilitychange` 이벤트) WakeLock 자동 해제 후 재진입 시 재요청. 미지원 브라우저에서는 무시.
- **멱등성**: 완료/취소 API는 멱등 보장. `isCompleting=true` 동안 중복 호출 차단.
- **조리방법 (new) 표시**: `cookModeData`의 step에서 `cooking_method.is_new === true`인 경우 배지 옆 `"(new)"` 라벨 표시. YT_IMPORT 추출 중 신규 생성된 조리방법임을 안내.
