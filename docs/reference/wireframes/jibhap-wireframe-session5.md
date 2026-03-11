# 집밥 서비스 — 와이어프레임 세션 5

> 세션 1~4의 공통 컴포넌트(BottomTabBar, Toast, ConfirmModal, RecipeCard, ServingStepper, LoginRequiredModal)를 그대로 재사용한다.
> 모바일 기준: width 375px / Tailwind CSS 클래스명 기준

---

## 목차

- [16. YT_IMPORT — 유튜브 레시피 등록](#16-yt_import--유튜브-레시피-등록)
- [17. MANUAL_RECIPE_CREATE — 직접 레시피 등록](#17-manual_recipe_create--직접-레시피-등록)
- [18. MYPAGE — 마이페이지](#18-mypage--마이페이지)
- [19. RECIPEBOOK_DETAIL — 레시피북 상세](#19-recipebook_detail--레시피북-상세)
- [20. SETTINGS — 설정](#20-settings--설정)

---

## 16. YT_IMPORT — 유튜브 레시피 등록

### 상태 전이 다이어그램

```
┌──────────────────────────────────────────────────────────┐
│                    YT_IMPORT 상태 전이                    │
└──────────────────────────────────────────────────────────┘

  STEP_1 (URL 입력)
    │
    │  [확인] 탭
    ▼
  [검증 중 로딩]  <-- POST /recipes/youtube/validate
    │
    ├── is_recipe_video=true ──────────────────────┐
    │                                              │
    └── is_recipe_video=false                      │
          │                                        │
          ▼                                        │
        STEP_1_5 (레시피 아님 경고)                 │
          │                                        │
          ├── [다른 링크 입력하기] --> STEP_1 복귀  │
          │                                        │
          └── [그래도 등록하기] ───────────────────┤
                                                   │
                                                   ▼
                                         STEP_2 (AI 추출 중)
                                           <-- POST /recipes/youtube/extract
                                                   │
                                                   │  추출 완료
                                                   ▼
                                         STEP_3 (검수 화면)
                                                   │
                                                   │  [등록하기]
                                                   │  <-- POST /recipes/youtube/register
                                                   ▼
                                         STEP_4 (등록 완료)
```

---

### STEP_1 — URL 입력

#### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   유튜브로 레시피 추가          │  │  <- Header h-14
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  진행 단계: ●○○○                  │  │  <- StepIndicator
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
│          📺                              │  <- 아이콘
│   유튜브 링크를 붙여넣어 주세요           │  <- 타이틀
│   레시피를 자동으로 추출해드릴게요        │  <- 서브타이틀
│                                          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  https://youtube.com/...           │  │  <- URL 인풋
│  └────────────────────────────────────┘  │
│  유튜브 URL 형식이 올바르지 않아요        │  <- 에러 메시지 (조건부)
│                                          │
│  ┌────────────────────────────────────┐  │
│  │              확인                  │  │  <- CTA 버튼
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

#### 컴포넌트

**StepIndicator**:
- **컨테이너**: `flex items-center justify-center gap-2 py-3`
- **도트**: `w-2.5 h-2.5 rounded-full`
  - 현재 스텝: `bg-green-600`
  - 완료 스텝: `bg-green-300`
  - 미완료 스텝: `bg-gray-200`

**URL 인풋 영역**:
- **컨테이너**: `px-6`
- **인풋**: `w-full h-12 px-4 border-2 rounded-xl text-sm text-gray-900 outline-none`
  - 기본: `border-gray-200 focus:border-green-500`
  - 유효하지 않은 URL 입력 후: `border-red-400`
  - 유효한 URL: `border-green-500`
- **에러 메시지**: `text-xs text-red-500 mt-1.5 ml-1`
  - 조건: URL 입력 후 blur 시 유효성 체크, 유튜브 URL 패턴 불일치 시 표시
  - 유효 패턴: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`

**[확인] 버튼**:
- 활성(유효한 URL): `w-full h-12 bg-green-600 text-white text-base font-semibold rounded-xl`
- 비활성(비어있음 또는 유효하지 않음): `w-full h-12 bg-gray-200 text-gray-400 text-base font-semibold rounded-xl cursor-not-allowed`
- 로딩 중: 버튼 내 스피너 + `"확인 중..."` + `pointer-events-none`

---

### STEP_1_5 — 레시피 아님 판정 경고

#### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   유튜브로 레시피 추가          │  │  <- Header h-14
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  진행 단계: ●○○○                  │  │  <- StepIndicator
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │      [썸네일 이미지]          │  │  │  <- 영상 미리보기
│  │  └──────────────────────────────┘  │  │
│  │  영상 제목 (line-clamp-2)          │  │
│  └────────────────────────────────────┘  │
│                                          │
│       ⚠️                                 │  <- 경고 아이콘
│  레시피 영상이 아닐 수 있어요             │  <- 경고 타이틀
│  요리 관련 내용이 포함되지 않은          │
│  영상으로 판단됐어요.                    │  <- 경고 설명
│  그래도 등록하면 내용이 부정확할 수 있어요│
│                                          │
│  ┌────────────────────────────────────┐  │
│  │       그래도 등록하기              │  │  <- 주요 CTA
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │       다른 링크 입력하기           │  │  <- 서브 CTA
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

#### 컴포넌트

**영상 미리보기 카드**:
- **컨테이너**: `mx-6 rounded-2xl overflow-hidden border border-gray-200 bg-white`
- **썸네일**: `w-full aspect-video object-cover bg-gray-100`
- **영상 제목**: `px-3 py-2.5 text-sm font-semibold text-gray-900 line-clamp-2`

**경고 영역**:
- **컨테이너**: `flex flex-col items-center text-center px-6 py-4 gap-2`
- **경고 아이콘**: `text-4xl` → ⚠️
- **경고 타이틀**: `text-base font-bold text-orange-600`
- **경고 설명**: `text-sm text-gray-500 leading-relaxed`

**[그래도 등록하기] 버튼**: `w-full h-12 mx-6 bg-orange-500 text-white text-base font-semibold rounded-xl`
**[다른 링크 입력하기] 버튼**: `w-full h-12 mx-6 bg-gray-100 text-gray-600 text-base font-semibold rounded-xl mt-2`

---

### STEP_2 — AI 추출 중

#### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   유튜브로 레시피 추가          │  │  <- Header h-14 (뒤로가기 비활성)
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  진행 단계: ●●○○                  │  │  <- StepIndicator
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  (로딩 애니메이션 — 회전 or 파동)  │  │  <- 로딩 인디케이터
│  └────────────────────────────────────┘  │
│                                          │
│  재료를 분석하고 있어요...               │  <- 진행 상태 텍스트 (순환)
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  extraction_methods 진행 현황      │  │
│  │                                    │  │
│  │  ⏳ 영상 설명 분석 중 (description)│  │  <- 진행 중
│  │  ✅ 자막 인식 완료 (ocr)           │  │  <- 완료
│  │  ⏳ 음성 인식 중 (asr)             │  │  <- 진행 중
│  │  ○  AI 추정 대기 (estimation)      │  │  <- 대기
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

#### 컴포넌트

**로딩 인디케이터**:
- **컨테이너**: `flex justify-center py-8`
- **애니메이션**: `w-16 h-16 rounded-full border-4 border-gray-200 border-t-green-600 animate-spin`

**진행 상태 텍스트**:
- **스타일**: `text-base font-semibold text-gray-700 text-center`
- **순환 텍스트 목록** (2초마다 전환):
  1. `"재료를 분석하고 있어요..."`
  2. `"조리 단계를 정리하고 있어요..."`
  3. `"레시피를 완성하고 있어요..."`

**ExtractionMethodRow**:
- **컨테이너**: `mx-6 bg-gray-50 rounded-2xl px-4 py-3 flex flex-col gap-2`
- **각 행**: `flex items-center gap-3`
  - 상태 아이콘:
    - 대기: `w-5 h-5 rounded-full border-2 border-gray-300` (빈 원)
    - 진행 중: `w-5 h-5 animate-spin text-green-500` (스피너)
    - 완료: `w-5 h-5 text-green-600` ✅
  - 텍스트: `text-sm text-gray-600`
    - `description` → `"영상 설명 분석 중"`
    - `ocr` → `"자막 인식 중"`
    - `asr` → `"음성 인식 중"`
    - `estimation` → `"AI 추정 중"`
  - 완료 텍스트: `text-sm text-green-600 font-medium` → `"완료"`

**STEP_2 뒤로가기**: 추출 진행 중에는 Header 뒤로가기 버튼 `opacity-30 pointer-events-none`

---

### STEP_3 — 검수 화면

#### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   내용을 확인해주세요           │  │  <- Header h-14
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  진행 단계: ●●●○                  │  │  <- StepIndicator
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  [썸네일]  영상 제목 (line-clamp-2)│  │  <- 영상 미리보기 (소형)
│  └────────────────────────────────────┘  │
│                                          │
│  레시피 제목 ───────────────────────    │  <- 섹션
│  ┌────────────────────────────────────┐  │
│  │  된장찌개                          │  │  <- 제목 인풋
│  └────────────────────────────────────┘  │
│                                          │
│  기본 인분 ─────────────────────────    │
│  ┌────────────────────────────────────┐  │
│  │           [−][  2  ][+]           │  │  <- ServingStepper
│  └────────────────────────────────────┘  │
│                                          │
│  재료 ──────────────────────  [+ 추가]  │  <- 재료 섹션
│  ┌────────────────────────────────────┐  │
│  │  ≡  두부    150  g    [X]          │  │  <- IngredientEditRow
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ≡  된장    2    큰술  [X]          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  조리 단계 ──────────────────  [+ 추가] │  <- 조리 단계 섹션
│  ┌────────────────────────────────────┐  │
│  │  ≡  [썰기▼]  두부를 썰어주세요   [X]│  │  <- StepEditRow
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ≡  [끓이기(new)▼]  끓여주세요   [X]│  │  <- (new) 라벨 포함
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │            등록하기                │  │  <- 하단 고정 CTA
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### 컴포넌트

**영상 미리보기 (소형)**:
- **컨테이너**: `flex items-center gap-3 mx-4 p-3 bg-gray-50 rounded-xl border border-gray-200`
- **썸네일**: `w-16 h-12 rounded-lg object-cover bg-gray-200 flex-shrink-0`
- **영상 제목**: `flex-1 text-xs font-semibold text-gray-700 line-clamp-2`

**섹션 헤더**:
- **컨테이너**: `flex items-center justify-between px-4 py-2 mt-4`
- **섹션명**: `text-sm font-bold text-gray-700`
- **[+ 추가] 버튼**: `text-sm text-green-600 font-semibold`

**제목 인풋**:
- **스타일**: `mx-4 h-12 px-4 border-2 border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-green-500 w-[calc(100%-2rem)]`

**IngredientEditRow (재료 편집 행)**:

```
┌──────────────────────────────────────────┐
│  ≡   [재료명 인풋]  [수량]  [단위]  [X]  │
│  핸들   flex-1      w-14    w-16   w-7   │
└──────────────────────────────────────────┘
```

- **행 컨테이너**: `flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-100`
- **드래그 핸들**: `w-5 h-5 text-gray-300 flex-shrink-0 cursor-grab` → `≡`
- **재료명 인풋**: `flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-green-400`
- **수량 인풋**: `w-14 h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center outline-none focus:border-green-400`
- **단위 인풋**: `w-16 h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center outline-none focus:border-green-400`
- **[X] 삭제**: `w-7 h-7 flex items-center justify-center text-gray-400 flex-shrink-0`

**StepEditRow (조리 단계 편집 행)**:

```
┌──────────────────────────────────────────┐
│  ≡   [조리방법▼]                    [X]  │
│       [instruction 텍스트 인풋]          │
└──────────────────────────────────────────┘
```

- **행 컨테이너**: `flex flex-col gap-2 px-4 py-3 bg-white border-b border-gray-100`
- **상단 행**: `flex items-center gap-2`
  - 드래그 핸들: `w-5 h-5 text-gray-300 flex-shrink-0 cursor-grab`
  - **조리방법 드롭다운**: `flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none`
    - `(new)` 라벨: 드롭다운 옵션 텍스트에 `" (new)"` 접미사 표시
    - 선택된 값이 `(new)` 항목이면 드롭다운 우측에 `text-[10px] text-orange-500 font-semibold` → `"NEW"` 배지
  - [X] 삭제: `w-7 h-7 flex items-center justify-center text-gray-400 flex-shrink-0`
- **instruction 인풋**: `w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-green-400 resize-none`

**[등록하기] 하단 고정 버튼**:
- **컨테이너**: `fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200`
- **버튼**: `w-full py-3.5 bg-green-600 text-white text-base font-semibold rounded-xl`
  - 로딩 중: 스피너 + `"등록 중..."` + `pointer-events-none`

---

### STEP_4 — 등록 완료

#### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │        유튜브로 레시피 추가         │  │  <- Header (뒤로가기 없음)
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  진행 단계: ●●●●                  │  │  <- StepIndicator (전체 완료)
│  └────────────────────────────────────┘  │
│                                          │
│                                          │
│           🎉                             │  <- 성공 아이콘
│    레시피가 등록됐어요!                   │  <- 성공 타이틀
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  RecipeCard (등록된 레시피 미리보기)│  │  <- 레시피 카드 미리보기
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │         레시피 보기                │  │  <- 주요 CTA
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │         플래너에 추가              │  │  <- 서브 CTA
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

#### 컴포넌트

**성공 영역**:
- **컨테이너**: `flex flex-col items-center py-8 gap-2`
- **아이콘**: `text-5xl` → 🎉
- **타이틀**: `text-xl font-bold text-gray-900`

**레시피 카드**: RecipeCard 공통 컴포넌트 재사용 (가로 전체 너비 단일 카드)

**[레시피 보기] 버튼**: `w-full h-12 bg-green-600 text-white text-base font-semibold rounded-xl mx-6`
**[플래너에 추가] 버튼**: `w-full h-12 bg-green-50 border border-green-300 text-green-700 text-base font-semibold rounded-xl mx-6 mt-2`
- 탭 → PlannerAddPopup (세션 3 RECIPE_DETAIL과 동일 컴포넌트 재사용)

---

### 상태(State) — YT_IMPORT 전체

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `step` | `1 \| 1.5 \| 2 \| 3 \| 4` | `1` | 현재 스텝 |
| `urlInput` | `string` | `""` | URL 인풋 값 |
| `isUrlValid` | `boolean` | `false` | URL 형식 유효 여부 |
| `isValidating` | `boolean` | `false` | validate API 호출 중 |
| `videoPreview` | `VideoPreview \| null` | `null` | 영상 제목/썸네일 (STEP_1_5용) |
| `isExtracting` | `boolean` | `false` | extract API 호출 중 |
| `extractionStatus` | `ExtractionStatus` | 초기값 대기 | 각 method별 상태 |
| `extractedData` | `ExtractedRecipe \| null` | `null` | STEP_3 폼 초기 데이터 |
| `editTitle` | `string` | `""` | STEP_3 제목 편집값 |
| `editServings` | `number` | `2` | STEP_3 인분 편집값 |
| `editIngredients` | `EditIngredient[]` | `[]` | STEP_3 재료 편집 목록 |
| `editSteps` | `EditStep[]` | `[]` | STEP_3 조리 단계 편집 목록 |
| `isRegistering` | `boolean` | `false` | register API 호출 중 |
| `registeredRecipe` | `Recipe \| null` | `null` | STEP_4 등록 완료 레시피 |

### 인터랙션

- **[확인] 탭 (STEP_1)**:
  - `isValidating = true`
  - `POST /recipes/youtube/validate` body: `{ url: urlInput }`
  - if `is_recipe_video=true` → `step = 2` → 즉시 `POST /recipes/youtube/extract` 호출
  - if `is_recipe_video=false` → `videoPreview` 세팅 → `step = 1.5`
- **[그래도 등록하기] 탭 (STEP_1_5)** → `step = 2` → `POST /recipes/youtube/extract` 호출
- **[다른 링크 입력하기] 탭 (STEP_1_5)** → `step = 1`, `urlInput = ""` 초기화
- **STEP_2 추출 완료** → `extractedData` 세팅 → STEP_3 폼 초기화 → `step = 3`
- **STEP_3 [+ 재료 추가] 탭** → `editIngredients`에 빈 행 추가
- **STEP_3 [+ 스텝 추가] 탭** → `editSteps`에 빈 행 추가
- **STEP_3 재료/스텝 행 드래그** → 순서 변경 (로컬 배열 reorder, API 미호출)
- **STEP_3 [등록하기] 탭**:
  - `isRegistering = true`
  - `POST /recipes/youtube/register` body: `{ url, title: editTitle, base_servings: editServings, ingredients: editIngredients, steps: editSteps }`
  - 성공 → `registeredRecipe` 세팅 → `step = 4`
  - 실패 → Toast("등록에 실패했어요. 다시 시도해주세요")
- **STEP_4 [레시피 보기] 탭** → RECIPE_DETAIL 이동 (`registeredRecipe.id`)
- **STEP_4 [플래너에 추가] 탭** → PlannerAddPopup 오픈
- **Header [← 뒤로가기] 탭 (STEP_3)** → ConfirmModal("작성 중인 내용이 사라져요", "뒤로 가면 입력한 내용이 모두 사라져요.", `destructive`) → 확인 → 이전 화면 복귀
- **Header [← 뒤로가기] 탭 (STEP_2)** → `pointer-events-none` (추출 중 이탈 불가)

### ⚠️ 비즈니스 로직 주의사항

- **extraction_methods 신뢰도 안내**: STEP_2에서 각 method 완료 여부를 실시간 표시. 사용자가 STEP_3 검수 필요성을 인지하도록 유도. 서버 응답에 포함된 `extraction_methods` 배열 기준으로 렌더링.
- **(new) 조리방법**: STEP_3의 조리방법 드롭다운에서 `is_new=true`인 항목은 텍스트에 `" (new)"` 접미사 표시. AI 추출 중 신규 생성된 조리방법임을 안내.
- **STEP_3 뒤로가기 보호**: `step === 3`일 때 뒤로가기(Header 버튼 + 하드웨어 뒤로가기) 시 ConfirmModal 표시. 확인 시에만 이탈.
- **STEP_4 뒤로가기 차단**: 등록 완료 후 뒤로가기로 STEP_3 재진입 불가. Header 뒤로가기 버튼 숨김, 하드웨어 뒤로가기 무시.
- **STEP_2 이탈 불가**: 추출 API 호출 중 뒤로가기 차단. 추출 완료 또는 실패 후에만 이탈 가능. 실패 시 Toast + STEP_1으로 복귀.

---

## 17. MANUAL_RECIPE_CREATE — 직접 레시피 등록

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   레시피 직접 등록       [저장] │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  레시피 제목 ───────────────────────    │  <- 제목 섹션
│  ┌────────────────────────────────────┐  │
│  │  레시피 이름을 입력해주세요         │  │  <- 제목 인풋 (필수)
│  └────────────────────────────────────┘  │
│                                          │
│  기본 인분 ─────────────────────────    │  <- 인분 섹션
│  ┌────────────────────────────────────┐  │
│  │           [−][  2  ][+]           │  │  <- ServingStepper
│  └────────────────────────────────────┘  │
│                                          │
│  재료 ──────────────────────  [+ 추가]  │  <- 재료 섹션 헤더
│  ┌────────────────────────────────────┐  │
│  │  ≡  [재료 검색 또는 입력]  [수량]  │  │
│  │     [단위▼]  [타입▼]         [X]  │  │  <- IngredientEditRow (확장형)
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ≡  양파       1    개    [정량▼]  │  │
│  │                                [X] │  │
│  └────────────────────────────────────┘  │
│                                          │
│  조리 단계 ──────────────────  [+ 추가] │  <- 조리 단계 섹션
│  ┌────────────────────────────────────┐  │
│  │  ≡  [조리방법▼]               [X] │  │
│  │     instruction 텍스트에어리어      │  │  <- StepEditRow (확장형)
│  │     [부가정보 펼치기 ▼]            │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ≡  [끓이기▼]                 [X] │  │
│  │     된장과 물을 넣고 끓여주세요     │  │
│  │     [부가정보 접기 ▲]              │  │
│  │     불세기: 🔥 🔥 ○  시간: 10 분  │  │  <- 부가정보 펼침 상태
│  └────────────────────────────────────┘  │
│                                          │
│  (하단 여백 — 고정 버튼 공간)            │
│                                          │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │           등록하기                 │  │  <- 하단 고정 CTA
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[← 뒤로가기]**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **타이틀**: `flex-1 text-center text-base font-bold text-gray-900`
- **[저장] 버튼**: `text-sm text-green-600 font-semibold px-2`
  - [저장]과 [등록하기]는 동일 액션 (중복 트리거 방지)

#### 섹션 헤더

- **컨테이너**: `flex items-center justify-between px-4 py-3 mt-2`
- **섹션명**: `text-sm font-bold text-gray-700`
- **[+ 추가] 버튼**: `text-sm text-green-600 font-semibold`

#### 제목 인풋

- **스타일**: `mx-4 h-12 px-4 border-2 rounded-xl text-sm text-gray-900 outline-none w-[calc(100%-2rem)]`
  - 기본: `border-gray-200 focus:border-green-500`
  - 필수 미입력 + 등록 시도 후: `border-red-400`
- **에러 메시지**: `text-xs text-red-500 mt-1 ml-5` → `"레시피 제목을 입력해주세요"`

#### IngredientEditRow (확장형 — MANUAL_RECIPE_CREATE 전용)

```
┌──────────────────────────────────────────┐
│  ≡   [재료 검색 또는 직접 입력 인풋]  [X]│
│       [수량 인풋]  [단위▼]  [타입▼]     │
└──────────────────────────────────────────┘
```

- **행 컨테이너**: `flex flex-col gap-2 px-4 py-3 bg-white border-b border-gray-100`
- **상단 행**: `flex items-center gap-2`
  - 드래그 핸들: `w-5 h-5 text-gray-300 flex-shrink-0 cursor-grab`
  - 재료 인풋: `flex-1 h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-green-400`
    - placeholder: `"재료 검색 또는 입력"`
    - 입력 시 자동완성 드롭다운: `GET /ingredients?q={query}` 결과 표시
  - [X]: `w-7 h-7 text-gray-400`
- **하단 행**: `flex items-center gap-2`
  - 수량 인풋: `w-20 h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center outline-none`
    - placeholder: `"수량"`
  - 단위 드롭다운: `w-20 h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none`
    - 옵션: g, kg, ml, L, 개, 큰술, 작은술, 컵, 단, 모, 줄기, 직접입력
  - 타입 드롭다운: `w-20 h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none`
    - 옵션: 정량 / 적당히 / 옵션
    - 기본값: `정량`
    - `적당히` 선택 시 수량·단위 입력 비활성화

#### StepEditRow (확장형 — 부가정보 포함)

```
┌──────────────────────────────────────────┐
│  ≡   [조리방법▼]                    [X]  │
│       [instruction 텍스트에어리어]        │
│       [부가정보 펼치기 ▼]                │
└──────────────────────────────────────────┘

부가정보 펼침 상태:
┌──────────────────────────────────────────┐
│  ≡   [조리방법▼]                    [X]  │
│       [instruction 텍스트에어리어]        │
│       [부가정보 접기 ▲]                  │
│  불세기:  🔥  🔥  ○   (탭으로 단계 선택) │
│  시간:    [  10  ] 분                    │
└──────────────────────────────────────────┘
```

- **행 컨테이너**: `flex flex-col gap-2 px-4 py-3 bg-white border-b border-gray-100`
- **상단 행**: `flex items-center gap-2`
  - 드래그 핸들 + 조리방법 드롭다운 + [X]: YT_IMPORT STEP_3과 동일
- **instruction 텍스트에어리어**: `w-full min-h-[64px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:border-green-400 resize-none`
  - placeholder: `"조리 방법을 입력해주세요"`
- **[부가정보 펼치기/접기] 토글**: `flex items-center gap-1 text-xs text-gray-400 font-medium`
  - 아이콘: `w-3 h-3` (▼ / ▲)
- **부가정보 영역** (펼침 시):
  - **불세기 선택**: `flex items-center gap-2`
    - 레이블: `text-xs text-gray-500 w-12`
    - 🔥 버튼 3개: `w-8 h-8 text-xl` (탭 시 해당 단계까지 활성화)
      - 활성: `opacity-100`
      - 비활성: `opacity-30`
      - 0단계(불 없음): 전체 비활성 상태
  - **시간 입력**: `flex items-center gap-2`
    - 레이블: `text-xs text-gray-500 w-12`
    - 숫자 인풋: `w-16 h-8 px-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center outline-none`
    - 단위: `text-xs text-gray-500` → `"분"`

#### 하단 고정 버튼 영역

- **컨테이너**: `fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-200`
- **[등록하기] 버튼**: `w-full py-3.5 text-base font-semibold rounded-xl`
  - 활성(제목 + 재료 1개 이상 + 스텝 1개 이상): `bg-green-600 text-white`
  - 비활성: `bg-gray-200 text-gray-400 cursor-not-allowed`
  - 로딩 중: 스피너 + `"등록 중..."` + `pointer-events-none`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `title` | `string` | `""` | 레시피 제목 |
| `baseServings` | `number` | `2` | 기본 인분 |
| `ingredients` | `ManualIngredient[]` | `[]` | 재료 목록 |
| `steps` | `ManualStep[]` | `[]` | 조리 단계 목록 |
| `expandedStepIds` | `Set<string>` | `new Set()` | 부가정보 펼친 스텝 ID |
| `isSubmitting` | `boolean` | `false` | 등록 API 호출 중 |
| `hasAttemptedSubmit` | `boolean` | `false` | 등록 시도 여부 (유효성 표시용) |

```typescript
// 등록 활성화 조건
const isFormValid =
  title.trim().length >= 1 &&
  ingredients.length >= 1 &&
  steps.length >= 1
```

### 인터랙션

- **[+ 재료 추가] 탭** → `ingredients`에 빈 행 추가 → 해당 행 재료명 인풋 자동 포커스
- **재료명 인풋 입력** → 디바운스 300ms → `GET /ingredients?q={query}` → 자동완성 드롭다운 표시
- **자동완성 항목 탭** → 해당 재료 `ingredient_id` 세팅, 재료명 인풋에 표준명 채움
- **[+ 스텝 추가] 탭** → `steps`에 빈 행 추가 → 해당 행 instruction 자동 포커스
- **[부가정보 펼치기] 탭** → `expandedStepIds`에 해당 step ID 추가
- **[부가정보 접기] 탭** → `expandedStepIds`에서 해당 step ID 제거
- **불세기 🔥 탭** → 탭한 🔥 인덱스까지 활성화 (토글 방식: 이미 해당 단계면 0으로 초기화)
- **드래그 핸들 → 드래그** → 로컬 배열 순서 변경 (API 미호출)
- **[등록하기] / [저장] 탭**:
  - `hasAttemptedSubmit = true`
  - if `!isFormValid` → 유효성 에러 표시 (제목 에러 메시지, 재료/스텝 섹션 헤더 빨간 강조)
  - if `isFormValid` → `isSubmitting = true` → `POST /recipes` 호출
  - 성공 → RECIPE_DETAIL 이동 (`new_recipe_id`)
  - 실패 → Toast("등록에 실패했어요. 다시 시도해주세요")
- **[← 뒤로가기] 탭**:
  - if `title !== "" || ingredients.length > 0 || steps.length > 0` → ConfirmModal("작성 중인 내용이 사라져요", "뒤로 가면 입력한 내용이 모두 사라져요.", `destructive`) → 확인 → 이전 화면 복귀
  - if 폼 비어있음 → 즉시 복귀

### ⚠️ 비즈니스 로직 주의사항

- **등록 활성화 조건 엄수**: 제목 1자 이상 + 재료 1개 이상 + 조리 단계 1개 이상 모두 충족해야 [등록하기] 활성. `hasAttemptedSubmit=true` 이후에만 미충족 필드 에러 표시 (첫 진입 시 에러 미표시).
- **적당히 타입 처리**: 재료 타입 드롭다운에서 `적당히` 선택 시 수량·단위 인풋 `disabled` + `opacity-40` 처리. 서버 전송 시 수량=null, 단위=null.
- **뒤로가기 보호 조건**: 폼에 내용이 하나라도 입력됐을 때만 ConfirmModal 표시. 완전히 빈 상태에서는 즉시 이탈.
- **조리방법 목록**: `GET /cooking-methods`로 불러온 목록 사용 (🔓 인증 불필요). 직접 입력 옵션은 제공하지 않음 (YT_IMPORT와 달리 AI 신규 생성 없음).

---

## 18. MYPAGE — 마이페이지

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  마이페이지                  [⚙️]  │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ┌────┐  홍길동                   │  │  <- 프로필 영역
│  │  │아바│  gildong@email.com        │  │
│  │  └────┘                           │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  [레시피북]      [장보기 기록]      │  │  <- 탭 전환 바
│  │  ──────────                        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [레시피북 탭 활성 시]                   │
│                                          │
│  내 레시피북        [+ 새 레시피북]      │  <- 섹션 헤더
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  📁  내가 추가한 레시피    N개  >  │  │  <- 시스템 책 (my_added)
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  🔖  저장한 레시피         N개  >  │  │  <- 시스템 책 (saved)
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  ❤️   좋아요한 레시피      N개  >  │  │  <- 시스템 책 (liked)
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  📚  나의 레시피북1        N개  >  │  │  <- 커스텀 책
│  │                            [···]   │  │  <- 수정/삭제 메뉴
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  📚  나의 레시피북2        N개  >  │  │
│  │                            [···]   │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
│                                          │
│  [장보기 기록 탭 활성 시]                │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  3월 3일 ~ 3월 5일                 │  │  <- ShoppingHistoryRow
│  │  레시피 3개  [완료]                │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  2월 24일 ~ 2월 26일               │  │
│  │  레시피 2개  [완료]                │  │
│  └────────────────────────────────────┘  │
│  ...                                     │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='mypage')       │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 h-14`
- **타이틀**: `text-lg font-bold text-gray-900`
- **[⚙️ 설정] 버튼**: `w-10 h-10 flex items-center justify-center text-gray-600`

#### 프로필 영역

- **컨테이너**: `flex items-center gap-4 px-4 py-5 bg-white border-b border-gray-100`
- **아바타**: `w-14 h-14 rounded-full object-cover bg-gray-200 flex-shrink-0`
  - 소셜 기본 이미지 또는 회색 플레이스홀더
- **텍스트 영역**: `flex flex-col gap-0.5`
  - 닉네임: `text-base font-bold text-gray-900`
  - 이메일: `text-sm text-gray-400`

#### 탭 전환 바

- **컨테이너**: `flex border-b border-gray-200 bg-white`
- **탭**: `flex-1 py-3 text-sm font-semibold text-center`
  - 활성: `text-gray-900 border-b-2 border-gray-900`
  - 비활성: `text-gray-400`

#### 레시피북 섹션 헤더

- **컨테이너**: `flex items-center justify-between px-4 py-3`
- **섹션명**: `text-sm font-bold text-gray-700`
- **[+ 새 레시피북] 버튼**: `text-sm text-green-600 font-semibold`
  - 탭 → 인라인 모달: 레시피북 이름 인풋 + [만들기] 버튼 → `POST /recipe-books`

#### RecipeBookRow

**시스템 책 (my_added / saved / liked)**:
- **컨테이너**: `flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100`
- **아이콘**: `text-xl flex-shrink-0`
  - my_added: 📁 / saved: 🔖 / liked: ❤️
- **책 이름**: `flex-1 text-sm font-semibold text-gray-900`
- **레시피 수**: `text-xs text-gray-400`
- **[>] 화살표**: `w-4 h-4 text-gray-300`
- `[···]` 메뉴 **미표시**

**커스텀 책**:
- **컨테이너**: `flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100`
- **아이콘**: 📚 `text-xl flex-shrink-0`
- **책 이름**: `flex-1 text-sm font-semibold text-gray-900`
- **레시피 수**: `text-xs text-gray-400`
- **[···] 더보기 버튼**: `w-8 h-8 flex items-center justify-center text-gray-400`
  - 탭 → ActionSheet:
    - `"이름 변경"` → 인라인 인풋 편집 → `PATCH /recipe-books/{id}`
    - `"삭제"` → ConfirmModal("레시피북을 삭제할까요?", "레시피북 안의 레시피는 삭제되지 않아요.", `destructive`) → `DELETE /recipe-books/{id}`

#### ShoppingHistoryRow

- **컨테이너**: `flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100`
- **좌측**: `flex flex-col gap-0.5`
  - 날짜 범위: `text-sm font-semibold text-gray-900`
    - 형식: `"3월 3일 ~ 3월 5일"`
  - 레시피 수: `text-xs text-gray-400`
    - 형식: `"레시피 3개"`
- **우측**:
  - 완료 배지: `text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold` → `"완료"`
  - 진행 중 배지: `text-[11px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-semibold` → `"진행 중"`
  - [>] 화살표: `w-4 h-4 text-gray-300`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `activeTab` | `'books' \| 'history'` | `'books'` | 현재 활성 탭 |
| `profile` | `UserProfile` | API 응답 | 프로필 정보 |
| `recipeBooks` | `RecipeBook[]` | API 응답 | 레시피북 목록 |
| `shoppingHistory` | `ShoppingList[]` | API 응답 | 장보기 기록 목록 |
| `isNewBookInputOpen` | `boolean` | `false` | 새 레시피북 생성 인풋 표시 |
| `newBookName` | `string` | `""` | 새 레시피북 이름 입력값 |
| `editingBookId` | `string \| null` | `null` | 이름 변경 중인 책 ID |

### 인터랙션

- **화면 진입**:
  - `GET /users/me` → `profile` 세팅
  - `GET /recipe-books` → `recipeBooks` 세팅
- **[레시피북] 탭 탭** → `activeTab = 'books'`
- **[장보기 기록] 탭 탭** → `activeTab = 'history'` → `GET /shopping/lists` 호출 (미조회 시) → `shoppingHistory` 세팅
- **RecipeBookRow 탭 (책 행 자체)** → RECIPEBOOK_DETAIL 이동 (`book_id` 파라미터 전달)
- **[+ 새 레시피북] 탭** → `isNewBookInputOpen = true` → 이름 인풋 노출
  - [만들기] 탭 → `POST /recipe-books` body: `{ name: newBookName }` → 성공 시 목록 갱신 + Toast("레시피북이 만들어졌어요")
- **[···] 탭 (커스텀 책)** → ActionSheet 표시
  - `"이름 변경"` → `editingBookId` 세팅 → 인라인 편집 모드
    - 인풋 blur 또는 엔터 → `PATCH /recipe-books/{id}` → Toast("이름이 변경됐어요")
  - `"삭제"` → ConfirmModal → 확인 → `DELETE /recipe-books/{id}` → 목록에서 제거 → Toast("삭제됐어요")
- **ShoppingHistoryRow 탭** → SHOPPING_DETAIL 이동 (read-only 모드, `list_id` 파라미터)
- **[⚙️] 탭** → SETTINGS 이동

### ⚠️ 비즈니스 로직 주의사항

- **시스템 책 3개 보호**: `book_type === 'my_added' || 'saved' || 'liked'`인 행에는 `[···]` 버튼 렌더링 안 함. 이름 변경·삭제 불가.
- **커스텀 책 삭제 시 안내**: ConfirmModal 설명에 `"레시피북 안의 레시피는 삭제되지 않아요"` 명시. 레시피 데이터 자체는 보존.
- **장보기 기록 지연 로딩**: [장보기 기록] 탭 첫 탭 시에만 `GET /shopping/lists` 호출. 이후 탭 전환 시 재조회 없음 (캐시 유지).

---

## 19. RECIPEBOOK_DETAIL — 레시피북 상세

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   저장한 레시피        [편집]   │  │  <- Header h-14 (커스텀 타입만 [편집])
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  ┌──────────────┐  ┌──────────────┐     │
│  │  RecipeCard  │  │  RecipeCard  │     │  <- 2열 그리드
│  │  3월 3일 추가│  │  3월 1일 추가│     │  <- 추가일 표시
│  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐     │
│  │  RecipeCard  │  │  RecipeCard  │     │
│  └──────────────┘  └──────────────┘     │
│  ...                                     │
│                                          │
│  (빈 상태: empty state)                  │
│                                          │
├──────────────────────────────────────────┤
│  BottomTabBar (activeTab='mypage')       │
└──────────────────────────────────────────┘
```

#### 스와이프 삭제 노출 상태

```
┌──────────────────────────────────────────┐
│  ┌──────────────────────────┐  ┌──────┐  │
│  │  RecipeCard (밀린 상태)   │  │ 제거 │  │  <- 스와이프 좌 시 [제거] 노출
│  └──────────────────────────┘  └──────┘  │
└──────────────────────────────────────────┘
```

#### 빈 상태

```
┌──────────────────────────────────────────┐
│                                          │
│              📚                          │
│      아직 레시피가 없어요                 │
│   레시피를 탐색하고 추가해보세요          │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │        레시피 탐색하기           │   │  <- CTA
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[← 뒤로가기]**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **타이틀**: `flex-1 text-center text-base font-bold text-gray-900`
  - 레시피북 이름 표시
- **[편집] 버튼**: `text-sm text-green-600 font-semibold px-2`
  - 조건: `book_type === 'custom'`일 때만 표시
  - 탭 → MYPAGE의 이름 변경과 동일하게 인라인 편집 또는 ActionSheet

#### RecipeBookGrid

- **그리드**: `grid grid-cols-2 gap-3 px-4 py-4`
- **RecipeCardWrapper** (스와이프 삭제 래퍼):
  - **외부**: `relative overflow-hidden rounded-xl`
  - **카드**: RecipeCard 공통 컴포넌트 재사용
  - **추가일 텍스트**: RecipeCard 하단에 `text-[10px] text-gray-400 px-1 pb-1`
    - 형식: `"3월 3일 추가"` (`added_at` 기준)
  - **[제거] 버튼** (스와이프 좌 시 노출):
    - `absolute right-0 top-0 bottom-0 w-16 bg-red-500 flex items-center justify-center text-white text-xs font-semibold rounded-r-xl`
    - `book_type === 'my_added'`이면 **미표시**

#### 제거 동작 분기

| book_type | [제거] 탭 동작 |
|-----------|--------------|
| `my_added` | [제거] 버튼 미표시 (스와이프 비활성) |
| `liked` | ConfirmModal("좋아요를 취소할까요?", "레시피 좋아요가 해제돼요.", `destructive`) → `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` |
| `saved` | 즉시 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` |
| `custom` | 즉시 `DELETE /recipe-books/{book_id}/recipes/{recipe_id}` |

#### 빈 상태 UI

- **컨테이너**: `flex-1 flex flex-col items-center justify-center py-20 gap-3`
- **아이콘**: `text-5xl` → 📚
- **제목**: `text-sm font-semibold text-gray-600`
- **설명**: `text-xs text-gray-400 text-center`
- **[레시피 탐색하기] 버튼**: `mt-3 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl`
  - 탭 → HOME 이동

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `bookId` | `string` | 라우트 파라미터 | 레시피북 ID |
| `bookType` | `BookType` | API 응답 | 책 타입 (my_added / saved / liked / custom) |
| `bookName` | `string` | API 응답 | 레시피북 이름 |
| `recipes` | `BookRecipe[]` | API 응답 | 레시피 목록 |
| `swipingRecipeId` | `string \| null` | `null` | 스와이프 열린 카드 ID |
| `removingRecipeId` | `string \| null` | `null` | 제거 처리 중인 레시피 ID |

### 인터랙션

- **화면 진입** → `GET /recipe-books/{id}/recipes` → `recipes` 세팅, `bookType` / `bookName` 확인
- **RecipeCard 탭** → RECIPE_DETAIL 이동 (`recipe_id` 파라미터)
- **RecipeCard 스와이프 좌** (`book_type !== 'my_added'`):
  - `swipingRecipeId` = 해당 카드 ID → [제거] 버튼 노출
  - 다른 카드 스와이프 시 이전 카드 원위치
  - 카드 외부 탭 시 원위치
- **[제거] 탭**:
  - `book_type === 'liked'` → ConfirmModal → 확인 → `DELETE /recipe-books/{id}/recipes/{recipe_id}`
  - `book_type === 'saved' || 'custom'` → 즉시 `DELETE /recipe-books/{id}/recipes/{recipe_id}`
  - 성공 → 로컬 `recipes`에서 해당 항목 제거 → Toast("제거됐어요")
- **[레시피 탐색하기] 탭** (빈 상태) → HOME 이동
- **[뒤로가기] 탭** → MYPAGE 복귀

### ⚠️ 비즈니스 로직 주의사항

- **my_added 제거 불가**: `book_type === 'my_added'`인 경우 스와이프 제스처 자체를 비활성화 (`pointer-events` 처리). [제거] 버튼 렌더링 안 함.
- **liked 제거 = 좋아요 해제**: `DELETE /recipe-books/{id}/recipes/{recipe_id}` 호출 시 서버가 recipe_likes 테이블에서도 삭제 처리. 클라이언트는 ConfirmModal로 사용자 인지 후 실행.
- **제거 후 로컬 즉시 반영**: API 성공 후 전체 재조회 없이 로컬 `recipes` 배열에서 filter 제거.

---

## 20. SETTINGS — 설정

### 레이아웃

```
┌──────────────────────────────────────────┐  <- 375px
│  STATUS BAR                              │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │  ←   설정                          │  │  <- Header h-14
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  스크롤 영역                             │
│                                          │
│  계정 ──────────────────────────────    │  <- 섹션 헤더
│  ┌────────────────────────────────────┐  │
│  │  닉네임                            │  │  <- 닉네임 설정 행
│  │  홍길동                            │  │  <- 현재 닉네임 (서브텍스트)
│  └────────────────────────────────────┘  │
│                                          │
│  [닉네임 편집 모드 활성 시]               │
│  ┌────────────────────────────────────┐  │
│  │  닉네임                            │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │  홍길동                  9/30│  │  │  <- 인라인 인풋
│  │  └──────────────────────────────┘  │  │
│  │  ┌───────┐  ┌───────┐             │  │
│  │  │ 취소  │  │ 저장  │             │  │  <- 취소/저장 버튼
│  │  └───────┘  └───────┘             │  │
│  └────────────────────────────────────┘  │
│                                          │
│  앱 설정 ───────────────────────────    │  <- 섹션 헤더
│  ┌────────────────────────────────────┐  │
│  │  화면 꺼짐 방지              [ON]  │  │  <- 토글 행
│  │  요리모드에서 화면이 꺼지지 않아요  │  │
│  └────────────────────────────────────┘  │
│                                          │
│  기타 ──────────────────────────────    │  <- 섹션 헤더
│  ┌────────────────────────────────────┐  │
│  │  회원 탈퇴               (빨간글)  │  │  <- 탈퇴 행
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

#### 회원 탈퇴 ConfirmModal

```
┌──────────────────────────────────────────┐
│  dim overlay bg-black/50                 │
│  ┌────────────────────────────────────┐  │
│  │  정말 탈퇴하시겠어요?              │  │  <- 제목
│  │  모든 데이터가 삭제되며            │  │
│  │  복구할 수 없어요.                 │  │  <- 설명
│  │  (탈퇴 후 30일 이내 재가입 시      │  │
│  │   데이터 복구 가능)                │  │  <- 소프트 삭제 안내
│  │  ┌──────────┐  ┌────────────────┐ │  │
│  │  │   취소   │  │ 탈퇴하기       │ │  │  <- 버튼 (탈퇴 버튼 빨간)
│  │  └──────────┘  └────────────────┘ │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 컴포넌트

#### Header

- **컨테이너**: `flex items-center px-4 py-3 bg-white border-b border-gray-100 h-14`
- **[← 뒤로가기]**: `w-10 h-10 flex items-center justify-center -ml-2 text-gray-700`
- **타이틀**: `flex-1 text-center text-base font-bold text-gray-900`

#### 섹션 헤더

- **컨테이너**: `px-4 py-2 bg-gray-50 border-y border-gray-200`
- **텍스트**: `text-xs font-bold text-gray-400 uppercase tracking-wide`

#### NicknameRow (닉네임 설정 행)

**일반 상태**:
- **컨테이너**: `flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100`
- **좌측**: `flex flex-col gap-0.5`
  - 레이블: `text-sm font-semibold text-gray-900`
  - 현재 닉네임: `text-sm text-gray-400`
- **[편집] 버튼**: `text-sm text-green-600 font-medium`
  - 탭 → 편집 모드 전환

**편집 모드**:
- **컨테이너**: `px-4 py-4 bg-white border-b border-gray-100 flex flex-col gap-3`
- **레이블**: `text-sm font-semibold text-gray-900`
- **인풋 컨테이너**: `relative`
  - 인풋: `w-full h-11 px-4 border-2 border-green-500 rounded-xl text-sm text-gray-900 outline-none`
    - 에러(2자 미만): `border-red-400`
  - 글자수: `absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400`
    - 형식: `"N/30"`
- **에러 메시지**: `text-xs text-red-500 ml-1` → `"2자 이상 입력해주세요"`
- **버튼 행**: `flex gap-2`
  - [취소] 버튼: `flex-1 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl`
  - [저장] 버튼: `flex-1 py-2.5 text-sm font-semibold rounded-xl`
    - 활성(2자 이상): `bg-green-600 text-white`
    - 비활성(2자 미만): `bg-gray-200 text-gray-400 cursor-not-allowed`

#### WakeLockRow (화면 꺼짐 방지 행)

- **컨테이너**: `flex flex-col gap-1 px-4 py-4 bg-white border-b border-gray-100`
- **상단 행**: `flex items-center justify-between`
  - 레이블: `text-sm font-semibold text-gray-900`
  - **토글 스위치**:
    - ON: `w-12 h-6 bg-green-500 rounded-full relative`
      - 원: `absolute right-1 top-1 w-4 h-4 bg-white rounded-full`
    - OFF: `w-12 h-6 bg-gray-300 rounded-full relative`
      - 원: `absolute left-1 top-1 w-4 h-4 bg-white rounded-full`
    - 트랜지션: `transition-all duration-200`
- **설명 텍스트**: `text-xs text-gray-400`

#### WithdrawRow (회원 탈퇴 행)

- **컨테이너**: `px-4 py-4 bg-white border-b border-gray-100`
- **텍스트**: `text-sm font-semibold text-red-500`

### 상태(State)

| 상태명 | 타입 | 초기값 | 설명 |
|--------|------|--------|------|
| `profile` | `UserProfile` | API 응답 | 현재 사용자 정보 |
| `isNicknameEditing` | `boolean` | `false` | 닉네임 편집 모드 |
| `nicknameInput` | `string` | `profile.nickname` | 닉네임 편집 입력값 |
| `isNicknameValid` | `boolean` | `true` | 닉네임 유효 여부 |
| `isSavingNickname` | `boolean` | `false` | 닉네임 저장 API 중 |
| `wakeLockEnabled` | `boolean` | `profile.screen_wake_lock` | 화면 꺼짐 방지 설정 |
| `isWithdrawModalOpen` | `boolean` | `false` | 탈퇴 ConfirmModal 열림 |
| `isWithdrawing` | `boolean` | `false` | 탈퇴 API 호출 중 |

### 인터랙션

- **화면 진입** → `GET /users/me` → `profile` 세팅, `wakeLockEnabled` 초기화

- **닉네임 [편집] 탭** → `isNicknameEditing = true`, `nicknameInput = profile.nickname`
- **닉네임 인풋 입력** → `nicknameInput` 업데이트 → `isNicknameValid = nicknameInput.length >= 2 && <= 30`
- **닉네임 [저장] 탭**:
  - if `!isNicknameValid` → 아무 동작 없음
  - if `isNicknameValid` → `isSavingNickname = true` → `PATCH /users/me` body: `{ nickname: nicknameInput }`
  - 성공 → `profile.nickname` 업데이트 → `isNicknameEditing = false` → Toast("닉네임이 변경됐어요")
  - 실패 → Toast("변경에 실패했어요. 다시 시도해주세요")
- **닉네임 [취소] 탭** → `isNicknameEditing = false`, `nicknameInput` 초기화

- **화면 꺼짐 방지 토글 탭**:
  - `wakeLockEnabled` 즉시 반전 (낙관적 업데이트)
  - `PATCH /users/me/settings` body: `{ screen_wake_lock: !wakeLockEnabled }`
  - 실패 → 원복 + Toast("설정 변경에 실패했어요")

- **회원 탈퇴 행 탭** → `isWithdrawModalOpen = true`
- **ConfirmModal [탈퇴하기] 탭**:
  - `isWithdrawing = true`
  - `DELETE /users/me` 호출
  - 성공 → 로컬 인증 토큰 삭제 → HOME으로 이동 + Toast("탈퇴가 완료됐어요")
  - 실패 → `isWithdrawing = false` → Toast("탈퇴 처리에 실패했어요")

- **[← 뒤로가기] 탭**:
  - if `isNicknameEditing === true` → 편집 모드 종료 후 복귀 (`[취소]`와 동일)
  - else → MYPAGE 복귀

### ⚠️ 비즈니스 로직 주의사항

- **화면 꺼짐 방지 연동**: `PATCH /users/me/settings` 성공 시 서버의 `screen_wake_lock` 값이 COOK_MODE 진입 시 `navigator.wakeLock.request('screen')` 호출 여부를 결정. SETTINGS에서 토글만 하면 COOK_MODE가 자동으로 이 설정값을 참조.
- **회원 탈퇴 소프트 삭제**: `DELETE /users/me`는 즉시 영구 삭제가 아닌 소프트 삭제. ConfirmModal 설명에 `"탈퇴 후 30일 이내 재가입 시 데이터 복구 가능"` 안내 포함.
- **닉네임 유효성**: 세션 3 LOGIN Step 2의 닉네임 유효성 로직과 동일하게 2~30자 기준 적용.
- **탈퇴 처리 중 중복 탭 방지**: `isWithdrawing === true` 동안 ConfirmModal의 [탈퇴하기] 버튼 `pointer-events-none` + 로딩 스피너 표시.
- **토큰 삭제 타이밍**: `DELETE /users/me` 성공 응답 수신 직후 로컬 스토리지/쿠키의 access_token + refresh_token 삭제 후 HOME 이동.
