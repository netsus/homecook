# H4: PLANNER_WEEK v2 — 정보 구조 최종 결정

> **분류**: Design Decision Gate / Anchor Extension  
> **workpack 성격**: Stage 1 전용 — 구현 없음, 이후 H2가 실제 구현 slice를 담당한다  
> **대상 화면**: `PLANNER_WEEK` (anchor screen)  
> **slice-workflow 위치**: Stage 1 산출물만 생성한다. Stage 2~6는 H2가 담당한다.  
> **docs-governance 위치**: 공식 계약(화면정의서/유저플로우) 변경을 승인·트리거하는 gate 문서다.  
>   공식 문서 자체는 H2 contract-evolution PR에서 갱신한다.  
> **작성일**: 2026-04-16

---

## 목표

`PLANNER_WEEK`의 모바일 interaction model을 공식 기준으로 잠근다.
이후 `H2`(day-card 리디자인), `H3`(RECIPE_DETAIL planner add 확정), 그리고 모든 후속 플래너 슬라이스가 이 결정을 기준으로 따른다.

결정해야 할 핵심 질문:

> 모바일 기본형에서 날짜 × 끼니 **table/grid mental model**을 유지할 것인가,  
> 아니면 **day-card 중심 구조**로 전환할 것인가?

---

## 1. 두 모델 비교

### 1-A. Table/Grid Model (현행 baseline)

**정의**: 가로 축 = 끼니(4열), 세로 축 = 날짜(row). 슬롯을 2×2 grid로 읽는다.

**현재 authority 평가 (slice05/06 pass 기준)**:
- `2×2 meal slot grid` 구조로 slice06 authority `pass` 획득
- scroll containment는 planner 내부 scroller에 국한 (page-level overflow 해소)
- M2/M3에서 header overflow, 5-column density 조정 완료

**장점**:
- 날짜 × 끼니 매트릭스를 한 눈에 조망 가능
- 여러 날을 스캔할 때 끼니별 패턴(매일 아침에 뭘 먹는지)을 가로로 읽을 수 있음
- 기존 authority baseline이 이 모델 기준으로 잠겨 있음 — 전환 시 baseline 재설정 필요

**약점**:
- 모바일 폭에서 4끼를 가로 1행에 넣으면 슬롯당 너비가 좁아짐
- 같은 날짜 4끼를 한 덩어리로 읽는 느낌이 약해질 수 있음
- 5-column(예: 간식 분리) 대응 시 밀도 붕괴 위험
- mobile default viewport에서 2일 이상 day overview를 동시에 보려면 행 높이를 공격적으로 줄여야 함

### 1-B. Day-Card Model (전환 방향)

**정의**: 날짜(일자) 단위 카드 → 각 카드 안에 4끼 슬롯이 세로 또는 2×2로 배치.  
세로 스크롤 중심, 카드 간 시각 경계로 "하루 식단 한 덩어리" 인지를 강화.

**장점**:
- 같은 날짜의 4끼가 카드 경계로 명확히 묶임 → "하루 한 덩어리" 인지 최강
- 모바일 기본 폭에서 슬롯 너비 제약이 사라짐 (세로 적층 방식)
- 2일 이상 overview를 세로 스크롤로 자연스럽게 탐색 가능
- 미래 5-column 대응이 card 내부 레이아웃 변경으로 격리됨

**약점**:
- "이번 주 아침에 뭘 먹는지"처럼 끼니 축 스캔이 table 대비 어려워짐
- 전환 시 현재 authority baseline 전체 재설정 필요
- 기존 `2×2 grid` 구현 자산 전면 교체 필요
- interaction model 교체이므로 사용자 승인 + 새 authority evidence 필수

### 1-C. 최종 권고

**권고: Day-Card Model 채택**

근거:
1. `docs/design/anchor-screens.md`와 `docs/engineering/product-design-authority.md` 모두 "같은 날짜의 끼니가 한 덩어리로 읽혀야 한다"를 핵심 guardrail로 명시하고 있다.
2. acceptance 기준(§4)의 "mobile first에서 2일 이상 overview", "같은 날짜 4끼 한 덩어리" 모두 day-card가 더 직접적으로 만족한다.
3. H2가 목표로 하는 "가로 스크롤 없이 2일 이상 overview"는 table/grid에서 달성하기 위해 슬롯 높이를 너무 많이 줄여야 한다.
4. product-design-authority가 "overflow를 잡는 것과 interaction model을 바꾸는 것은 별개"라고 명시했으며, 이 결정은 사용자 승인 트랙을 거친다.

**단, 이 권고는 구현 시작 금지다.**  
아래 §3 authority 계획에 따라 evidence artifact와 사용자 승인을 먼저 받아야 한다.

---

## 2. 공식 문서 영향도

### 영향 있는 문서

| 문서 | 현재 버전 | 영향 내용 | 갱신 필요 시점 |
|------|-----------|-----------|--------------|
| `docs/화면정의서-v1.2.3.md` §5 PLANNER_WEEK | v1.2.3 | 레이아웃 와이어프레임, 핵심 컴포넌트 정의 | H2 Stage 1 결정 확정 후, 구현 전 |
| `docs/유저flow맵-v1.2.3.md` §③ 식단 계획 여정 | v1.2.3 | 세로 scroll 중심 flow로 변경 여부 | H2 Stage 1 결정 확정 후 |
| `docs/api문서-v1.2.2.md` §3 GET /planner | v1.2.2 | 응답 shape 변경 없음 — **API 계약은 변경 없음** | N/A |
| `docs/db설계-v1.3.1.md` §5 Meal Plan | v1.3.1 | day-card로 바꿔도 `meal_plan_columns`, `meals` 구조 변경 없음 — **DB 계약은 변경 없음** | N/A |
| `ui/designs/PLANNER_WEEK.md` | 비공식 | 레이아웃 와이어프레임, 컴포넌트 설명 전면 갱신 | H2 Stage 1 결정 확정 후 |
| `ui/designs/authority/PLANNER_WEEK-authority.md` | 비공식 | authority baseline 전면 재설정 | H2 Stage 4 authority 재수행 후 |
| `docs/workpacks/05-planner-week-core/README.md` | 완료 | 완료 슬라이스이므로 변경하지 않음. H2 README에서 contract evolution 기록 | N/A |
| `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | — | 화면정의서/유저플로우 버전 갱신 시 함께 갱신 | H2 contract-evolution PR |

### Contract Evolution 필요 여부

**API/DB는 변경 없음** — `GET /planner` 응답 shape, `meal_plan_columns`, `meals` 테이블은 day-card 전환과 무관하게 동일하다.

**화면 계약은 변경 필요** — day-card 채택 시 아래 contract evolution 경로를 밟는다.

```
H4 Stage 1 결정 문서 확정 (이 문서)
  ↓ 사용자 승인 (day-card 채택 확정)
H2 Stage 1 wireframe 작성 시작 허가
  ↓
화면정의서 v1.3.0 draft (구현 전)
유저플로우 v1.3.0 draft
  ↓ 사용자 승인
contract-evolution PR (공식 문서 버전 갱신 + CURRENT_SOURCE_OF_TRUTH 갱신)
  ↓
H2 Stage 4 구현 시작 허가
```

이 경로를 건너뛰고 구현을 먼저 시작하는 것은 금지다.

---

## 3. Anchor Extension / Authority 계획

### 3-A. 왜 High-Risk UI Change인가

`PLANNER_WEEK`는 anchor screen이다 (`docs/design/anchor-screens.md`). 다음 사유가 겹쳐 high-risk로 분류된다.

1. **Interaction model 교체**: table/grid → day-card는 단순 스타일 변경이 아니라 사용자의 공간 인지 모델 자체를 바꾼다.
2. **Anchor screen의 스크롤 구조 변경**: 가로 스크롤 영역이 사라지고 세로 스크롤만 남는 구조 변화.
3. **정보 구조 및 섹션 위계 변경**: 날짜 × 끼니 grid에서 날짜 우선 card stack으로 섹션 위계가 바뀜.
4. **후속 슬라이스 전체에 기준 전파**: H2, H3 그리고 이후 meal-manage(07), shopping-flow(09) 등이 새 mental model을 기준으로 삼게 됨.
5. **기존 authority baseline 무효화**: slice05/06에서 `pass`를 받은 2×2 grid baseline이 전면 재설정된다.

### 3-B. 필요한 Evidence

#### Stage 1 — 설계 artifact (구현 전, 지금 잠금)

| artifact | 경로 | 형식 |
|----------|------|------|
| 두 모델 비교 와이어프레임 | `ui/designs/PLANNER_WEEK-v2-decision.md` | ASCII wireframe + 비교표 |
| Day-card 상세 레이아웃 | `ui/designs/PLANNER_WEEK-v2.md` | ASCII wireframe + 인터랙션 노트 |
| Authority 계획 명시 | 이 README §3 | 텍스트 |

#### Stage 4 — Screenshot Evidence (H2 구현 후 필수)

| artifact | 경로 | 설명 |
|----------|------|------|
| before (현행 grid) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-before-mobile.png` | 기존 2×2 grid 현황 |
| mobile default (390px) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile.png` | day-card 기본 상태 |
| narrow sentinel (320px) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-narrow.png` | 작은 기기 레이아웃 확인 |
| scroll 중간 상태 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-scrolled.png` | 2일 이상 overview 확인 |
| 2일 동시 가시 확인 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-2day-overview.png` | 첫 화면에 2일 이상 보임 증거 |
| 4끼 한 덩어리 상태 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-day-card-filled.png` | 4끼 등록된 날의 card |
| 빈 슬롯 밀도 확인 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-empty-slots.png` | 빈 슬롯 반복 시 밀도 |
| 5-column 대응 (옵션) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-5col-mobile.png` | 5끼 column 대응 시 레이아웃 |

### 3-C. Mobile Default / Narrow / Scroll State 캡처 기준

| 상태 | 캡처 기준 | 확인 포인트 |
|------|-----------|------------|
| Mobile default (390px) 진입 | 첫 화면, 스크롤 없음 | viewport 안에 2일치 day card가 들어오는가 |
| Mobile default (390px) 스크롤 중 | 2번째 day card 이후 | card 경계 명확, CTA 가려지지 않음 |
| Narrow sentinel (320px) 진입 | 첫 화면 | 레이아웃 붕괴, 잘림, 밀도 붕괴 없음 |
| Narrow sentinel (320px) 스크롤 | compact 상태 | 슬롯 텍스트, chip 잘림 없음 |
| 4끼 filled card | 하루 4끼 모두 등록된 날 | 한 카드 안에서 4끼가 함께 읽힘 |
| Empty card | 빈 주간 or 일부 빈 슬롯 | `비어 있음` pill 반복 처리 적절함 |
| CTA 영역 | secondary toolbar + action | toolbar가 scroll과 충돌하지 않음 |

---

## 4. Acceptance 및 Closeout 기준

### 4-A. H4 Stage 1 완료 기준 (이 workpack)

- [x] 두 모델의 장단점이 이 문서에 명시되어 있다
- [x] 최종 권고(day-card 채택)가 이유와 함께 기록되어 있다
- [x] 공식 문서 영향도가 명시되어 있다
- [x] contract-evolution 경로가 정의되어 있다
- [x] authority evidence 계획이 캡처 목록 형태로 잠겨 있다
- [x] 후속 H2/H3 제약이 명시되어 있다
- [x] `ui/designs/PLANNER_WEEK-v2-decision.md` 설계 비교 문서 작성
- [x] **사용자 승인: day-card vs table/grid 최종 방향 확정** (2026-04-16 승인 완료)

### 4-B. H2 Implementation Acceptance 기준

H2가 day-card 리디자인을 구현한 후 아래를 모두 만족해야 `Design Status: confirmed`가 가능하다.

| 기준 | 검증 방법 |
|------|----------|
| 같은 날짜의 4끼 아침/점심/간식/저녁이 하나의 day card 경계 안에서 함께 읽힌다 | 390px screenshot에서 day card 경계와 4슬롯 위치 확인 |
| mobile first viewport (390px)에서 스크롤 없이 2일 이상의 day card가 보인다 | `PLANNER_WEEK-v2-mobile.png` viewport 높이 분석 |
| narrow sentinel (320px)에서 CTA 가림, 슬롯 텍스트 잘림, 레이아웃 밀도 붕괴가 없다 | `PLANNER_WEEK-v2-mobile-narrow.png` |
| 5-column 대응 시 정보 축약 원칙을 따른다: ① 끼니명 생략 금지, ② 식사명 말줄임(`…`)은 1행까지, ③ serving/status chip 중 1개 생략 가능(status 우선 유지) | 5-column screenshot + 슬롯 내부 텍스트 확인 |
| page-level horizontal overflow가 없다 | `pageScrollWidth === viewport width` |
| secondary toolbar CTA(`장보기` / `요리하기` / `남은요리`)가 scroll 중에도 접근 가능하다 | scroll 중 상태 screenshot |
| 주간 이동 컨트롤(week context bar + weekday strip)이 planner 본문 바로 위에 붙어 있다 | screenshot에서 인접 거리 확인 |

### 4-C. Closeout 금지 조건

아래 중 하나라도 해소되지 않으면 H2 Stage 5 `confirmed`를 줄 수 없다.

- authority evidence screenshot 중 필수 variant(mobile / narrow / scroll)가 누락
- day-card 내부에서 4끼가 한 덩어리로 읽히지 않는 레이아웃
- narrow (320px)에서 CTA 가림 또는 레이아웃 붕괴
- 화면정의서/유저플로우 contract-evolution PR 없이 구현이 먼저 진행됨
- 사용자 승인 없이 interaction model이 교체됨

---

## 5. 후속 구현 범위 제약

### H2 제약

H2(PLANNER_WEEK v2 모바일 day-card 리디자인)는 이 H4 Stage 1 문서와 사용자 승인이 완료된 후에만 시작할 수 있다.

- H4 권고(day-card 채택) 사용자 승인 → H2 Stage 1 wireframe 시작 허가
- H2 Stage 4(구현) 전에 화면정의서 v1.3.0이 contract-evolution PR로 먼저 잠겨야 한다
- H2는 `GET /planner` API 계약을 바꾸지 않는다
- H2는 `meal_plan_columns`, `meals` DB 구조를 바꾸지 않는다
- H2 구현 완료 후 `ui/designs/PLANNER_WEEK.md`와 `ui/designs/authority/PLANNER_WEEK-authority.md`를 전면 갱신해야 한다

### H3 제약

H3(RECIPE_DETAIL 플래너 추가 interaction 확정)는 H4 결정에 종속된다.

- H4가 day-card를 선택하면, H3의 bottom sheet 날짜 선택 UX가 day-card 기준 날짜 표현과 일관되어야 한다
- H3의 planner add bottom sheet 날짜 표시 방식을 H2 day-card 레이아웃과 sync해야 한다
- H3의 "플래너에 추가" 성공 후 진입점(특정 날짜 card 포커스 여부)은 H2 결정 이후 확정한다
- H3는 slice06에서 잠긴 `POST /meals` 계약을 바꾸지 않는다

### RECIPE_DETAIL '플래너에 추가' interaction 연결

현재 상태:
- slice06에서 bottom sheet + `POST /meals` 경로가 `confirmed`로 잠겨 있다
- bottom sheet의 날짜/끼니/인분 선택 UX는 slice06 baseline을 따른다

H4 결정 이후 연결 방향:
- **Day-card 채택 시**: planner add 성공 후 `PLANNER_WEEK` 진입 시 해당 날짜의 day card가 viewport 상단에 위치하도록 scroll anchoring 고려 (H3 범위)
- **Table/grid 유지 시**: 현재 slice06 baseline을 그대로 유지하며 H3에서 추가 polish만 수행

---

## Source Links

- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`
- `docs/workpacks/05-planner-week-core/README.md`
- `docs/workpacks/06-recipe-to-planner/README.md`
- `ui/designs/PLANNER_WEEK.md`
- `ui/designs/authority/PLANNER_WEEK-authority.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.6.3.md` §1-4 식단 플래너(위클리)
- `docs/화면정의서-v1.2.3.md` §5 PLANNER_WEEK
