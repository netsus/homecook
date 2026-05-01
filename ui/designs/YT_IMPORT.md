# YT_IMPORT — 유튜브 레시피 가져오기

> 기준 문서: 화면정의서 v1.5.1 S10 / 요구사항 v1.6.4 S2-4 / 유저flow맵 v1.3.1 S9
> API 문서: v1.2.2 S6 (6-1, 6-2, 6-3)
> 생성일: 2026-05-02
> 디자인 분류: prototype-derived design (h8 matrix)
> Authority 상태: not-required (generator+critic only)

---

## 화면 개요

- **Screen ID**: `YT_IMPORT`
- **권한**: 로그인 필수
- **진입**: `MENU_ADD` -> "유튜브 링크로 추가"
- **목적**: YouTube URL -> 자동 추출/표준화/추론 -> 검수/수정 -> 레시피 등록 -> 플래너 추가
- **형태**: Full Page (multi-step flow, 독립적 맥락 전환 + 긴 작성 흐름)
- **이탈**: MEAL_SCREEN 복귀 또는 중간 이탈 (미등록)
- **소속 여정**: S9 유튜브 등록 여정

---

## 레이아웃 와이어프레임

### Step 1 — URL 입력

```
┌─────────────────────────────────┐  <- 375px (모바일 기준)
|  <- 뒤로   유튜브 레시피 가져오기   |  <- AppBar 56px, --surface, --shadow-2
├─────────────────────────────────┤
|                                 |
|  --space-8 상단 여백             |
|                                 |
|  유튜브 영상에서                 |  <- text-xl, weight-800, --foreground
|  레시피를 가져와요               |
|                                 |
|  --space-3 간격                 |
|                                 |
|  영상 링크를 붙여넣으면          |  <- text-base, --text-2
|  재료와 조리법을 자동 추출해요   |
|                                 |
|  --space-6 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  | https://youtube.com/...   |  |  <- --surface-fill bg, --radius-sm
|  └───────────────────────────┘  |     text-base, placeholder --text-3
|                                 |
|  --space-4 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  |        가져오기             |  |  <- --brand bg, white text, --radius-sm
|  └───────────────────────────┘  |     48px 높이, full-width
|                                 |
|                                 |
|                                 |
|                                 |
└─────────────────────────────────┘
     [하단 탭바: 홈/플래너/팬트리/마이]  <- 56px + safe-area
```

### Step 1.5 — 비레시피 영상 경고

```
┌─────────────────────────────────┐
|  <- 뒤로   유튜브 레시피 가져오기   |  <- AppBar 56px
├─────────────────────────────────┤
|                                 |
|  --space-8 상단 여백             |
|                                 |
|  ┌───────────────────────────┐  |
|  |  [썸네일 이미지]            |  |  <- 16:9, --radius-md
|  └───────────────────────────┘  |
|                                 |
|  --space-4 간격                 |
|                                 |
|  백종원의 요리비책              |  <- text-sm, --text-3, 채널명
|  백종원 김치찌개                |  <- text-lg, weight-700, --foreground
|                                 |
|  --space-6 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  |  이 영상은 요리 레시피가    |  |  <- --brand-soft bg, --radius-md
|  |  아닌 것 같아요             |  |     text-base, --foreground
|  |                            |  |
|  |  요리 레시피가 맞다면       |  |     text-sm, --text-2
|  |  그래도 진행해보세요        |  |
|  └───────────────────────────┘  |
|                                 |
|  --space-4 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  |        그래도 진행          |  |  <- --brand bg, white text, --radius-sm
|  └───────────────────────────┘  |     48px 높이, full-width
|                                 |
|  --space-3 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  |        다시 입력            |  |  <- --surface bg, --line border
|  └───────────────────────────┘  |     --foreground text, --radius-sm
|                                 |     48px 높이, full-width
|                                 |
└─────────────────────────────────┘
```

### Step 2 — 추출 진행 상태

```
┌─────────────────────────────────┐
|  <- 뒤로   유튜브 레시피 가져오기   |  <- AppBar 56px
├─────────────────────────────────┤
|                                 |
|  --space-8 상단 여백             |
|                                 |
|  레시피를 분석하고 있어요        |  <- text-xl, weight-800, --foreground
|                                 |
|  --space-3 간격                 |
|                                 |
|  백종원 김치찌개                |  <- text-base, --text-2
|                                 |
|  --space-8 간격                 |
|                                 |
|  ┌───────────────────────────┐  |
|  |  (1) 설명란 분석            |  |  <- --olive 아이콘, --foreground
|  |      ✓ 완료                 |  |     --olive 색상 체크
|  |  ─────────────────────────  |  |  <- --line 구분선
|  |  (2) 화면 텍스트 인식 (OCR) |  |  <- --olive 아이콘
|  |      ✓ 완료                 |  |     --olive 색상 체크
|  |  ─────────────────────────  |  |
|  |  (3) 음성 인식 (ASR)        |  |  <- --brand 아이콘, 진행중
|  |      분석 중...              |  |     --brand 색상, 로딩 스피너
|  |  ─────────────────────────  |  |
|  |  (4) 수량 추정               |  |  <- --text-4 아이콘, 대기
|  |      대기 중                 |  |     --text-4 색상
|  └───────────────────────────┘  |  <- --surface bg, --radius-lg, --shadow-1
|                                 |
|  --space-4 간격                 |
|                                 |
|  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  |
|  |  progress bar              |  |  <- --brand 색상, 전체 진행률
|  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  |
|                                 |
|  잠시만 기다려주세요             |  <- text-sm, --text-3, 중앙 정렬
|                                 |
└─────────────────────────────────┘
```

### Step 3 — 결과 검수/수정

```
┌─────────────────────────────────┐
|  <- 뒤로   결과 확인    [등록]   |  <- AppBar 56px, [등록] --brand
├─────────────────────────────────┤
|                                 |  <- 세로 스크롤 시작
|  추출 결과를 확인해주세요        |  <- text-base, --text-2
|                                 |
|  ┌─ 추출 방식 ─────────────┐   |
|  | description  ocr         |   |  <- --olive pill, --radius-full
|  └─────────────────────────┘   |     text-xs, weight-600
|                                 |
|  --space-6 간격                 |
|                                 |
|  레시피명                       |  <- text-sm, weight-600, --text-2
|  ┌───────────────────────────┐  |
|  | 백종원 김치찌개            |  |  <- --surface-fill bg, --radius-sm
|  └───────────────────────────┘  |     text-base, --foreground, editable
|                                 |
|  --space-4 간격                 |
|                                 |
|  기본 인분                      |  <- text-sm, weight-600, --text-2
|  ┌─────┐                       |
|  | [-] 2 [+] |                  |  <- stepper, --brand buttons
|  └─────┘                       |     44x44 touch targets
|                                 |
|  --space-6 간격                 |
|                                 |
|  재료 (5개)                     |  <- text-lg, weight-700, --foreground
|  ┌───────────────────────────┐  |
|  | 김치          200g   [편집]|  |  <- --surface bg, --line border
|  | 돼지고기      300g   [편집]|  |     --radius-md
|  | 두부          1모    [편집]|  |     각 행 48px 높이
|  | 대파          1대    [편집]|  |
|  | 소금          약간   [편집]|  |  <- TO_TASTE --text-3
|  └───────────────────────────┘  |
|  [+ 재료 추가]                   |  <- --olive, --radius-sm, 44px
|                                 |
|  --space-6 간격                 |
|                                 |
|  조리 과정 (4단계)               |  <- text-lg, weight-700, --foreground
|  ┌───────────────────────────┐  |
|  | 1. [손질]                  |  |  <- method badge --cook-gray
|  |    김치를 한입 크기로 썬다  |  |     text-base, --foreground
|  |               [편집] [x]   |  |
|  ├───────────────────────────┤  |  <- --line 구분
|  | 2. [볶기]                  |  |  <- method badge --cook-orange
|  |    돼지고기를 중불에서 볶다 |  |
|  |               [편집] [x]   |  |
|  ├───────────────────────────┤  |
|  | 3. [끓이기]                |  |  <- method badge --cook-red
|  |    물을 넣고 끓인다         |  |
|  |               [편집] [x]   |  |
|  ├───────────────────────────┤  |
|  | 4. [절이기] 신규            |  |  <- method badge --cook-gray
|  |    무를 소금물에 담근다      |  |     "신규" pill: --brand-soft bg,
|  |               [편집] [x]   |  |     --brand text, --radius-full
|  └───────────────────────────┘  |
|  [+ 조리 과정 추가]              |  <- --olive, --radius-sm, 44px
|                                 |
|  --space-8 하단 여백             |
|                                 |  <- 세로 스크롤 끝
└─────────────────────────────────┘
     [하단 탭바]
```

### Step 4 — 등록 완료 + 끼니 추가

```
┌─────────────────────────────────┐
|                                 |
|                                 |
|  ┌───────────────────────────┐  |  <- 중앙 카드, --surface, --radius-lg
|  |                           |  |     --shadow-2
|  |     체크 아이콘 (--olive)  |  |
|  |                           |  |
|  |   레시피가 등록됐어요      |  |  <- text-xl, weight-800, --foreground
|  |                           |  |
|  |   '백종원 김치찌개'가       |  |  <- text-base, --text-2
|  |   레시피북에 저장됐어요     |  |
|  |                           |  |
|  |  ┌───────────────────┐   |  |
|  |  |   이 끼니에 추가    |   |  |  <- --brand bg, white text
|  |  └───────────────────┘   |  |     --radius-sm, 48px
|  |                           |  |
|  |  ┌───────────────────┐   |  |
|  |  |   레시피 상세 보기  |   |  |  <- --surface bg, --olive text
|  |  └───────────────────┘   |  |     --line border, --radius-sm
|  |                           |  |
|  |  ┌───────────────────┐   |  |
|  |  |       닫기         |   |  |  <- text-only, --text-2
|  |  └───────────────────┘   |  |
|  |                           |  |
|  └───────────────────────────┘  |
|                                 |
└─────────────────────────────────┘
```

### 끼니 추가 인분 입력 (Step 4 선택 경로)

```
┌─────────────────────────────────┐
|                            [x]  |  <- icon-only close
|  이 끼니에 추가                  |  <- text-lg, weight-700, --foreground
|  계획 인분을 정해주세요          |  <- text-sm, --text-2
|                                 |
|  ┌─────────────┐               |
|  |  [-]  2  [+] |               |  <- stepper, --brand
|  |       인분    |               |     숫자: text-2xl, "인분": text-sm --text-3
|  └─────────────┘               |
|                                 |
|  ┌───────────────────────────┐  |
|  |          추가              |  |  <- --brand bg, white text
|  └───────────────────────────┘  |     --radius-sm, 48px
|                                 |
└─────────────────────────────────┘
```

---

## 컴포넌트 상세

### AppBar (상단 앱바)
- **기본 상태**:
  - 왼쪽: 뒤로 버튼 (44x44px) -> MENU_ADD 복귀
  - 중앙: "유튜브 레시피 가져오기" (text-lg, weight-700, --foreground)
  - 오른쪽: Step 3에서만 [등록] 버튼 (--brand, text-base, weight-600)
- **비활성**: 필수 필드 미입력 시 [등록] disabled (--text-4)
- **토큰**: `--surface` 배경, `--shadow-2`, `--brand` CTA

### URL 입력 필드 (Step 1)
- **기본 상태**: placeholder "https://www.youtube.com/watch?v=..."
  - --surface-fill 배경, --radius-sm, 16px 패딩
  - text-base, --foreground
- **포커스**: --olive border (2px)
- **유효하지 않은 URL**: --brand-deep border, 하단 error 텍스트
- **빈 입력**: [가져오기] 버튼 disabled (--text-4 텍스트, --surface-fill bg)
- **토큰**: `--surface-fill`, `--radius-sm`, `--olive` focus, `--brand-deep` error

### [가져오기] 버튼 (Step 1)
- **기본**: --brand bg, white text, --radius-sm, 48px 높이, full-width
- **Disabled**: --surface-fill bg, --text-4 text
- **Loading**: spinner + "확인 중..." 텍스트, --brand bg 유지
- **토큰**: `--brand`, `--brand-deep` pressed, `--radius-sm`

### 비레시피 경고 카드 (Step 1.5)
- **기본**: --brand-soft 배경, --radius-md, --space-4 패딩
- **본문**: 안내 문구 (text-base, --foreground) + 부연 (text-sm, --text-2)
- **토큰**: `--brand-soft`, `--radius-md`

### 추출 진행 카드 (Step 2)
- **기본**: --surface 배경, --radius-lg, --shadow-1, --space-4 패딩
- **단계 행 구성**: 아이콘 (24x24) + 단계명 (text-base) + 상태 텍스트 (text-sm)
  - **완료**: --olive 체크 아이콘, --olive 텍스트
  - **진행중**: --brand 스피너, --brand 텍스트, 로딩 애니메이션
  - **대기중**: --text-4 원형 아이콘, --text-4 텍스트
- **구분선**: --line (1px)
- **진행 바**: --brand 색상, --surface-fill 트랙, --radius-full, 4px 높이
- **토큰**: `--surface`, `--olive`, `--brand`, `--text-4`, `--radius-lg`

### 추출 방식 pill (Step 3)
- **기본**: --olive 배경, white 텍스트, --radius-full, text-xs weight-600
- **수평 배치**: --space-2 간격, flex-wrap
- **표시 항목**: extraction_methods 배열에서 파생 (description, ocr, asr, estimation)
- **토큰**: `--olive`, `--radius-full`

### 재료 리스트 (Step 3, 편집 가능)
- **기본 상태**: 카드 형태, --surface 배경, --line 테두리, --radius-md
- **행 구성**: 재료명 (text-base, --foreground) | 수량+단위 (text-sm, --text-2) | [편집] 아이콘 (44x44)
  - QUANT: 수량+단위 표시 (예: "200g", "2큰술")
  - TO_TASTE: "약간" (--text-3)
- **편집 모드**: 행 클릭 -> 인라인 편집 또는 재료 편집 바텀시트
- **삭제**: 좌 스와이프 -> 삭제 확인 또는 편집 모달에서 [삭제]
- **[+ 재료 추가]**: --olive, --radius-sm, 44px 높이, full-width
- **Empty**: "추출된 재료가 없어요. 직접 추가해주세요" (--muted, text-sm)
- **토큰**: `--surface`, `--line`, `--olive`, `--text-2/3`, `--radius-md`

### 스텝 리스트 (Step 3, 편집 가능)
- **기본 상태**: 카드 형태, --surface 배경, --line 테두리, --radius-md
- **스텝 카드**:
  - 상단: 스텝 번호 + 조리방법 badge (--cook-{method} 색상 배경, white 텍스트, --radius-full, text-xs)
  - 본문: 조리 설명 (text-base, --foreground)
  - 우측: [편집] + [x] 아이콘 (각 44x44)
- **"신규" 조리방법 표시**:
  - 조리방법 badge 옆에 "신규" pill
  - --brand-soft 배경, --brand 텍스트, --radius-full, text-xs weight-600
  - `is_new: true`인 조리방법에만 표시
  - `color_key: "unassigned"` -> 회색 계열 fallback (--cook-gray)
- **[+ 조리 과정 추가]**: --olive, --radius-sm, 44px 높이, full-width
- **Empty**: "추출된 조리 과정이 없어요. 직접 추가해주세요" (--muted, text-sm)
- **토큰**: `--cook-*` 조리방법 색상, `--brand-soft`, `--brand`, `--surface`, `--olive`, `--radius-md/full`

### 등록 완료 카드 (Step 4)
- **구성**: 중앙 정렬 카드, --surface 배경, --radius-lg, --shadow-2
- **체크 아이콘**: 48px, --olive 색상
- **타이틀**: text-xl, weight-800, --foreground
- **부연**: text-base, --text-2
- **CTA 위계**:
  1. **[이 끼니에 추가]**: --brand bg, white text (primary)
  2. **[레시피 상세 보기]**: --surface bg, --olive text, --line border (secondary)
  3. **[닫기]**: text-only, --text-2 (tertiary)
- **토큰**: `--surface`, `--brand`, `--olive`, `--radius-lg`, `--shadow-2`

### 끼니 추가 인분 입력 (바텀시트)
- **형태**: 바텀시트, --radius-xl 상단, --shadow-3
- **헤더**: icon-only close (우측), Quiet Kitchen Sheets 기준
- **제목**: "이 끼니에 추가" (text-lg, weight-700)
- **helper copy**: "계획 인분을 정해주세요" (text-sm, --text-2)
- **Stepper**: 숫자 (text-2xl, --foreground) + "인분" (text-sm, --text-3), [+]/[-] 44x44
- **[추가] CTA**: --brand bg, white text, --radius-sm, 48px, full-width
- **기본값**: 레시피 기본 인분, 최소값 1
- **토큰**: `--brand`, `--radius-xl` 시트, `--radius-sm` 버튼

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | 로그인 필요 |
|------|--------|------|------------|
| 화면 진입 | MENU_ADD -> "유튜브 링크로 추가" | YT_IMPORT Step 1 표시 | Y |
| [뒤로] (Step 1) | AppBar 좌측 | MENU_ADD 복귀 | -- |
| [뒤로] (Step 3) | AppBar 좌측 | "수정 내용이 사라져요" 확인 모달 | -- |
| URL 입력 | 입력 필드 포커스 | 키보드 열림, placeholder 사라짐, --olive focus border | -- |
| URL 붙여넣기 | 클립보드 붙여넣기 | YouTube URL 자동 인식, [가져오기] 활성화 | -- |
| [가져오기] | 버튼 클릭 | POST /recipes/youtube/validate 호출 | Y |
| URL 검증 성공 (레시피) | validate 응답 is_recipe_video=true | Step 2로 자동 전환 + extract 호출 | -- |
| URL 검증 성공 (비레시피) | validate 응답 is_recipe_video=false | Step 1.5 경고 화면 표시 | -- |
| [다시 입력] | Step 1.5 버튼 | Step 1로 복귀, 입력 필드 초기화 | -- |
| [그래도 진행] | Step 1.5 버튼 | Step 2로 전환 + extract 호출 | -- |
| 추출 진행 | extract 호출 중 | Step 2 단계별 progress 표시 | -- |
| 추출 완료 | extract 응답 수신 | Step 3 검수 화면으로 자동 전환 | -- |
| 재료 [편집] | 행 우측 아이콘 | 재료 편집 바텀시트 (검색+수량+단위+타입) | -- |
| 재료 삭제 | 편집 바텀시트 [삭제] | 해당 재료 제거, 재료 수 갱신 | -- |
| [+ 재료 추가] | 버튼 클릭 | 재료 추가 바텀시트 (MANUAL_RECIPE_CREATE와 동일 형태) | -- |
| 스텝 [편집] | 행 우측 아이콘 | 스텝 편집 바텀시트 (조리방법 선택+설명) | -- |
| 스텝 [x] | 행 우측 삭제 아이콘 | 해당 스텝 삭제, 이후 번호 재정렬 | -- |
| [+ 조리 과정 추가] | 버튼 클릭 | 조리 과정 추가 바텀시트 (MANUAL_RECIPE_CREATE와 동일 형태) | -- |
| 조리방법 선택 | 스텝 편집 시 | GET /cooking-methods 기반 칩 목록, 단일 선택 | -- |
| [등록] | AppBar 우측 | POST /recipes/youtube/register 호출 | Y |
| 등록 성공 | register 응답 201 | Step 4 등록 완료 카드 표시 | -- |
| [이 끼니에 추가] | Step 4 CTA | 인분 입력 바텀시트 열림 | Y |
| 인분 [추가] | 바텀시트 CTA | POST /meals 호출, 성공 시 MEAL_SCREEN 복귀 | Y |
| [레시피 상세 보기] | Step 4 secondary | RECIPE_DETAIL 진입 | -- |
| [닫기] | Step 4 tertiary | MENU_ADD 복귀 | -- |

### 스크롤 구조

- **세로 스크롤**:
  - Step 1, 1.5: 스크롤 불필요 (단일 뷰포트 내 수용)
  - Step 2: 스크롤 불필요 (단일 뷰포트 내 수용)
  - Step 3: 전체 페이지 세로 스크롤 (재료+스텝 리스트가 길어질 수 있음)
  - Step 4: 스크롤 불필요 (중앙 카드)
- **가로 스크롤**: 없음 (whole-page horizontal scroll 금지)
- **스크롤 우선순위**:
  1. 모달/바텀시트 (활성 시)
  2. 페이지 본문 (Step 3)
- **스크롤 경계**: 바텀시트 본문과 페이지 본문 명확히 구분

### 키보드 처리

- URL 입력 필드 포커스 시 키보드 열림
- Step 3 인라인 편집 시 키보드 열림
- 키보드가 입력 필드를 가리지 않도록 스크롤 자동 조정 (virtual keyboard inset)

### Step 전환 방식

- Step 간 전환은 같은 페이지 내에서 콘텐츠 교체 (별도 라우트 아님)
- 전환 애니메이션: fade + 약간의 위로 슬라이드 (150ms)
- 브라우저 뒤로가기: 이전 Step으로 복귀 (history state push 활용)

---

## 화면 정의서 매핑

| 정의서 항목 | 구현 여부 | 비고 |
|------------|----------|------|
| 권한: 로그인 필요 | ✅ | 로그인 게이트 + return-to-action |
| Step 1: URL 입력 + [가져오기] | ✅ | POST /recipes/youtube/validate |
| Step 1.5: 레시피 영상 검증 | ✅ | is_recipe_video 판정 분기 |
| [다시 입력] / [그래도 진행] | ✅ | 두 분기 모두 구현 |
| Step 2: 자동 추론 진행 상태 | ✅ | description/ocr/asr/estimation 4단계 |
| extraction_methods 표시 | ✅ | Step 3 상단 olive pill |
| Step 3: 기본 인분 (필수) | ✅ | stepper, 최소값 1 |
| Step 3: 레시피명 (편집 가능) | ✅ | 인라인 텍스트 필드 |
| Step 3: 재료 리스트 (편집 가능) | ✅ | 행별 편집/삭제/추가 |
| Step 3: 스텝 리스트 (편집 가능) | ✅ | 행별 편집/삭제/추가 |
| Step 3: 조리방법 자동 분류 표시 | ✅ | --cook-{method} badge |
| Step 3: 신규 조리방법 "신규" 라벨 | ✅ | --brand-soft pill |
| Step 4: [레시피 등록] | ✅ | POST /recipes/youtube/register |
| Step 4: "이 끼니에 추가" | ✅ | 인분 입력 -> POST /meals |
| 수동 입력은 검수 단계에서만 | ✅ | Step 3에서만 편집 UI 노출 |
| 미분류 조리방법 선택지 활용 | ✅ | extract 응답의 new_cooking_methods 포함 |

---

## 상태별 UI 변형

### 1. Loading (URL 검증 중)

```
┌─────────────────────────────────┐
|  ┌───────────────────────────┐  |
|  |        확인 중...          |  |  <- --brand bg, white text
|  |  [spinner]                 |  |     spinner 좌측
|  └───────────────────────────┘  |     버튼 disabled 상태
└─────────────────────────────────┘
```
- **표시**: [가져오기] 버튼이 로딩 상태로 변환
- **조건**: POST /recipes/youtube/validate 응답 대기 중
- **사용자 조작**: 입력 필드 수정 불가, 뒤로가기만 가능

### 2. Loading (추출 중)

- **표시**: Step 2 전체 화면 (위 와이어프레임 참조)
- **조건**: POST /recipes/youtube/extract 응답 대기 중
- **단계별 상태 표시**: 완료/진행중/대기중 시각 구분

### 3. Empty (추출 결과 부분 비어있음)

```
┌─────────────────────────────────┐
|  재료 (0개)                     |
|  추출된 재료가 없어요            |  <- --muted, text-sm
|  직접 추가해주세요               |
|  [+ 재료 추가]                   |  <- --olive
└─────────────────────────────────┘
```
- **표시**: 섹션별 empty 안내 + CTA
- **조건**: 추출 결과에서 해당 섹션이 비어있을 때
- **재료와 스텝 독립적으로 empty 가능**

### 4. Error (URL 검증 실패)

```
┌─────────────────────────────────┐
|  ┌───────────────────────────┐  |
|  | https://invalid-url       |  |  <- --brand-deep border (2px)
|  └───────────────────────────┘  |
|  올바른 유튜브 URL을 입력해주세요 |  <- --brand text, text-sm
└─────────────────────────────────┘
```
- **표시**: 입력 필드 에러 스타일 + 하단 메시지
- **조건**: 유효하지 않은 URL, 이미 등록된 URL

### 5. Error (추출 실패)

```
┌─────────────────────────────────┐
|                                 |
|  레시피 추출에 실패했어요        |  <- text-xl, weight-800, --foreground
|                                 |
|  서버 오류가 발생했어요          |  <- text-base, --text-2
|  잠시 후 다시 시도해주세요       |
|                                 |
|  ┌───────────────────────────┐  |
|  |        다시 시도            |  |  <- --brand bg, white text
|  └───────────────────────────┘  |
|                                 |
|  ┌───────────────────────────┐  |
|  |      다른 영상 입력         |  |  <- --surface bg, --foreground text
|  └───────────────────────────┘  |     --line border
|                                 |
└─────────────────────────────────┘
```
- **다시 시도**: 같은 URL로 extract 재호출
- **다른 영상 입력**: Step 1로 복귀

### 6. Error (등록 실패)

```
┌─────────────────────────────────┐
|                            [x]  |
|  레시피 등록 실패                |  <- text-lg, --foreground
|                                 |
|  네트워크 오류가 발생했어요      |  <- text-base, --text-2
|  잠시 후 다시 시도해주세요       |
|                                 |
|  [다시 시도]                    |  <- --brand CTA
|  [닫기]                        |
└─────────────────────────────────┘
```
- **조건**: POST /recipes/youtube/register 500 또는 네트워크 오류
- **다시 시도**: 동일 payload로 register 재호출

### 7. Unauthorized (비로그인 화면 진입)

```
┌─────────────────────────────────┐
|  <- 뒤로   유튜브 레시피 가져오기   |
├─────────────────────────────────┤
|                                 |
|                                 |
|  로그인이 필요해요               |  <- text-xl, weight-800, --foreground
|                                 |
|  유튜브 레시피를 가져오려면       |  <- text-base, --text-2
|  로그인이 필요해요               |
|                                 |
|  ┌───────────────────────────┐  |
|  |         로그인              |  |  <- --brand bg, white text
|  └───────────────────────────┘  |
|                                 |
|  ┌───────────────────────────┐  |
|  |          취소               |  |  <- --surface bg, --foreground text
|  └───────────────────────────┘  |     --line border
|                                 |
└─────────────────────────────────┘
```
- **[로그인]**: LOGIN 화면 이동
- **[취소]**: MENU_ADD 복귀
- **return-to-action**: 로그인 성공 후 YT_IMPORT Step 1 자동 진입

---

## 디자인 결정 사항

### 1. 화면 형태: Full Page (multi-step)
- **이유**: 유튜브 레시피 등록은 URL 입력 -> 검증 -> 추출 -> 검수 -> 등록의 다단계 흐름이며, 독립적인 맥락 전환이 필요하다. Modal/Sheet로는 Step 3의 긴 검수 내용을 수용할 수 없다.
- **출처**: `mobile-ux-rules.md` S6

### 2. Step 전환: 같은 페이지 내 콘텐츠 교체
- **이유**: 각 Step은 이전 Step의 결과에 의존하는 순차 흐름이다. 별도 라우트 대신 같은 페이지 내에서 콘텐츠를 교체하면 컨텍스트 전환 비용이 낮고, history state로 뒤로가기를 지원한다.
- **출처**: 화면정의서 S10 "UI 흐름" (단일 화면 내 Step 1~4)

### 3. Step 2 진행 표시: 4단계 vertical list
- **이유**: 추출 파이프라인이 description -> ocr -> asr -> estimation 순서로 진행되므로, 사용자에게 현재 진행 상태와 전체 맥락을 함께 보여준다. 단순 progress bar보다 상세하지만 불필요하게 복잡하지 않다.
- **출처**: 요구사항 S2-4, 화면정의서 S10 "extraction methods 표시 가능"

### 4. Step 3 AppBar 우측 [등록] 배치
- **이유**: 검수 화면은 스크롤이 길어질 수 있다. CTA를 하단 고정 대신 AppBar 우측에 두면 항상 접근 가능하면서도 실수 등록을 방지한다. MANUAL_RECIPE_CREATE의 [저장]과 동일한 패턴이다.
- **출처**: `mobile-ux-rules.md` S3 (Primary CTA는 첫 화면에서 읽혀야 한다)

### 5. "신규" 조리방법 표시: pill badge
- **이유**: 추출 과정에서 새로 생성된 조리방법(is_new: true)은 기존 seed 조리방법과 시각적으로 구분이 필요하다. --brand-soft 배경 + --brand 텍스트 pill로 주의를 끌되 과도하지 않게 처리한다.
- **출처**: 화면정의서 S10 "'신규' 또는 유사한 라벨로 구분 가능"

### 6. 비레시피 경고 (Step 1.5): 전체 화면 경고
- **이유**: 이 판정은 사용자가 의식적으로 결정해야 하는 분기점이다. 토스트나 인라인 경고로는 무시될 위험이 있으므로 전체 화면으로 안내한다. 영상 썸네일+제목을 함께 표시해 사용자가 올바른 영상인지 확인할 수 있게 한다.
- **출처**: 요구사항 S2-4 "안내 후 [다시 입력] / [그래도 진행] 선택지 제공"

### 7. 재료/스텝 편집: MANUAL_RECIPE_CREATE와 동일한 바텀시트 패턴
- **이유**: 직접 등록과 유튜브 등록의 편집 UI를 통일하면 학습 비용이 줄고 컴포넌트 재사용이 가능하다. H5 Quiet Kitchen Sheets 기준을 적용한다.
- **출처**: 화면정의서 S10, MANUAL_RECIPE_CREATE 디자인 스펙

### 8. 등록 완료 후 3가지 선택지
- **이유**: "이 끼니에 추가"는 플래너 흐름 복귀 (빠른 경로), "레시피 상세 보기"는 저장/좋아요/공유 등 추가 작업 (유연한 경로), "닫기"는 단순 복귀. 사용자에게 맥락에 맞는 선택지를 제공한다.
- **출처**: MANUAL_RECIPE_CREATE 등록 완료 모달 패턴과 일관성

### 9. Baemin vocabulary/material 사용
- **이유**: h8 matrix에서 `prototype-derived design`으로 분류. Baemin vocabulary/material/tokens 사용하되 near-100% parity 타겟이 아니다. --brand, --olive, --surface 등 기존 토큰 시스템과 조화를 이룬다.
- **출처**: h8 workpack, `BAEMIN_STYLE_DIRECTION.md`

### 10. anchor screen이 아님
- YT_IMPORT는 MENU_ADD에서 진입하는 독립 화면이다.
- HOME, RECIPE_DETAIL, PLANNER_WEEK 같은 anchor screen을 직접 수정/확장하지 않는다.
- 단, MEAL_SCREEN으로의 복귀 흐름과 POST /meals 호출은 기존 계약을 그대로 따른다.

---

## API 매핑

| Step | API | Method | 비고 |
|------|-----|--------|------|
| 1 -> 1.5 | /recipes/youtube/validate | POST | URL 검증 + 레시피 영상 판별 |
| 1.5 -> 2 | /recipes/youtube/extract | POST | 자동 추출 (description, ocr, asr, estimation) |
| 3 -> 4 | /recipes/youtube/register | POST | 검수 결과 기반 레시피 등록 |
| 4 | /meals | POST | 끼니 추가 (계획 인분 입력) |
| Step 3 모달 | /cooking-methods | GET | 조리방법 목록 (칩 선택용) |

---

## 320px sentinel 대응

| 요소 | 375px | 320px | 비고 |
|------|-------|-------|------|
| AppBar 제목 | "유튜브 레시피 가져오기" | 말줄임 또는 "유튜브 가져오기" | 가변 폭 대응 |
| URL 입력 필드 | 좌우 --space-4 여백 | 좌우 --space-3 여백 | 여백만 축소 |
| [가져오기] 버튼 | full-width | full-width | 변동 없음 |
| 추출 단계명 | 풀 텍스트 | 약어 가능 ("화면 텍스트" -> "OCR") | 1행 유지 |
| 재료 행 | 재료명 + 수량 + [편집] | 재료명 말줄임 + 수량 + [편집] | 터치 타겟 44px 유지 |
| 스텝 카드 badge | 풀 조리방법명 | 풀 조리방법명 | 줄바꿈 허용 |
| "신규" pill | badge 옆 표시 | badge 아래 줄바꿈 | 읽기 가능 유지 |

---

## design-critic 검토 필요 항목

- [ ] Step 2 추출 진행 시간이 길 때 (30초 이상) 사용자 이탈 방지 UX 충분한지 확인
- [ ] Step 3 재료/스텝 리스트가 매우 길 때 (20개 이상) 스크롤 경험 확인
- [ ] Step 3 [등록] 버튼이 AppBar 우측에 있을 때 320px에서 잘리지 않는지 확인
- [ ] 재료 편집 바텀시트 내부 검색 리스트 스크롤이 페이지 스크롤과 간섭하지 않는지 확인
- [ ] 비레시피 경고 (Step 1.5) 썸네일 이미지 로딩 실패 시 fallback 처리
- [ ] 조리방법 badge 색상이 COOK_MODE와 일관성 있는지 확인 (--cook-* 토큰)
- [ ] "신규" 조리방법의 color_key "unassigned" fallback이 회색 계열로 올바르게 적용되는지 확인
- [ ] Step 전환 시 브라우저 뒤로가기 history state가 올바르게 동작하는지 확인
- [ ] 등록 완료 후 [이 끼니에 추가] -> POST /meals 실패 시 에러 처리 확인
- [ ] 추출 중 네트워크 끊김 시 timeout/retry UX 확인
- [ ] 키보드 열림 시 Step 1 URL 입력 필드가 가려지지 않는지 확인 (특히 320px)
- [ ] Step 3에서 base_servings가 null로 추출된 경우 사용자에게 필수 입력 강조 확인
