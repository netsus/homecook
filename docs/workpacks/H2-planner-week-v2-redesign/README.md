# H2: PLANNER_WEEK v2 — 모바일 Day-Card 리디자인

> **분류**: High-Risk Redesign / Anchor Extension  
> **대상 화면**: `PLANNER_WEEK` (anchor screen)  
> **선행 gate**: `H4-planner-week-v2-direction` (승인 완료 2026-04-16)  
> **단계**: Stage 1 — Design Artifact + Contract-Evolution Draft  
> **작성일**: 2026-04-16

---

## 목표

`PLANNER_WEEK` 모바일 기본형을 **day-card 중심 구조**로 전환한다.

- 같은 날짜의 4끼(아침/점심/간식/저녁)가 하나의 카드 경계 안에서 한 덩어리로 읽힌다
- mobile first viewport (390px)에서 가로 스크롤 없이 2일 이상의 day overview가 보인다
- narrow sentinel (320px)에서도 CTA 가림·잘림·밀도 붕괴가 없다

이 슬라이스는 **FE-only**다. `GET /planner` API와 DB 구조는 변경하지 않는다.

---

## Branches

- 백엔드: 없음 (API/DB 변경 없음)
- 프론트엔드: `feature/fe-planner-week-v2`

---

## In Scope

- 화면:
  - `PLANNER_WEEK`: 날짜별 day card 레이아웃 → 세로 slot row 방식으로 전환
    - card header (요일 배지 + 날짜)
    - meal slot rows (끼니명 | 식사명/빈 상태 | 인분·상태 chip)
    - 빈 슬롯 pill 처리
  - `PLANNER_WEEK` 5-column 대응 (slot row에서 끼니 추가 시 행 하나 추가)
- 비공식 설계 문서:
  - `ui/designs/PLANNER_WEEK-v2.md` (이 Stage 1에서 작성)
  - `ui/designs/authority/PLANNER_WEEK-authority.md` (Stage 4 후 전면 재설정)
- 공식 계약 문서 (contract-evolution PR, Stage 4 구현 전):
  - `docs/화면정의서-v1.3.0.md` §5 PLANNER_WEEK — 레이아웃 변경 반영
  - `docs/유저flow맵-v1.3.0.md` §③ 식단 계획 여정 — 세로 스크롤 중심 확인
  - `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` — 버전 갱신

## Out of Scope

- `GET /planner` API 계약 변경
- `meal_plan_columns`, `meals` DB 구조 변경
- MEAL_SCREEN, MENU_ADD 등 타 화면 구조 변경
- compact secondary toolbar (장보기/요리하기/남은요리) CTA 변경
- week context bar + weekday strip 핵심 interaction 변경
- slot 탭 → MEAL_SCREEN 진입 (07-meal-manage 담당)

---

## Contract Evolution (Stage 4 구현 전 필수)

### 화면정의서 §5 PLANNER_WEEK 변경 내용

| 항목 | v1.2.3 (현행) | v1.3.0 (변경) |
|------|--------------|--------------|
| 카드 본문 레이아웃 | 아침/점심/간식/저녁 4슬롯 (**2×2 grid**) | 아침/점심/간식/저녁 4슬롯 (**세로 slot row**, 끼니명 + 식사명 + chip) |
| 5-column 대응 | 없음 | slot row 1개 추가, 가로 밀도 무영향 |
| 가로 스크롤 | planner 내부 scroller (localized) | **없음** — 세로 스크롤만 사용 |
| mobile 2일 overview | 행 높이 압축 필요 | 첫 화면에 자연스럽게 2일 이상 노출 |

### 유저플로우 §③ 영향도

- 탐색 흐름 변경 없음: 홈 → 플래너 → 날짜 카드 → 슬롯 탭 → MEAL_SCREEN
- 세로 스크롤 중심임은 v1.2.3과 동일하나, 가로 스크롤 컨테이너 개념이 사라짐을 명시
- 영향 규모: minor (flow 자체는 동일, 가로 스크롤 제거 명시만 추가)

### Contract-Evolution 실행 순서

```
이 Stage 1 문서 + ui/designs/PLANNER_WEEK-v2.md 확정
  ↓ 사용자 승인
화면정의서 v1.3.0 + 유저플로우 v1.3.0 draft 작성
  ↓ 사용자 승인
contract-evolution PR 오픈
  → docs/화면정의서-v1.3.0.md 생성
  → docs/유저flow맵-v1.3.0.md 생성
  → docs/sync/CURRENT_SOURCE_OF_TRUTH.md 갱신
  → PR merge
  ↓
feature/fe-planner-week-v2 구현 시작 허가
```

---

## Design Authority

- UI risk: `anchor-extension` + `interaction-model-change`
- Anchor screen: `PLANNER_WEEK`
- 이전 authority baseline: slice05/06 pass (`2×2 grid` 기준) → **전면 재설정 필요**

### Stage 4 Evidence Plan

| artifact | 경로 | 설명 |
|----------|------|------|
| before (현행 grid) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-before-mobile.png` | 구현 전 현행 캡처 |
| mobile default (390px) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile.png` | day-card 기본 상태 |
| narrow sentinel (320px) | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-narrow.png` | 작은 기기 레이아웃 |
| scroll 중간 상태 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-scrolled.png` | 세로 스크롤 중 |
| 2일 동시 가시 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-2day-overview.png` | 첫 화면 2일 이상 |
| 4끼 filled card | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-day-card-filled.png` | 등록 식사가 있는 날 |
| 빈 슬롯 반복 | `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-empty-slots.png` | 빈 주간 밀도 확인 |

---

## Backend First Contract

해당 없음 — API/DB 변경 없음. `GET /planner` 계약은 `05-planner-week-core` 그대로 재사용한다.

---

## Frontend Delivery Mode

- 공식 계약 변경(contract-evolution PR) **이후** 구현 시작
- 디자인 기준: `ui/designs/PLANNER_WEEK-v2.md`
- 필수 상태:
  - `loading`: 기존 스켈레톤 유지 (day-card 외형에 맞게 조정)
  - `empty`: 빈 주간 — day card 유지, meal 슬롯 모두 `비어 있음` pill
  - `error`: 기존 error shell 유지
  - `unauthorized`: 기존 unauthorized shell 유지

---

## Dependencies

| 선행 | 상태 | 확인 |
|------|------|------|
| `H4-planner-week-v2-direction` (승인) | ✅ 완료 | 2026-04-16 |
| `06-recipe-to-planner` | merged | ✅ |
| contract-evolution PR | ⬜ Stage 1 완료 후 진행 | — |

---

## Source Links

- `docs/workpacks/H4-planner-week-v2-direction/README.md` — gate 결정 문서
- `ui/designs/PLANNER_WEEK-v2-decision.md` — 모델 비교
- `ui/designs/PLANNER_WEEK-v2.md` — 이 Stage 1의 상세 wireframe 산출물
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`
- `docs/요구사항기준선-v1.6.3.md` §1-4
- `docs/화면정의서-v1.2.3.md` §5 PLANNER_WEEK (현행 기준)
- `docs/유저flow맵-v1.2.3.md` §③

---

## Stage 1 Delivery Checklist

- [x] H4 gate 승인 확인
- [x] In Scope / Out of Scope 정의
- [x] contract-evolution 경로 및 영향도 정리
- [x] authority evidence 계획 잠금
- [x] `ui/designs/PLANNER_WEEK-v2.md` 상세 wireframe 작성
- [x] 화면정의서 v1.3.0 draft 영향도 정리 (이 README §Contract Evolution)
- [x] 사용자 승인: wireframe + contract-evolution draft 확인 (2026-04-17)
- [x] contract-evolution PR 오픈 (이 브랜치에서 함께 포함)
- [ ] contract-evolution PR merge → 구현 시작 허가
