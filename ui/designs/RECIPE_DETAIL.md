# RECIPE_DETAIL — 레시피 상세

> 기준 문서: 화면정의서 v1.2.3 §3 / 요구사항기준선 v1.6.3 §1-2 / 유저flow맵 v1.2.3 / design-tokens C2 명랑한 주방
> 생성일: 2026-03-21

---

## 레이아웃 와이어프레임

### 기본 화면

```
┌─────────────────────────────────────┐  ← 375px 모바일 기준
│  HOMECOOK                           │  ← 공통 브랜드 헤더 (AppHeader)
├─────────────────────────────────────┤
│                                     │
│   ┌─────────────────────────────┐   │
│   │                             │   │  ← 미디어 영역 (aspect-ratio 16:9)
│   │   썸네일 이미지 / 그라데이션 │   │    thumbnail_url 있으면 cover
│   │   hero fallback              │   │    없으면 gradient hero
│   │                             │   │
│   └─────────────────────────────┘   │
│                                     │
│  ┌───────────────────────────────┐  │  ← --surface 카드 영역 (패딩 --space-4)
│  │  Home / Recipe detail         │  │    ← breadcrumb
│  │  [#한식] [#국물] [#초간단]     │  │    ← tag row
│  │  된장찌개                     │  │    ← title
│  │  2인분 · 재료 8개 · 조리 5단계 │  │    ← overview meta
│  │                               │  │
│  │  [플래너 24] [공유] [좋아요]   │  │    ← compact utility row
│  │  [저장]                       │  │
│  │                               │  │
│  │  설명 카피                    │  │    ← helper copy
│  │                               │  │
│  │  [플래너에 추가] [요리하기]    │  │    ← primary CTA row
│  └───────────────────────────────┘  │
│                                     │
│  ─────── 재료 ─────────────────────  │  ← --line 구분선
│  두부                   150g        │  ← --foreground text-sm
│  된장                   2큰술       │
│  소금     적당히                    │  ← --muted italic (TO_TASTE)
│  청양고추  1개       [옵션]         │  ← [옵션] 배지: --muted bg, text-xs
│                                     │
│  ─────── 조리 단계 ────────────────  │  ← --line 구분선
│  ┌───────────────────────────────┐  │
│  │  ① [썰기]                    │  │  ← StepCard: --surface, border-radius 16px
│  │     두부를 적당한 크기로 썰기  │  │    조리방법 배지 색상: 토큰 테이블 참조
│  │     [두부 150g]               │  │    사용재료 칩: --line border
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  ② [끓이기]  🔥🔥  ⏱ 10분   │  │  ← 끓이기: #E8453C 배지
│  │     된장과 물 넣고 끓이기      │  │
│  │     [된장 2큰술] [물 400ml]   │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

---

## 컴포넌트 상세

### 1. 공통 브랜드 헤더

- 상단은 `AppShell`의 공통 `AppHeader`를 사용한다.
- `HOMECOOK` 로고는 `/` 링크이며, HOME / PLANNER_WEEK / RECIPE_DETAIL이 동일한 top shell을 공유한다.
- 화면 안쪽 breadcrumb(`Home / Recipe detail`)은 현재 위치 안내용이고, 별도 플로팅 back/share header는 두지 않는다.

### 2. 미디어 영역

- **기본 상태 (thumbnail_url 있음)**: cover image hero, object-cover
- **기본 상태 (thumbnail_url 없음)**: brand/olive 계열 gradient hero fallback
- **Empty (미디어 없음)**: gradient hero fallback을 유지하고 별도 빈 미디어 박스를 만들지 않는다
- **Loading**: 전체 영역 스켈레톤 (aspect-video 비율 유지, 배경 --line 펄스 애니메이션)

### 3. 레시피 overview 영역

- **기본 상태**: breadcrumb → 태그 → 제목 → overview meta → utility metrics row → helper copy → primary CTA row
- **overview meta**: `기본 인분 / 재료 수 / 조리 단계 수`를 한 줄 메타로 압축
- **utility metrics row**: `플래너 등록수 / 공유 / 좋아요 / 저장`을 full-width 4등분 박스가 아니라 compact wrap row로 배치
- **tone 분리**: 좋아요 활성 상태는 `요리하기` CTA와 같은 brand tone을 피하고 별도 signal tone으로 구분
- **primary CTA row**: `[플래너에 추가]`, `[요리하기]` 두 개를 균형 있는 2열 row로 분리
- **Loading**: 제목 스켈레톤 2줄, 태그 칩 스켈레톤 3개, utility row 스켈레톤, CTA row 스켈레톤
- **태그 없음**: 태그 행 비노출 (여백 유지 없이 제거)
- **지표**: compact row 기준 `플래너등록수 / 공유 / 좋아요수 / 저장수`

### 4. 인분 조절 (ServingStepper)

- **기본 상태 (로그인 무관)**: [-] N인분 [+] — 인분 변경 즉시 재료량 실시간 갱신
- **최솟값**: 1인분 ([-] 버튼 1인분에서 비활성, --muted 색)
- **최댓값**: 99인분
- **표시 포맷**: `N인분` (N은 현재 선택 인분 수)
- **재료량 계산**: `표시 수량 = (원본 수량 / base_servings) × currentServings`, 소수점 0.5 단위 반올림, 1 미만 분수 표기(1/2, 1/4)
- **요리모드 진입 전 이 값이 COOK_MODE 기본 인분으로 전달됨**

### 5. 액션 위계

- **primary row**: `[플래너에 추가]`(olive), `[요리하기]`(brand)
- **secondary utility row**: 공유, 좋아요, 저장, planner count
- **좋아요/저장**: compact metric action으로 유지, 비로그인 시에도 시각적으로 동일하게 노출하고 탭 시 로그인 게이트 모달
- **공유**: utility row 안에서 1회만 노출한다

### 6. 재료 리스트

- **기본 상태**: 재료명 + 수량+단위 좌우 배치, --line 구분선
- **TO_TASTE (적당히)**: 재료명 옆에 `취향껏` helper badge를 함께 두고, 수량 영역에는 `적당히`를 일반 muted보다 한 단계 또렷하게 표시
- **옵션 재료**: [옵션] 배지 — text-xs, --muted 배경, --muted 텍스트, border-radius 9999px
- **인분 연동**: 인분 조절 시 QUANT 타입 수량 즉시 업데이트, TO_TASTE는 변경 없음
- **Loading**: 재료 행 스켈레톤 5줄
- **Empty**: "재료 정보가 없어요" --muted 텍스트 (중앙 정렬)

### 7. 스텝 리스트 (StepCard)

- **기본 상태**: 카드(--surface, border-radius 16px, box-shadow 0 2px 10px rgba(0,0,0,0.08)), 스텝 번호 원(--foreground 배경, white 텍스트), 조리방법 배지(색상 토큰 참조), instruction 텍스트(text-sm, --foreground), 사용재료 칩(--line border, text-xs), 불세기/시간 부가정보(--muted, text-xs)
- **조리방법 배지 색상**: 디자인 토큰 요리모드 색상 테이블 동일 적용

| 조리방법 | 배지 색상 |
|---------|----------|
| 볶기/볶아주기 | `#FF8C42` |
| 끓이기/국물 | `#E8453C` |
| 굽기/오븐/구이 | `#8B5E3C` |
| 찌기/스팀 | `#4A90D9` |
| 튀기기 | `#F5C518` |
| 데치기 | `#7BC67E` |
| 무치기/버무리기 | `#2ea67a` (--olive) |
| 섞기/준비/기타 | `#AAAAAA` |

- **Loading**: 카드 스켈레톤 3개 (높이 가변)
- **Empty**: "조리 단계 정보가 없어요" --muted 텍스트

---

## 모달 / 오버레이

### 로그인 게이트 모달

```
┌─────────────────────────────────────┐
│  ░░░░░░░░ dim (bg rgba 0,0,0,0.50) ░│
│  ░░┌─────────────────────────────┐░░│
│  ░░│                             │░░│  ← --panel 배경
│  ░░│  이 기능은 로그인이 필요해요  │░░│    border-radius 20px
│  ░░│                             │░░│    padding --space-6
│  ░░│  좋아요, 저장, 플래너 추가는 │░░│
│  ░░│  로그인 후 이용할 수 있어요  │░░│    text-sm --foreground
│  ░░│                             │░░│
│  ░░│  ┌─────────────────────────┐│░░│
│  ░░│  │        로그인           ││░░│  ← --brand 배경, white 텍스트
│  ░░│  └─────────────────────────┘│░░│    border-radius 12px, h-12
│  ░░│                             │░░│
│  ░░│  ┌─────────────────────────┐│░░│
│  ░░│  │        취소             ││░░│  ← --line border, --foreground 텍스트
│  ░░│  └─────────────────────────┘│░░│    border-radius 12px, h-12
│  ░░│                             │░░│
│  ░░└─────────────────────────────┘░░│
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────┘
```

- 닫기: [취소] 버튼, ESC 키, 배경(dim) 클릭
- [로그인] → LOGIN 화면으로 이동, `returnToAction` 파라미터 전달 (예: `planner_add`, `like`, `save`)
- 로그인 성공 후 `returnToAction` 에 따라 해당 액션 자동 실행 (1회 소비 후 제거)
- modal 헤더는 shared state shell 기준에 맞춰 eyebrow pill("보호된 작업") + title + 복귀 안내 카드 구조를 유지한다.

### PlannerAddPopup (플래너 추가 바텀시트)

```
┌─────────────────────────────────────┐
│  ░░░░░░░░ dim ░░░░░░░░░░░░░░░░░░░░░│
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│  ┌─────────────────────────────────┐│  ← --panel 배경, border-radius 20px (상단)
│  │  플래너에 추가              (x) ││    eyebrow 없음, icon-only close
│  │  날짜와 끼니를 선택해 주세요    ││    helper copy 1줄
│  │─────────────────────────────────││    ← --line 구분선
│  │                                 ││
│  │  날짜                            ││
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐    ││
│  │  │ 금 │ │ 토 │ │ 일 │ │ 월 │    ││
│  │  │4/17│ │4/18│ │4/19│ │4/20│    ││    selected: --olive fill
│  │  └────┘ └────┘ └────┘ └────┘    ││    orange는 today/tiny hint에만
│  │                                 ││
│  │  끼니                            ││
│  │  [아침] [점심] [간식] [저녁]      ││
│  │                                 ││
│  │  계획 인분                        ││
│  │  [ - ]      2  인분      [ + ]   ││    숫자/단위 hierarchy 분리
│  │                                 ││
│  │  [취소]          [플래너에 추가] ││    primary=olive base
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

- 닫기: 배경(dim) 클릭, icon-only close 버튼
- 날짜 chip 표기: `요일 + 4/17`
- 선택 날짜 확인: 별도 문장 라벨 없이 활성 날짜 칩 상태로만 확인
- 성공: 팝업 닫기 → 토스트 "`N월 D일 끼니에 추가됐어요`"
- 오류: 토스트 "추가에 실패했어요. 다시 시도해 주세요"

#### Slice06 lock

- 이 바텀시트는 `06-recipe-to-planner`의 기본 입력 surface로 잠근다.
- 필수 입력은 `plan_date`, `column_id`, `planned_servings`이며 `leftover_dish_id`는 사용하지 않는다.
- 비로그인 사용자가 `[플래너에 추가]`를 탭하면 로그인 게이트 후 동일 바텀시트로 return-to-action 복귀해야 한다.
- Stage 4 authority supplement는 아래 증거를 추가로 남긴다.
  - `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile.png`
  - `ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile-narrow.png`

### SavePopup (저장 바텀시트)

```
┌─────────────────────────────────────┐
│  ░░░░░░░░ dim ░░░░░░░░░░░░░░░░░░░░░│
│  ┌─────────────────────────────────┐│  ← --panel 배경, border-radius 20px (상단)
│  │  레시피 저장               (x)  ││    eyebrow 없음, icon-only close
│  │  저장할 레시피북을 선택하세요    ││    helper copy 1줄
│  │─────────────────────────────────││    ← --line 구분선
│  │                                 ││
│  │  ○  저장한 레시피                ││    ← 라디오: 미선택 --line border
│  │─────────────────────────────────││      선택: --olive 배경+border
│  │  ○  나의 레시피북 A              ││
│  │─────────────────────────────────││
│  │  ●  나의 레시피북 B  [저장됨]    ││    ← [저장됨] 배지: --olive/10 bg, --olive 텍스트
│  │─────────────────────────────────││
│  │                                 ││
│  │  [+]  새 레시피북 만들기         ││    neutral surface + tiny orange 포인트
│  │                                 ││
│  │  ┌─────────────────────────────┐││    ← --olive 배경 (선택 시)
│  │  │           저장              │││      비활성(미선택): --muted 배경
│  │  └─────────────────────────────┘││    border-radius 12px
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

- 필터: `book_type === 'saved'` 또는 `'custom'`만 노출. `my_added`, `liked` 제외
- [+ 새 레시피북 만들기] → 인라인 입력 → `POST /recipe-books`
- 영어 eyebrow `Save Recipe`는 사용하지 않음
- 선택 row는 olive tint family 사용
- 성공: 팝업 닫기 → 토스트 "저장됐어요"

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | 로그인 필요 |
|------|--------|------|------------|
| 화면 진입 | 라우팅 | `GET /recipes/{id}` 호출, 레시피 데이터 로드 | N |
| 홈 복귀 | 공통 브랜드 헤더 `HOMECOOK` 탭 | `/` 이동 | N |
| 공유 | [공유] 탭 | Web Share API 호출 → 실패 시 링크 클립보드 복사 + 토스트 | N |
| 인분 조절 | [-][+] 탭 | currentServings 업데이트 → 재료량 실시간 재계산 | N |
| 요리하기 | [요리하기] 탭 | COOK_MODE 진입 (mode='standalone', recipe_id, servings=currentServings) | N |
| 플래너 추가 (로그인) | [플래너 추가] 탭 | `GET /planner` 호출 → PlannerAddPopup 오픈 | Y |
| 플래너 추가 (비로그인) | [플래너 추가] 탭 | 로그인 게이트 모달 (returnToAction: 'planner_add') | Y |
| 좋아요 (로그인) | [좋아요] 탭 | 낙관적 isLiked 토글 + like_count ±1 즉시 반영 → `POST /recipes/{id}/like` → 실패 시 롤백 + 토스트 | Y |
| 좋아요 (비로그인) | [좋아요] 탭 | 로그인 게이트 모달 (returnToAction: 'like') | Y |
| 저장 (로그인) | [저장] 탭 | `GET /recipe-books?type=saved,custom` → SavePopup 오픈 | Y |
| 저장 (비로그인) | [저장] 탭 | 로그인 게이트 모달 (returnToAction: 'save') | Y |
| 플래너 추가 확정 | PlannerAddPopup [플래너에 추가] | `POST /meals` → 팝업 닫기 → `N월 D일 끼니에 추가됐어요` 토스트 | Y |
| 저장 확정 | SavePopup [저장] | `POST /recipes/{id}/save` → 팝업 닫기 → 토스트 | Y |
| 로그인 게이트 닫기 | [취소] / ESC / dim 클릭 | 모달 닫기, 현재 화면 유지 | — |

---

## 상태별 화면

### Loading 상태

```
┌─────────────────────────────────────┐
│  HOMECOOK                           │  ← 공통 브랜드 헤더
│  ┌─────────────────────────────────┐│
│  │  ████████████████████████████  ││  ← 미디어 영역 스켈레톤 (aspect-video)
│  │  ████████████████████████████  ││    --line 펄스 애니메이션
│  │  ████████████████████████████  ││
│  └─────────────────────────────────┘│
│  ████████████████     (breadcrumb)   │
│  ████████████████     (제목)         │  ← 2줄 스켈레톤
│  ████████████████████████            │
│  ██████ █████ ████    (태그 칩)       │  ← 3개 스켈레톤
│  ████████████████████ (utility row)  │
│                                     │
│  ─── 인분 스켈레톤 ────────────────  │
│                                     │
│  ████████████████ ████████████       │  ← primary CTA row skeleton
│                                     │
│  ████ ████████   (재료 5줄)          │
│  ████ ████████                      │
│  ████ ████████                      │
│  ████ ████████                      │
│  ████ ████████                      │
│                                     │
│  ┌─────────┐ ┌─────────┐           │  ← 스텝 카드 스켈레톤 3개
│  │ ████    │ │ ████    │           │
│  │ ████    │ │ ████    │           │
│  └─────────┘ └─────────┘           │
└─────────────────────────────────────┘
```

### Error 상태

- `RECIPE_DETAIL` fetch error는 shared `ContentState` shell을 사용한다.
- eyebrow pill + headline + 설명 + [다시 시도] CTA 구조를 HOME / PLANNER와 맞춘다.

```
┌─────────────────────────────────────┐
│  HOMECOOK                           │  ← 공통 브랜드 헤더
│                                     │
│                                     │
│             (아이콘)                 │  ← 오류 일러스트 또는 아이콘 (--muted)
│                                     │
│      레시피를 불러오지 못했어요       │  ← text-base, --foreground, 중앙 정렬
│                                     │
│      잠시 후 다시 시도해 주세요       │  ← text-sm, --muted, 중앙 정렬
│                                     │
│  ┌─────────────────────────────┐   │
│  │         다시 시도           │   │  ← --brand 배경, white 텍스트
│  └─────────────────────────────┘   │    border-radius 12px, h-12
│                                     │
└─────────────────────────────────────┘
```

---

## 화면 정의서 매핑

| 정의서 항목 | 구현 여부 | 비고 |
|------------|----------|------|
| 미디어 (영상/이미지) | ✅ | youtube_url 우선 → 썸네일 → 플레이스홀더 3단계 |
| 제목 + 태그(AI 자동 생성) | ✅ | 태그 칩 --olive 계열 |
| 지표: 조회수/좋아요/저장/플래너등록/요리완료 수 | ⚠️ | 현재 구현은 compact utility row 중심으로 `플래너/공유/좋아요/저장`을 강조한다. 상세 지표 재배치는 후속 계약 정리 대상 |
| 인분 조절 스테퍼 | ✅ | 재료량 실시간 반영, 요리모드 진입 전 확정값 전달 |
| 요리모드에서 인분 조절 불가 | ✅ | 이 화면에서 설정 후 COOK_MODE 진입, 해당 화면에서는 스테퍼 비노출 (Out of Scope 확인) |
| [공유] 버튼 | ✅ | utility row에서 1회 노출, Web Share → 실패 시 링크 복사 |
| [플래너에 추가] 버튼 (로그인 필요) | ✅ | 비로그인 → 로그인 게이트 모달 |
| [좋아요] 버튼 (로그인 필요, 토글) | ✅ | 낙관적 업데이트, 비로그인 → 로그인 게이트 모달 |
| [저장] 버튼 (로그인 필요) | ✅ | saved/custom 북만 노출, 비로그인 → 로그인 게이트 모달 |
| [요리하기] 버튼 (비로그인 가능) | ✅ | COOK_MODE 진입 (이 슬라이스 Out of Scope: COOK_MODE 화면 자체) |
| 재료 리스트 (인분 반영) | ✅ | QUANT 실시간 반영, TO_TASTE italic --muted, 옵션 배지 |
| 스텝 리스트 | ✅ | StepCard, 조리방법 색상 배지, 불세기/시간 부가정보 |
| 비로그인 시 버튼 노출 (비활성화 X) | ✅ | 탭 시 로그인 게이트 모달 |
| 로그인 게이트 모달 | ✅ | return-to-action 포함 |
| 저장 가능 레시피북: saved/custom 만 | ✅ | my_added, liked 제외 |
| Loading 상태 | ✅ | 스켈레톤 전체 화면 |
| Error 상태 | ✅ | "레시피를 불러오지 못했어요" + [다시 시도] |

---

## 디자인 결정 사항

1. **공통 브랜드 헤더 사용**: `RECIPE_DETAIL`도 HOME / PLANNER_WEEK와 동일한 `AppHeader`를 사용한다. 별도의 플로팅 back/share header는 두지 않는다.

2. **액션 위계 분리**: 공유/좋아요/저장/플래너 count는 compact utility row로, `[플래너에 추가]`와 `[요리하기]`는 primary CTA row로 분리한다. 현재 구현 기준은 “모든 액션을 동일한 무게의 5등분 버튼으로 두지 않는다” 쪽이다.

3. **인분 조절 영역 위치**: overview block 아래 별도 재료 섹션에서 유지한다. recipe overview와 재료 계산 행동을 분리해 가독성을 높인다.

4. **저장/플래너/요리 CTA 토큰**: 저장/플래너 계열은 `--olive`, 요리하기는 `--brand`를 사용한다. 저장 행동이 메인 CTA보다 한 단계 낮은 tone을 유지한다.

5. **breadcrumb 유지**: `Home / Recipe detail` breadcrumb는 현재 화면 위치 안내용이며, 상단 shared header와 별도로 유지한다.

---

## design-critic 검토 필요 항목

- [x] 액션 위계: compact utility row + primary CTA row 구조로 현재 구현 기준 확정
- [x] 공유 버튼 중복 처리 방안: utility row 1회 노출로 정리
- [ ] 좋아요 활성 색: --brand(#FF6C3C) 사용 시 요리하기 버튼과 색상 구분 명확성 확인
- [ ] 인분 조절 영역 최솟값 1인분 하드캡이 레시피 유형(예: 파티 요리 최소 10인분)에 적절한지 검토
- [ ] 스텝 카드 조리방법 배지가 한 스텝에 여러 조리방법 존재할 경우 표현 방식
- [x] 모바일 375px 기준 버튼 5개 가로 배치 시 레이블 잘림 여부 — compact utility row + 2-button CTA row 구조로 해결
- [ ] 재료 리스트 TO_TASTE italic 처리가 접근성(읽기 어려움) 기준 충족하는지 확인

---

## Baemin-Style Visual Retrofit Addendum

> 추가일: 2026-04-27
> 관련 슬라이스: `baemin-style-recipe-detail-retrofit`
> 선행 슬라이스: `baemin-style-shared-components` (merged), `baemin-style-token-values` (merged), `baemin-style-home-retrofit` (merged), `h5-modal-system-redesign` (merged)
> 프로토타입 참조: `ui/designs/prototypes/baemin-redesign/HANDOFF.md` §RECIPE_DETAIL — **REFERENCE ONLY**. 공식 문서 및 workpack이 프로토타입과 충돌 시, 공식 문서/workpack이 우선한다.

### 목적

RECIPE_DETAIL의 기존 정보 구조(overview, utility metrics, primary CTA, 재료, 조리 단계)를 **그대로 보존**하면서, 승인된 배민 스타일 토큰(`--brand` #ED7470, `--brand-deep` #C84C48, `--brand-soft` #FDEBEA)과 additive 토큰(`--text-2/3/4`, `--surface-fill/subtle`, `--shadow-1/2/3`, `--radius-*`)으로 시각적 레이어를 교체한다. `COOKING_METHOD_TINTS`의 hardcoded rgba를 `--cook-*` 토큰에서 `color-mix()`로 파생한다. PlannerAddSheet, SaveModal, LoginGateModal의 H5 modal chrome 결정을 보존한다.

### 핵심 원칙: 구조 보존, 시각 교체

```
RECIPE_DETAIL 정보 구조 (변경 없음)     배민 스타일 시각 레이어 (교체 대상)
─────────────────────────────────     ─────────────────────────────────
Hero gradient                    →    color-mix() brand/olive 파생
Thumbnail overlay                →    color-mix() foreground 파생
Overview card (glass-panel)      →    토큰 기반 panel/border/shadow
Tag chips                        →    color-mix() olive 파생
Utility metrics row              →    color-mix() tone 파생 (brand/olive/signal)
Action buttons                   →    color-mix() tone 파생 + 토큰 shadow
Description text                 →    토큰 기반 text color
Primary CTA row                  →    토큰 기반 olive/brand tone
Serving stepper                  →    토큰 기반 surface/border/shadow
Ingredient list                  →    토큰 기반 surface, color-mix() 배지
Step cards                       →    토큰 기반 surface, color-mix() cook tint
  - 조리방법 배지                →    COOKING_METHOD_TINTS → color-mix()
  - 스텝 번호 원                 →    토큰 유지 (--foreground bg)
Loading skeleton                 →    Skeleton primitive / 토큰 기반
Feedback toasts                  →    color-mix() tone + 토큰 shadow
PlannerAddSheet                  →    토큰 기반 modal chrome (H5 보존)
SaveModal                        →    토큰 기반 modal chrome (H5 보존)
LoginGateModal                   →    토큰 기반 modal chrome
```

### 컴포넌트별 리트로핏 델타 테이블

| 컴포넌트 | 현행 스타일 | 리트로핏 대상 | 비고 |
| --- | --- | --- | --- |
| **Hero gradient** | `rgba(255,108,60,0.22)`, `rgba(255,249,242,0.78)`, `rgba(46,166,122,0.18)` | `color-mix()` brand/background/olive 파생 | HOME RecipeCard 패턴 적용 |
| **Thumbnail overlay** | `rgba(26,26,46,0.08)`, `rgba(26,26,46,0.32)` | `color-mix(in srgb, var(--foreground) 8%, transparent)` 등 | HOME RecipeCard 패턴 적용 |
| **Overview card** | `glass-panel rounded-[24px]` | `bg-[var(--panel)] border-[var(--line)] shadow-[var(--shadow-2)] rounded-[var(--radius-xl)]` | `glass-panel` 제거 |
| **Tag chips** | `bg-[color:rgba(46,166,122,0.1)]` | `bg-[color-mix(in_srgb,var(--olive)_10%,transparent)]` | olive 유지 |
| **Utility metrics row** | `getRecipeActionToneClass()` — hardcoded rgba for brand/olive/signal/neutral | 각 tone을 `color-mix()` 기반으로 교체 | 4개 tone variant 전부 |
| **ActionButton (brand)** | `border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.12)]` | `color-mix()` brand 파생 | |
| **ActionButton (olive)** | `border-[color:rgba(46,166,122,0.22)] bg-[var(--olive)] text-white` | `text-[var(--surface)]`, border `color-mix()` | |
| **ActionButton (signal)** | `border-[color:rgba(210,78,78,0.18)] bg-[color:rgba(210,78,78,0.1)] text-[#b44949]` | `color-mix()` 파생 + 토큰 텍스트 | 좋아요 active tone |
| **ActionButton (neutral)** | `border-[var(--line)] bg-white` | `bg-[var(--surface)]` | `bg-white` 제거 |
| **Count pill** | `bg-white/72` | `bg-[var(--surface-fill)]` 또는 `color-mix()` surface | |
| **Description text** | `text-[color:rgba(74,74,74,0.78)]` | `text-[var(--text-3)]` 또는 `color-mix()` 파생 | hardcoded rgba 제거 |
| **Serving stepper area** | `bg-white/70 rounded-[16px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-lg)]` | |
| **Stepper buttons** | `bg-white rounded-[12px]` | `bg-[var(--surface)] rounded-[var(--radius-md)]` | |
| **Stepper helper text** | `text-[#9a3f1d]` | `color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))` 또는 `--text-2` | hardcoded hex 제거 |
| **Ingredient rows** | `bg-white/70 rounded-[16px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-lg)]` | |
| **"취향껏" badge** | `border-[color:rgba(224,80,32,0.16)] bg-[color:rgba(255,108,60,0.08)] text-[#a14b27]` | `color-mix()` brand 파생 | |
| **TO_TASTE quantity** | `text-[#7c4a32]` | `color-mix()` brand-deep 파생 또는 `--text-2` | hardcoded hex 제거 |
| **Step cards** | `bg-white/70 rounded-[16px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-lg)]` | |
| **Step number circle** | `bg-[var(--foreground)] text-white` | `text-[var(--surface)]` | `text-white` 제거 |
| **COOKING_METHOD_TINTS** | hardcoded rgba per method | `color-mix(in srgb, var(--cook-*) N%, transparent)` | `--cook-*` 값 미변경 |
| **Fallback tint** | `rgba(170,170,170,0.16)` | `color-mix(in srgb, var(--cook-etc) 16%, transparent)` | |
| **Feedback toast (error)** | `bg-[color:rgba(255,108,60,0.96)] text-white border-[...]` | `color-mix()` brand 파생, `text-[var(--surface)]` | |
| **Feedback toast (status)** | `bg-[color:rgba(250,255,252,0.96)] border-[...]` | `color-mix()` olive 파생 | |
| **Toast shadow** | `shadow-[0_18px_44px_rgba(34,24,14,0.14)]` | `shadow-[var(--shadow-3)]` | |
| **Sections** | `glass-panel rounded-[20px]` | `bg-[var(--panel)] border-[var(--line)] shadow-[var(--shadow-2)] rounded-[var(--radius-xl)]` | `glass-panel` 제거 |
| **Loading skeleton** | `glass-panel`, `bg-white/60/70/72/80`, hardcoded radii | Skeleton primitive + 토큰 기반 surface/radius | HOME skeleton 패턴 적용 |
| **PlannerAddSheet backdrop** | `bg-black/50` | `bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)]` | HOME modal 패턴 |
| **PlannerAddSheet panel** | `glass-panel rounded-[20px]` | `bg-[var(--panel)] border-[var(--line)] shadow-[var(--shadow-3)] rounded-[var(--radius-xl)]` | H5 decisions 보존 |
| **PlannerAddSheet column btns** | `bg-[var(--olive)] text-white` / `bg-white/60` | `text-[var(--surface)]` / `bg-[var(--surface-fill)]` | |
| **PlannerAddSheet skeleton** | `bg-white/60 rounded-[12px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-md)]` | |
| **SaveModal backdrop** | `bg-black/50` | `bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)]` | HOME modal 패턴 |
| **SaveModal panel** | `glass-panel rounded-[20px]` | `bg-[var(--panel)] border-[var(--line)] shadow-[var(--shadow-3)] rounded-[var(--radius-xl)]` | H5 decisions 보존 |
| **SaveModal book rows** | `bg-white`, `bg-[color:rgba(46,166,122,0.12)]` | `bg-[var(--surface)]`, `color-mix()` olive | |
| **SaveModal error card** | `border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)]` | `color-mix()` brand 파생 | |
| **SaveModal new-book section** | `bg-white/70 rounded-[16px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-lg)]` | |
| **SaveModal input** | `bg-white rounded-[12px]` | `bg-[var(--surface)] rounded-[var(--radius-md)]` | |
| **LoginGateModal backdrop** | `bg-black/42` | `bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)]` | |
| **LoginGateModal panel** | `glass-panel rounded-[24px]` | `bg-[var(--panel)] border-[var(--line)] shadow-[var(--shadow-3)] rounded-[var(--radius-xl)]` | |
| **LoginGateModal eyebrow** | `border-[color:rgba(30,30,30,0.08)] bg-[color:rgba(30,30,30,0.06)]` | `color-mix(in srgb, var(--foreground) 8%, transparent)` 등 | |
| **LoginGateModal info card** | `bg-white/78 rounded-[18px]` | `bg-[var(--surface-fill)] rounded-[var(--radius-lg)]` | |

### 프로토타입 참조 범위

`ui/designs/prototypes/baemin-redesign/HANDOFF.md` RECIPE_DETAIL 섹션은 다음 포인트를 참조용으로 제공한다:

- Hero + transparent AppBar fade → **채택하지 않음** (현재 RECIPE_DETAIL.md에 없고, AppHeader는 home-retrofit에서 확정)
- Tabs + Reviews 구조 → **채택하지 않음** (현재 구현 없음, 후속 기능 slice 대상)
- Stepper와 재료 카드 스타일 → **참고**, 토큰 기반 교체에만 활용
- 조리 단계 카드 스타일 → **참고**, cooking method badge 색상은 `--cook-*` 기반 `color-mix()` 파생

**주의**: 프로토타입은 REFERENCE ONLY다. 프로토타입과 공식 문서/workpack이 충돌하면 공식 문서/workpack이 우선한다. 특히:
- Hero + transparent AppBar fade는 구현하지 않는다.
- Tabs/Reviews 구조는 구현하지 않는다.
- 프로토타입 JSX/HTML을 직접 복사하지 않는다.
- `--cook-*` 토큰 값을 변경하지 않는다 (파생 tint만 `color-mix()` 전환).
- Jua 폰트는 사용하지 않는다.

### 리트로핏 와이어프레임 (구조 보존 + 시각 교체)

```
┌─────────────────────────────────────┐  ← 375px (모바일 기준)
│  HOMECOOK                           │  ← AppHeader (home-retrofit 확정)
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │  ← --panel bg, --line border, --shadow-2
│  │                             │   │
│  │   썸네일 / color-mix() hero │   │  ← color-mix(brand/background/olive)
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  Home / Recipe detail               │  ← breadcrumb: --olive 유지
│  [#한식] [#국물]                    │  ← color-mix(olive 10%) bg
│  된장찌개                           │  ← --foreground 유지
│  2인분 · 재료 8개 · 조리 5단계      │  ← --muted 유지
│                                     │
│  [플래너 24] [공유] [좋아요] [저장]  │  ← color-mix() tone 파생
│                                     │
│  요리 설명 텍스트                    │  ← --text-3 (rgba 제거)
│                                     │
│  [플래너에 추가] [요리하기]          │  ← olive/brand tone + 토큰 shadow
│                                     │
│  ── 재료 ─────── [-] 2인분 [+] ──  │  ← --surface-fill bg, token radii
│  두부          150g                 │  ← --surface-fill row, token text
│  소금     [취향껏]  적당히           │  ← color-mix(brand) badge
│                                     │
│  ── 조리 단계 ─────────────────── │
│  ┌─────────────────────────────┐   │  ← --surface-fill bg, --radius-lg
│  │ ① [끓이기]        ⏱ 10분  │   │  ← color-mix(cook-boil 14%) tint
│  │   된장과 물 넣고 끓이기     │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

### 리트로핏 비적용 항목 (명시적 제외)

| 항목 | 이유 |
| --- | --- |
| Prototype hero + transparent AppBar fade | 현재 RECIPE_DETAIL.md에 없음 |
| Prototype tabs/reviews 구조 | 현재 구현 없음 |
| BottomTabs 리스타일 | 앱 전체 retrofit slice로 분리 |
| AppShell / AppHeader 구조 변경 | home-retrofit에서 확정 |
| Jua 폰트 import | h6-direction non-goals |
| 새 CSS 토큰 추가 | 기존 승인 토큰만 사용 |
| `--cook-*` 토큰 값 변경 | 절대 가드레일 — 파생 tint만 color-mix() 전환 |
| `components/ui/*` 파일 수정 | 소비만 허용 |
| COOK_MODE 화면 | 후속 slice 14/15 |

### 관련 리뷰 아티팩트

- 리트로핏 설계 critique: `ui/designs/critiques/RECIPE_DETAIL-baemin-style-retrofit-critique.md`
- Authority report (Stage 4/5 생성): `ui/designs/authority/BAEMIN_STYLE_RECIPE_DETAIL_RETROFIT-authority.md`
- Evidence directory: `ui/designs/evidence/baemin-style/recipe-detail-retrofit/`
