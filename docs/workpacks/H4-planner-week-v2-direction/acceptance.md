# H4: PLANNER_WEEK v2 — Acceptance Criteria

> 이 파일은 H4 Stage 1 산출물 검증 기준과,  
> H4 결정이 적용되는 H2 구현의 최종 acceptance 기준을 함께 기록한다.

---

## H4 Stage 1 Acceptance (이 workpack 완료 기준)

| # | 기준 | 상태 |
|---|------|------|
| A1 | table/grid vs day-card 두 모델의 장단점이 비교 문서에 명시됨 | ✅ README §1 |
| A2 | 최종 권고(day-card 채택)가 이유 3개 이상과 함께 기록됨 | ✅ README §1-C |
| A3 | 공식 문서(화면정의서/유저플로우/API/DB) 영향도가 명시됨 | ✅ README §2 |
| A4 | API/DB는 변경 없음이 명확히 선언됨 | ✅ README §2 |
| A5 | contract-evolution 경로(단계별 순서)가 정의됨 | ✅ README §2 |
| A6 | anchor extension으로 분류되는 사유 5개 이상 명시됨 | ✅ README §3-A |
| A7 | Stage 4 authority evidence 캡처 목록이 경로와 함께 잠겨 있음 | ✅ README §3-B |
| A8 | mobile / narrow / scroll 각 상태별 캡처 기준이 명시됨 | ✅ README §3-C |
| A9 | H2, H3에 대한 제약이 각각 명시됨 | ✅ README §5 |
| A10 | RECIPE_DETAIL '플래너에 추가' interaction 연결 방향이 정의됨 | ✅ README §5 |
| A11 | `ui/designs/PLANNER_WEEK-v2-decision.md` 설계 비교 문서 존재 | ✅ 작성 완료 |
| **A12** | **사용자 승인: day-card vs table/grid 최종 방향 확정** | **✅ 승인 완료 (2026-04-16)** |

**A12가 닫혀야 H2를 시작할 수 있다.**

---

## H2 Implementation Acceptance (H4 결정 적용 후)

### 필수 통과 기준

#### 정보 구조

| # | 기준 | 검증 방법 |
|---|------|----------|
| I1 | 같은 날짜의 4끼(아침/점심/간식/저녁)가 하나의 day card 경계 안에서 함께 읽힌다 | 390px screenshot, card 경계와 4슬롯 위치 확인 |
| I2 | 각 슬롯 안에 끼니명 + 식사명(또는 빈 상태) + 상태/보조 정보가 안정적으로 읽힌다 | 슬롯 내부 텍스트 잘림/붕괴 없음 확인 |
| I3 | 주간 이동 컨트롤(week context bar + weekday strip)이 planner 본문 바로 위에 붙어 있다 | screenshot에서 인접 거리 확인 |
| I4 | range summary와 meal summary가 한 번만, 명확하게 보인다 | 중복 메타데이터 없음 확인 |

#### Mobile UX

| # | 기준 | 검증 방법 |
|---|------|----------|
| M1 | mobile first viewport (390px)에서 스크롤 없이 2일 이상의 day card가 viewport 안에 보인다 | `PLANNER_WEEK-v2-mobile.png` viewport 높이 측정 |
| M2 | narrow sentinel (320px)에서 레이아웃 붕괴, CTA 가림, 슬롯 텍스트 잘림이 없다 | `PLANNER_WEEK-v2-mobile-narrow.png` |
| M3 | page-level horizontal overflow가 없다 | `pageScrollWidth === viewport width` (390px + 320px 모두) |
| M4 | secondary toolbar CTA(장보기/요리하기/남은요리)가 scroll 중에도 접근 가능하다 | scroll 중 상태 screenshot |
| M5 | 터치 타겟 최소 크기 44×44px를 유지한다 | narrow에서도 슬롯 탭 영역 확인 |

#### 5-Column 정보 축약 원칙

5끼 column으로 확장될 때 적용할 축약 우선순위:

| 우선순위 | 규칙 |
|---------|------|
| 1 | 끼니명(아침/점심/간식/저녁/야식 등)은 생략하지 않는다 |
| 2 | 식사명은 말줄임(`…`)으로 1행까지만 허용한다 |
| 3 | serving chip과 status chip 중 1개 생략 가능하며, status chip을 우선 유지한다 |
| 4 | `비어 있음` pill은 끼니명 바로 아래 1행으로 유지한다 |
| 5 | 5 equal-width slots in one row 방식은 기본안으로 채택하지 않는다 |

#### Authority Evidence

| # | 기준 | artifact |
|---|------|----------|
| E1 | before (현행 grid) screenshot 존재 | `PLANNER_WEEK-before-mobile.png` |
| E2 | mobile default (390px) screenshot 존재 | `PLANNER_WEEK-v2-mobile.png` |
| E3 | narrow sentinel (320px) screenshot 존재 | `PLANNER_WEEK-v2-mobile-narrow.png` |
| E4 | scroll 중간 상태 screenshot 존재 | `PLANNER_WEEK-v2-mobile-scrolled.png` |
| E5 | 2일 동시 가시 확인 screenshot 존재 | `PLANNER_WEEK-v2-2day-overview.png` |
| E6 | 4끼 filled day card screenshot 존재 | `PLANNER_WEEK-v2-day-card-filled.png` |

---

## Closeout 금지 조건

아래 중 하나라도 해소되지 않으면 H2 Stage 5 `confirmed` 금지:

| # | 조건 |
|---|------|
| C1 | authority evidence 필수 variant(mobile / narrow / scroll) 중 하나라도 누락 |
| C2 | day-card 내부에서 4끼가 한 덩어리로 읽히지 않는 레이아웃 |
| C3 | narrow (320px)에서 CTA 가림 또는 레이아웃 붕괴 |
| C4 | 화면정의서/유저플로우 contract-evolution PR 없이 구현이 선행됨 |
| C5 | 사용자 승인 없이 interaction model이 교체됨 |
| C6 | `ui/designs/PLANNER_WEEK.md`와 `ui/designs/authority/PLANNER_WEEK-authority.md`가 새 구현 기준으로 갱신되지 않음 |
| C7 | authority report에 unresolved blocker가 남아 있음 |
