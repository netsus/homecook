# 집밥 서비스 — 와이어프레임 세션 3

> 세션 1~2의 공통 컴포넌트(BottomTabBar, Toast, ConfirmModal, RecipeCard,
> ServingStepper, LoginRequiredModal)를 그대로 재사용한다.
> 모바일 기준: width 375px / Tailwind CSS 클래스명 기준

---

## 목차

- [8. HOME — 홈 (레시피 탐색)](#8-home)
- [9. INGREDIENT_FILTER_MODAL — 재료 필터 모달](#9-ingredient_filter_modal)
- [10. RECIPE_DETAIL — 레시피 상세](#10-recipe_detail)
- [11. LOGIN — 로그인](#11-login)

---

## 8. HOME

### 레이아웃

```
+------------------------------------------+  375px
|  STATUS BAR                              |
+------------------------------------------+
|  [집밥 로고]                             |  AppBar h-12
+------------------------------------------+
|  [검색바 (레시피를 검색해보세요)] [재료]  |  h-11
+------------------------------------------+
|  조회순  좋아요순  저장순  식단추가순     |  SortTabBar
|  ------                                  |  (sticky)
+------------------------------------------+
|  스크롤 영역                             |
|                                          |
|  -- 이번 주 인기 ---------------[더보기] |
|  +------------------------------------+  |
|  | [카드]  [카드]  [카드]  ...        |  |  횡스크롤
|  +------------------------------------+  |
|                                          |
|  -- 간단 한끼 ------------------[더보기] |
|  +------------------------------------+  |
|  | [카드]  [카드]  [카드]  ...        |  |  횡스크롤
|  +------------------------------------+  |
|                                          |
|  -- 전체 레시피 ----------------------   |
|  +----------------+  +----------------+ |
|  |  RecipeCard    |  |  RecipeCard    | |  2열 그리드
|  +----------------+  +----------------+ |
|  +----------------+  +----------------+ |
|  |  RecipeCard    |  |  RecipeCard    | |
|  +----------------+  +----------------+ |
|  ...                                     |
|  [스피너 / "모든 레시피를 불러왔어요"]   |
|                                          |
+------------------------------------------+
|  BottomTabBar (activeTab='home')         |
+------------------------------------------+
```

### 컴포넌트

#### AppBar

- **컨테이너**: `flex items-center px-4 h-12 bg-white border-b border-gray-100`
- **로고 텍스트**: `text-lg font-extrabold text-green-600`

#### SearchBar

- **컨테이너**: `flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100`
- **인풋 래퍼**: `flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 h-10`
  - 검색 아이콘: `w-4 h-4 text-gray-400 flex-shrink-0`
  - 인풋: `flex-1 text-sm bg-transparent outline-none placeholder-gray-400`
  - placeholder: "레시피를 검색해보세요"
  - 검색어 입력 시 우측 [X 초기화] 노출: `w-4 h-4 text-gray-400`
- **[재료 필터] 버튼**:
  - 미적용: `flex items-center gap-1 px-3 h-10 bg-gray-100 rounded-xl text-sm text-gray-600 font-medium flex-shrink-0`
  - 적용 중: `flex items-center gap-1 px-3 h-10 bg-green-600 rounded-xl text-sm text-white font-semibold flex-shrink-0`
    - 레이블: "재료 N" 형식으로 변경

#### SortTabBar

- **컨테이너**: `flex border-b border-gray-200 bg-white sticky top-0 z-20`
  - sticky 기준: AppBar + SearchBar 합계 높이(약 92px) 아래
- **탭 아이템**: `flex-1 py-2.5 text-xs font-semibold text-center`
  - 활성: `text-gray-900 border-b-2 border-gray-900`
  - 비활성: `text-gray-400`
- **탭 목록**: 조회순 / 좋아요순 / 저장순 / 식단추가순

#### ThemeSection

- **섹션 컨테이너**: `py-4`
- **헤더**: `flex items-center justify-between px-4 mb-3`
  - 제목: `text-base font-bold text-gray-900`
  - [더보기]: `text-xs text-gray-400 font-medium`
- **횡스크롤 래퍼**: `overflow-x-auto scrollbar-hide`
- **카드 트랙**: `flex gap-3 px-4`
  - 카드: `w-36 flex-shrink-0`
  - 썸네일: `w-full aspect-[4/3] rounded-xl object-cover bg-gray-100`
  - 제목: `text-xs font-semibold text-gray-900 line-clamp-2 mt-1.5 px-1`

#### RecipeGrid

- **헤더**: `px-4 py-3 text-base font-bold text-gray-900`
  - 기본 텍스트: "전체 레시피"
  - 검색 중: "'김치' 검색 결과 · 24개"
- **그리드**: `grid grid-cols-2 gap-3 px-4`
  - RecipeCard 공통 컴포넌트 재사용

#### InfiniteScrollLoader

- **컨테이너**: `flex justify-center py-6`
- 로딩 중: 스피너 `w-6 h-6 animate-spin text-green-600`
- 완료: `text-xs text-gray-400` → "모든 레시피를 불러왔어요"

#### 빈 검색 결과 상태

```
+------------------------------------------+
|                                          |
|            [검색 아이콘]                 |
|        검색 결과가 없어요                |
|  다른 키워드나 재료로 검색해보세요        |
|                                          |
+------------------------------------------+
```

- 아이콘: `text-4xl mb-2`
- 제목: `text-sm font-semibold text-gray-600`
- 설명: `text-xs text-gray-400 text-center mt-1`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `searchQuery` | `string` | `""` | 검색어 |
| `activeSort` | `'view' \| 'like' \| 'save' \| 'plan'` | `'view'` | 정렬 기준 |
| `selectedIngredients` | `Ingredient[]` | `[]` | 재료 필터 목록 |
| `themes` | `ThemeSection[]` | API 응답 | 테마 섹션 목록 |
| `recipes` | `Recipe[]` | API 응답 | 레시피 목록 |
| `nextCursor` | `string \| null` | `null` | 무한 스크롤 커서 |
| `isLoadingMore` | `boolean` | `false` | 추가 로딩 중 |
| `hasMore` | `boolean` | `true` | 추가 데이터 여부 |
| `isFilterModalOpen` | `boolean` | `false` | 재료 필터 모달 열림 |

### 인터랙션

- **화면 진입** → `GET /recipes/themes` + `GET /recipes?sort=view&limit=20` 동시 호출
- **검색어 입력** → 디바운스 400ms → `GET /recipes?q={query}&sort={activeSort}` → 목록 초기화 후 재조회, 테마 섹션 숨김
- **[X 초기화] 탭** → `searchQuery = ""` → 전체 목록 재조회, 테마 섹션 복원
- **[재료 필터] 탭** → `isFilterModalOpen = true` → INGREDIENT_FILTER_MODAL 표시
- **재료 필터 적용** → `selectedIngredients` 업데이트 → q + ingredients 동시 적용 재조회
- **정렬 탭 탭** → `activeSort` 변경 → `recipes = []`, `nextCursor = null` 초기화 → 재조회
- **스크롤 하단 도달** (Intersection Observer):
  - `hasMore && !isLoadingMore` → `GET /recipes?cursor={nextCursor}` → 기존 목록에 append
  - `!hasMore` → 종료 메시지
- **RecipeCard 탭** → RECIPE_DETAIL 이동
- **테마 [더보기] 탭** → 해당 테마 전체 목록 화면 이동

### ⚠️ 비즈니스 로직 주의사항

- **비로그인 탐색 허용**: `GET /recipes`, `GET /recipes/themes` 모두 인증 불필요(공개). 비로그인 자유 탐색 가능.
- **좋아요·저장 인터랙션**: 비로그인 탭 시 LoginRequiredModal (return-to-action 포함). 버튼 비활성화 금지, 탭 가능 상태 유지.
- **검색 + 재료 필터 동시 적용**: `q` + `ingredients` 파라미터 동시 전달, AND 조건은 서버 처리.
- **정렬 변경 시 완전 초기화**: `recipes = []`, `nextCursor = null` 초기화 필수.
- **테마 섹션 조건부 숨김**: `searchQuery !== ""` 또는 `selectedIngredients.length > 0` 시 숨김. 조건 해제 시 복원.
- **커서 기반 페이지네이션**: 응답의 `next_cursor` 값을 그대로 다음 요청에 사용.

---

## 9. INGREDIENT_FILTER_MODAL

### 레이아웃

```
+------------------------------------------+  375px
|  배경(HOME) dim 처리  bg-black/50        |
|                                          |
|  +--------------------------------------+|
|  |  ------  (드래그 핸들)               ||
|  |                                      ||
|  |  재료로 필터링              [X] 닫기 ||  시트 헤더
|  |                                      ||
|  |  +----------------------------------+||
|  |  | [검색아이콘]  재료명으로 검색     |||  재료 검색바
|  |  +----------------------------------+||
|  |                                      ||
|  |  전체  채소  육류  해산물  양념  기타 ||  카테고리 탭
|  |  ----                                ||
|  |                                      ||
|  |  스크롤 영역                         ||
|  |  +----------------------------------+||
|  |  |[양파] [두부] [파] [감자] [당근]  |||  재료 칩 그리드
|  |  |[버섯] [계란] [닭고기] [소고기]   |||
|  |  |...                               |||
|  |  +----------------------------------+||
|  |                                      ||
|  |  3개 선택됨                          ||  선택 카운트
|  |  +---------------+  +-------------+ ||
|  |  |  필터 초기화  |  |레시피 24개  | ||  하단 버튼
|  |  +---------------+  |  보기       | ||
|  |                      +-------------+ ||
|  +--------------------------------------+|
+------------------------------------------+
```

### 컴포넌트

#### BottomSheet 컨테이너

- **오버레이**: `fixed inset-0 bg-black/50 z-50`
  - 탭 → 모달 닫기 (변경사항 버림)
- **시트 본체**: `fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl flex flex-col max-h-[85vh]`
  - 드래그 핸들: `mx-auto w-10 h-1 bg-gray-300 rounded-full mt-3 mb-1 flex-shrink-0`
  - 아래로 드래그 → 모달 닫기

#### 시트 헤더

- **컨테이너**: `flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0`
- **제목**: `text-base font-bold text-gray-900`
- **[X] 닫기**: `w-8 h-8 flex items-center justify-center text-gray-500`

#### 재료 검색바

- **컨테이너**: `px-4 py-2 flex-shrink-0`
- **인풋 래퍼**: `flex items-center gap-2 bg-gray-100 rounded-xl px-3 h-10`
  - 아이콘: `w-4 h-4 text-gray-400`
  - 인풋: `flex-1 text-sm bg-transparent outline-none placeholder-gray-400`
  - placeholder: "재료명으로 검색"
- 입력 시 디바운스 300ms → `GET /ingredients?q={query}` → 칩 목록 갱신

#### 카테고리 탭

- **컨테이너**: `flex border-b border-gray-200 px-2 flex-shrink-0 overflow-x-auto scrollbar-hide`
- **탭 아이템**: `px-3 py-2.5 text-xs font-semibold whitespace-nowrap flex-shrink-0`
  - 활성: `text-gray-900 border-b-2 border-gray-900`
  - 비활성: `text-gray-400`
- **탭 목록**: 전체 / 채소 / 육류 / 해산물 / 양념 / 기타

#### 재료 칩 그리드

- **스크롤 래퍼**: `overflow-y-auto flex-1 px-4 py-3`
- **그리드**: `flex flex-wrap gap-2`
- **재료 칩**: `px-3 py-1.5 rounded-full text-sm border`
  - 미선택: `bg-white border-gray-200 text-gray-700`
  - 선택: `bg-green-600 border-green-600 text-white font-semibold`

#### 하단 버튼 영역

- **컨테이너**: `flex-shrink-0 px-4 pt-2 pb-6 border-t border-gray-100`
- **선택 카운트**: `text-xs text-gray-500 mb-2`
  - 없음: "재료를 선택하면 레시피를 필터링해요"
  - 있음: `"N개 선택됨"` → `text-green-600 font-semibold`
- **버튼 행**: `flex gap-2`
  - **[필터 초기화]**: `flex-1 py-3 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl`
    - 선택 없을 때: `opacity-40 pointer-events-none`
  - **[레시피 N개 보기]**: `flex-1 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl`
    - 조회 중: 스피너 표시

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `activeCategory` | `string` | `'전체'` | 활성 카테고리 탭 |
| `ingredientQuery` | `string` | `""` | 재료 검색어 |
| `ingredients` | `Ingredient[]` | API 응답 | 표시 재료 목록 |
| `tempSelected` | `Set<string>` | HOME의 selectedIngredients 복사 | 팝업 내 임시 선택 |
| `previewCount` | `number \| null` | `null` | 예상 레시피 수 |
| `isPreviewLoading` | `boolean` | `false` | 예상 수 조회 중 |

### 인터랙션

- **모달 진입** → `GET /ingredients?category=all` → 칩 렌더링. `tempSelected` = HOME의 `selectedIngredients` 복사
- **카테고리 탭** → `GET /ingredients?category={cat}` 재조회
- **재료 검색 입력** → 디바운스 300ms → `GET /ingredients?q={query}` → 목록 갱신
- **재료 칩 탭** → `tempSelected` 토글 → 디바운스 400ms → `GET /recipes?ingredients={...}&count_only=true` → `previewCount` 업데이트
- **[필터 초기화] 탭** → `tempSelected = new Set()` → `previewCount` 초기화
- **[레시피 N개 보기] 탭** → HOME의 `selectedIngredients` 업데이트 → 모달 닫기 → HOME 재조회
- **[X] / 오버레이 탭 / 아래 드래그** → 모달 닫기, `tempSelected` 변경 버림

### ⚠️ 비즈니스 로직 주의사항

- **임시 상태 분리**: `tempSelected`는 팝업 전용. [X]·오버레이 닫기 시 변경 버림. [레시피 N개 보기] 탭 시에만 HOME 상태에 반영.
- **예상 수 실시간 갱신**: 칩 탭마다 count_only API 호출 → 버튼 수치 업데이트. 조회 중 스피너.
- **비로그인 사용 가능**: `GET /ingredients` 및 count_only 모두 인증 불필요.
- **동의어 매칭**: 재료 검색 시 동의어 서버 처리. 클라이언트는 결과 그대로 렌더링.

---

## 10. RECIPE_DETAIL

### 레이아웃

```
+------------------------------------------+  375px
|  STATUS BAR                              |
+------------------------------------------+
|  [← 뒤로]  (floating, 미디어 위에 표시)  [공유]|
|  +--------------------------------------+ |
|  |                                      | |
|  |   유튜브 임베드 또는 썸네일 이미지    | |  aspect-video 16:9
|  |                                      | |
|  +--------------------------------------+ |
|                                          |
|  스크롤 영역                             |
|  +--------------------------------------+ |
|  |  레시피 제목 (text-xl font-bold)     | |
|  |  [한식] [국물] [초간단]              | |  태그 칩
|  |  눈 1,200  하트 340  책갈피 88       | |  메타 1행
|  |  달력 24   요리 18   기준 2인분      | |  메타 2행
|  +--------------------------------------+ |
|                                          |
|  +--------------------------------------+ |
|  |  [요리하기] [공유] [플래너+]         | |
|  |  [하트 좋아요]     [책갈피 저장]     | |  액션 버튼 5개
|  +--------------------------------------+ |
|                                          |
|  -- 재료 -------------------------------- |
|  두부              150g                  |  정량
|  된장              2큰술                 |
|  소금              적당히  (회색 기울임) |  적당히
|  청양고추          1개    [옵션]         |  옵션
|                                          |
|  -- 조리 단계 -------------------------- |
|  +--------------------------------------+ |
|  |  1  [썰기]                           | |  StepCard
|  |     두부를 적당한 크기로 썰어주세요   | |
|  |     재료: 두부 150g                  | |
|  +--------------------------------------+ |
|  +--------------------------------------+ |
|  |  2  [끓이기]                         | |
|  |     된장과 물을 넣고 끓여주세요       | |
|  |     재료: 된장 2큰술  불 2  시간 10분 | |
|  +--------------------------------------+ |
|                                          |
+------------------------------------------+
|  BottomTabBar (상위 화면 activeTab 기준) |
+------------------------------------------+
```

### 컴포넌트

#### Header (floating)

- **컨테이너**: `absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10`
  - 미디어 내: 투명 배경
  - 미디어 이탈 후: `bg-white border-b border-gray-100` (스크롤 감지)
- **뒤로가기 버튼**:
  - 미디어 위: `w-10 h-10 rounded-full bg-black/30 flex items-center justify-center text-white`
  - 이탈 후: `text-gray-700 bg-transparent`
- **[공유] 버튼**: 뒤로가기와 동일 스타일 전환

#### 미디어 영역

- **컨테이너**: `w-full aspect-video bg-black relative`
- `youtube_url != null` → 유튜브 iframe 임베드
- `youtube_url == null` → 썸네일 이미지 (`object-cover`)
- 둘 다 없음 → `bg-gray-200` + 기본 아이콘 플레이스홀더

#### 레시피 정보 영역

- **컨테이너**: `px-4 pt-4 pb-3 border-b border-gray-100`
- **제목**: `text-xl font-bold text-gray-900 leading-snug mb-2`
- **태그 칩**: `flex flex-wrap gap-1.5 mb-3`
  - 칩: `text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200`
- **메타 1행**: `flex items-center gap-3 text-xs text-gray-500 mb-1`
  - 조회수 / 좋아요수 / 저장수
- **메타 2행**: `flex items-center gap-3 text-xs text-gray-500`
  - 식단추가수 / 요리횟수 / 기준 인분

#### 액션 버튼 5개

- **컨테이너**: `flex items-center justify-around px-4 py-4 border-b border-gray-100`
- **버튼 구조**: `flex flex-col items-center gap-1`
  - 아이콘 원: `w-12 h-12 rounded-full flex items-center justify-center`
  - 레이블: `text-[11px] text-gray-600 font-medium`

| 순서 | 레이블 | 아이콘 원 배경 | 인증 |
|------|--------|--------------|------|
| 1 | 요리하기 | `bg-orange-100` | 공개 |
| 2 | 공유 | `bg-gray-100` | 공개 |
| 3 | 플래너 추가 | `bg-green-100` | 잠금 → LoginRequiredModal |
| 4 | 좋아요 | `bg-red-100`(활성) / `bg-gray-100` | 잠금 → 토글 |
| 5 | 저장 | `bg-blue-100`(활성) / `bg-gray-100` | 잠금 → 저장 팝업 |

- 좋아요 활성: `text-red-500 font-semibold`
- 저장 활성: `text-blue-500 font-semibold`

#### 재료 섹션

- **섹션 헤더**: `px-4 py-3 text-base font-bold text-gray-900`
- **재료 목록**: `divide-y divide-gray-100`
- **IngredientRow**: `flex items-center justify-between px-4 py-2.5`
  - 재료명:
    - 정량: `text-sm text-gray-900`
    - 적당히: `text-sm text-gray-400 italic`
  - 수량+단위: `text-sm text-gray-600`
  - [옵션] 배지: `text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full`

#### 조리 단계 섹션

- **섹션 헤더**: `px-4 py-3 text-base font-bold text-gray-900`
- **StepCard**: `mx-4 mb-3 p-4 bg-gray-50 rounded-2xl border border-gray-200`
  - 헤더: `flex items-center gap-2 mb-2`
    - 번호: `w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center`
    - 조리방법 배지: 세션 2 COOK_MODE 컬러 테이블 동일 적용
  - instruction: `text-sm text-gray-800 leading-relaxed mb-2`
  - 사용 재료 칩 (있을 때): `flex flex-wrap gap-1.5 mb-2`
    - 칩: `text-xs px-2 py-0.5 bg-white border border-gray-200 text-gray-600 rounded-full`
  - 부가 정보 (있을 때): `flex items-center gap-3 text-xs text-gray-400`
    - 불세기: 🔥 개수, 시간: "⏱ N분"

---

#### PlannerAddPopup — 플래너 추가 팝업

```
+------------------------------------------+
|  dim overlay  bg-black/50                |
|  +--------------------------------------+|
|  |  플래너에 추가하기                    ||
|  |                                      ||
|  |  날짜 선택                           ||
|  |  +----------------------------------+||
|  |  |  [<]   2025년 3월   [>]          |||  달력 헤더
|  |  |   일  월  화  수  목  금  토      |||
|  |  |        3   4   5   6   7   8     |||
|  |  |    9  10  11  12  13  14  15     |||
|  |  |   16  17  18  19  20  21  22     |||
|  |  +----------------------------------+||
|  |                                      ||
|  |  끼니 선택                           ||
|  |  +----------------------------------+||
|  |  |  아침                       [v]  |||  끼니 드롭다운
|  |  +----------------------------------+||
|  |                                      ||
|  |  인분                                ||
|  |  +----------------------------------+||
|  |  |          [-][ 2 ][+]             |||  ServingStepper
|  |  +----------------------------------+||
|  |                                      ||
|  |  +----------------------------------+||
|  |  |       플래너에 추가              |||  CTA 버튼
|  |  +----------------------------------+||
|  +--------------------------------------+|
+------------------------------------------+
```

- **시트**: `fixed inset-0 bg-black/50 z-50 flex items-end`
- **본체**: `bg-white rounded-t-2xl w-full px-4 pt-5 pb-8`
- **제목**: `text-base font-bold text-gray-900 mb-4`
- **레이블**: `text-sm font-semibold text-gray-700 mb-1.5`
- **달력 날짜 셀**:
  - 일반: `aspect-square flex items-center justify-center text-sm rounded-full`
  - 선택: `bg-green-600 text-white font-bold`
  - 오늘(미선택): `text-green-600 font-bold`
  - 과거: `text-gray-300 pointer-events-none`
- **끼니 드롭다운**: `w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white`
  - options: `GET /planner` columns 목록, 기본값 첫 번째 컬럼
- **ServingStepper**: 공통 컴포넌트, 기본값 = `recipe.base_servings`
- **[플래너에 추가] 버튼**:
  - 활성: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl mt-4`
  - 비활성(날짜 미선택): `w-full py-3.5 bg-gray-200 text-gray-400 rounded-xl mt-4 cursor-not-allowed`

---

#### SavePopup — 저장 팝업

```
+------------------------------------------+
|  dim overlay  bg-black/50                |
|  +--------------------------------------+|
|  |  레시피북에 저장하기                  ||
|  |                                      ||
|  |  +----------------------------------+||
|  |  | [○]  저장한 레시피               |||
|  |  +----------------------------------+||
|  |  +----------------------------------+||
|  |  | [○]  나의 레시피북1              |||
|  |  +----------------------------------+||
|  |  +----------------------------------+||
|  |  | [●]  나의 레시피북2   [저장됨]   |||  선택 + 기저장 배지
|  |  +----------------------------------+||
|  |                                      ||
|  |  [+]  새 레시피북 만들기             ||
|  |                                      ||
|  |  +----------------------------------+||
|  |  |          저장                    |||
|  |  +----------------------------------+||
|  +--------------------------------------+|
+------------------------------------------+
```

- **본체**: `bg-white rounded-t-2xl w-full px-4 pt-5 pb-8 max-h-[70vh] flex flex-col`
- **제목**: `text-base font-bold text-gray-900 mb-3 flex-shrink-0`
- **목록**: `overflow-y-auto flex-1`
  - 항목: `flex items-center gap-3 py-3 border-b border-gray-100`
    - 라디오 미선택: `w-5 h-5 rounded-full border-2 border-gray-300`
    - 라디오 선택: `w-5 h-5 rounded-full border-2 border-green-600 bg-green-600`
    - 이름: `text-sm text-gray-900`
    - [저장됨] 배지: `text-[10px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full`
- **[+ 새 레시피북 만들기]**: `flex items-center gap-2 py-3 text-sm text-green-600 font-semibold`
  - 탭 → 인라인 인풋 노출 → 입력 → `POST /recipe-books`
- **[저장] 버튼**:
  - 선택 있음: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl mt-3`
  - 선택 없음: `w-full py-3.5 bg-gray-200 text-gray-400 rounded-xl mt-3 cursor-not-allowed`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `recipe` | `RecipeDetail` | API 응답 | 레시피 전체 데이터 |
| `isHeaderSolid` | `boolean` | `false` | 헤더 배경 전환 여부 |
| `isPlannerPopupOpen` | `boolean` | `false` | 플래너 팝업 열림 |
| `isSavePopupOpen` | `boolean` | `false` | 저장 팝업 열림 |
| `plannerDate` | `string \| null` | `null` | 선택 날짜 |
| `plannerColumnId` | `string \| null` | `null` | 선택 끼니 ID |
| `plannerServings` | `number` | `recipe.base_servings` | 플래너 인분 |
| `selectedBookId` | `string \| null` | `null` | 선택 레시피북 ID |
| `recipeBooks` | `RecipeBook[]` | API 응답 | 저장 가능 레시피북 |
| `isLiked` | `boolean` | `recipe.user_status?.is_liked` | 좋아요 상태 |
| `isSaved` | `boolean` | `recipe.user_status?.is_saved` | 저장 상태 |

### 인터랙션

- **화면 진입** → `GET /recipes/{id}` → `recipe` 세팅. `user_status == null`(비로그인) → `isLiked = false`, `isSaved = false`
- **스크롤** → Intersection Observer로 미디어 이탈 감지 → `isHeaderSolid` 전환
- **[요리하기] 탭** → COOK_MODE (`mode='standalone'`, `recipe_id`)
- **[공유] 탭** → 네이티브 공유 시트
- **[플래너 추가] 탭**:
  - 로그인 → `GET /planner` → `isPlannerPopupOpen = true`
  - 비로그인 → LoginRequiredModal (`returnToAction: 'planner_add'`)
- **[좋아요] 탭**:
  - 로그인 → `POST /recipes/{id}/like` → 낙관적 `isLiked` 토글, `like_count` ±1 즉시 반영 → 실패 시 롤백
  - 비로그인 → LoginRequiredModal
- **[저장] 탭**:
  - 로그인 → `GET /recipe-books?type=saved,custom` → `isSavePopupOpen = true`
  - 비로그인 → LoginRequiredModal
- **PlannerAddPopup [플래너에 추가] 탭**:
  - `POST /meals` → 성공 → 팝업 닫기 → Toast("플래너에 추가됐어요")
- **SavePopup [저장] 탭**:
  - `POST /recipes/{id}/save` → 성공 → 팝업 닫기 → Toast("저장됐어요")

### ⚠️ 비즈니스 로직 주의사항

- **비로그인 UX**: 잠금 버튼을 비활성화하지 않음. 탭 시점에 LoginRequiredModal 표시.
- **저장 팝업 필터**: `book_type === 'my_added'` 또는 `'liked'` 제외. `saved`, `custom`만 노출.
- **좋아요 낙관적 업데이트**: API 전 즉시 상태 반영. 실패 시 롤백 + Toast.
- **미디어 조건부 렌더링**: `youtube_url` 우선 임베드. 없으면 썸네일. 둘 다 없으면 플레이스홀더.
- **달력 과거 날짜 차단**: `pointer-events-none text-gray-300` 처리.
- **return-to-action 자동 실행**: 로그인 후 `returnToAction` 파라미터에 따라 팝업 즉시 오픈. 1회 소비 후 제거.

---

## 11. LOGIN

### 레이아웃

#### Step 1 — 소셜 로그인

```
+------------------------------------------+  375px
|  STATUS BAR                              |
+------------------------------------------+
|                                          |
|                                          |
|             +------------+              |
|             |  🍳  집밥  |              |  서비스 로고
|             +------------+              |
|                                          |
|       집밥하는 모든 과정을 함께           |  슬로건
|                                          |
|                                          |
|  +--------------------------------------+|
|  |  [아이콘]   카카오로 시작하기         ||  카카오 (bg-yellow-400)
|  +--------------------------------------+|
|                                          |
|  +--------------------------------------+|
|  |  [아이콘]   네이버로 시작하기         ||  네이버 (bg-green-500)
|  +--------------------------------------+|
|                                          |
|  +--------------------------------------+|
|  |  [아이콘]   Google로 시작하기         ||  구글 (bg-white, 테두리)
|  +--------------------------------------+|
|                                          |
|                                          |
|        이용약관   ·   개인정보처리방침   |  하단 링크
|                                          |
+------------------------------------------+
```

#### Step 2 — 닉네임 설정 (is_new_user=true 시)

```
+------------------------------------------+  375px
|  STATUS BAR                              |
+------------------------------------------+
|                                          |
|                                          |
|                   🎉                     |
|                                          |
|         어떻게 불러드릴까요?             |  타이틀
|     집밥에서 사용할 닉네임을 설정해요    |  서브타이틀
|                                          |
|  +--------------------------------------+|
|  |  닉네임 입력                   0/30  ||  인풋 + 글자수
|  +--------------------------------------+|
|  2자 이상 입력해주세요                   |  유효성 메시지
|                                          |
|                                          |
|  +--------------------------------------+|
|  |             시작하기                 ||  CTA 버튼
|  +--------------------------------------+|
|                                          |
+------------------------------------------+
```

### 컴포넌트

#### [Step 1] 로고 + 슬로건

- **컨테이너**: `flex flex-col items-center justify-center flex-1 gap-3 px-8 pt-16 pb-8`
- **로고**: `text-3xl font-extrabold text-green-600`
- **슬로건**: `text-sm text-gray-500 text-center`

#### [Step 1] 소셜 버튼 영역

- **컨테이너**: `flex flex-col gap-3 px-6 w-full`
- **버튼 공통**: `w-full h-13 rounded-xl flex items-center justify-center gap-3 text-sm font-semibold shadow-sm`

| 버튼 | 배경 | 텍스트 색 | 테두리 |
|------|------|----------|--------|
| 카카오 | `bg-yellow-400` | `text-gray-900` | 없음 |
| 네이버 | `bg-green-500` | `text-white` | 없음 |
| 구글 | `bg-white` | `text-gray-700` | `border border-gray-300` |

- **아이콘**: `w-5 h-5 flex-shrink-0`
- **로딩 중**: 해당 버튼에 스피너, 나머지 `opacity-60 pointer-events-none`

#### [Step 1] 하단 링크

- **컨테이너**: `flex items-center justify-center gap-3 pb-8 text-xs text-gray-400`
- 링크: `underline cursor-pointer`
- 구분: "·"

---

#### [Step 2] 닉네임 설정

- **컨테이너**: `flex flex-col items-center px-6 pt-20 gap-4`
- **이모지**: `text-5xl mb-2`
- **타이틀**: `text-2xl font-bold text-gray-900 text-center`
- **서브타이틀**: `text-sm text-gray-500 text-center`
- **인풋**: `w-full h-13 px-4 border-2 rounded-xl text-sm outline-none`
  - 기본: `border-gray-200 focus:border-green-500`
  - 에러: `border-red-400`
- **글자수 표시**: `absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400`
  - 30자 도달: `text-orange-500`
- **유효성 메시지**: `text-xs mt-1.5 ml-1`
  - 에러: `text-red-500` → "2자 이상 입력해주세요"
  - 정상: `text-green-600` → "좋은 닉네임이에요!" (선택적)
- **[시작하기] 버튼**:
  - 활성(2자 이상): `w-full h-13 bg-green-600 text-white text-base font-semibold rounded-xl mt-4`
  - 비활성: `w-full h-13 bg-gray-200 text-gray-400 rounded-xl mt-4 cursor-not-allowed`

### 상태(State)

#### Step 1

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `isLoading` | `boolean` | `false` | 소셜 로그인 처리 중 |
| `loadingProvider` | `'kakao' \| 'naver' \| 'google' \| null` | `null` | 로딩 중 provider |

#### Step 2

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `nickname` | `string` | `""` | 입력 닉네임 |
| `isValid` | `boolean` | `false` | 유효 여부 (2~30자) |
| `isSaving` | `boolean` | `false` | 저장 API 로딩 중 |
| `returnToAction` | `string \| null` | URL 파라미터 | 로그인 후 복귀 액션 |

### 인터랙션

#### Step 1

- **소셜 버튼 탭**:
  - `loadingProvider` 세팅, `isLoading = true`
  - OAuth 리다이렉트 → `POST /auth/login`
  - `is_new_user === true` → Step 2 전환
  - `is_new_user === false` → `returnToAction` 확인
    - 있음: 해당 화면+액션 이동
    - 없음: HOME 이동
- **로딩 중 다른 버튼**: `pointer-events-none opacity-60`

#### Step 2

- **인풋 입력** → `nickname` 업데이트 → `isValid = nickname.length >= 2`
  - 30자 초과 차단 (maxLength=30)
- **[시작하기] 탭**:
  - `!isValid` → 동작 없음
  - `isValid` → `PATCH /auth/profile` body: `{ nickname }`
  - 성공 → `returnToAction` 확인 후 이동
  - 실패 → Toast("닉네임 설정에 실패했어요. 다시 시도해주세요")

### ⚠️ 비즈니스 로직 주의사항

- **신규 회원 자동 초기화**: `PATCH /auth/profile` 성공 시 서버가 끼니 컬럼 3개(아침/점심/저녁) + 레시피북 3개(my_added/saved/liked) 자동 생성. 클라이언트 별도 API 불필요.
- **return-to-action 체이닝**: LoginRequiredModal → LOGIN 이동 시 URL에 파라미터 포함. Step 1(기존 회원) 또는 Step 2(신규 회원) 완료 시 확인 후 자동 실행. 1회 소비 후 제거.
- **소셜 로그인 중복 방지**: `isLoading === true` 동안 모든 버튼 `pointer-events-none`.
- **닉네임 유효성**: 2자 미만 → 버튼 비활성 + 에러 메시지. 30자 초과 → maxLength 차단. 특수문자 등 서버 규칙 위반 → 422 수신 시 Toast 안내.
- **기존 회원 Step 2 스킵**: `is_new_user === false` 시 닉네임 설정 화면 표시 절대 금지.
- **이용약관 링크**: 외부 URL. 앱 내 웹뷰 또는 새 탭 오픈.
