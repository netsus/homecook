# H2: PLANNER_WEEK v2 — Acceptance Criteria

---

## Stage 1 Acceptance

| # | 기준 | 상태 |
|---|------|------|
| S1 | H4 gate 승인 완료 확인 | ✅ 2026-04-16 |
| S2 | `ui/designs/PLANNER_WEEK-v2.md` 상세 wireframe 존재 | ✅ |
| S3 | contract-evolution 경로(단계별 순서)가 README에 명시됨 | ✅ |
| S4 | 화면정의서 v1.3.0 §5 변경 내용이 README에 명시됨 | ✅ |
| S5 | Stage 4 authority evidence 캡처 목록이 경로와 함께 잠겨 있음 | ✅ |
| **S6** | **사용자 승인: wireframe + contract-evolution draft 확인** | **✅ 2026-04-17** |
| S7 | contract-evolution PR merge 확인 | ⬜ PR merge 후 |

**S6가 닫혀야 contract-evolution PR을 오픈할 수 있다.**  
**contract-evolution PR이 merge되어야 FE 구현(Stage 4)을 시작할 수 있다.**

---

## Stage 4 Implementation Acceptance

### 정보 구조

| # | 기준 | 검증 |
|---|------|------|
| I1 | 같은 날짜의 4끼가 하나의 day card 경계 안에서 함께 읽힌다 | 390px screenshot |
| I2 | 각 slot row: 끼니명 + 식사명(or 빈 상태) + 인분·상태 chip이 안정적으로 읽힌다 | 슬롯 내부 텍스트 확인 |
| I3 | week context bar + weekday strip이 planner 본문 바로 위에 붙어 있다 | screenshot 인접 거리 |
| I4 | range summary / meal summary 중복 노출 없음 | 메타데이터 중복 확인 |

### Mobile UX

| # | 기준 | 검증 |
|---|------|------|
| M1 | 390px 첫 화면에서 스크롤 없이 2일 이상 day card가 viewport 안에 보인다 | `PLANNER_WEEK-v2-2day-overview.png` |
| M2 | 320px에서 레이아웃 붕괴, CTA 가림, 텍스트 잘림 없음 | `PLANNER_WEEK-v2-mobile-narrow.png` |
| M3 | page-level horizontal overflow 없음 (`pageScrollWidth === viewport width`) | 390px + 320px 모두 |
| M4 | secondary toolbar CTA가 scroll 중에도 접근 가능 | scroll 중 screenshot |
| M5 | 터치 타겟 최소 44×44px 유지 | narrow에서 slot 탭 영역 확인 |

### 5-Column 정보 축약

| 규칙 | 검증 |
|------|------|
| 끼니명 생략 금지 | 5-column screenshot에서 끼니명 전부 존재 |
| 식사명 말줄임 1행까지 | truncate 확인 |
| status chip 우선 유지, serving chip은 공간 부족 시 생략 가능 | chip 확인 |
| `비어 있음` pill 1행 유지 | 빈 슬롯 확인 |
| 5 equal-width slots in one row 방식 채택하지 않음 | 레이아웃 확인 |

### Authority Evidence 필수 목록

| # | artifact | 필수 여부 |
|---|----------|----------|
| E1 | `PLANNER_WEEK-before-mobile.png` (구현 전 현행) | 필수 |
| E2 | `PLANNER_WEEK-v2-mobile.png` (390px) | 필수 |
| E3 | `PLANNER_WEEK-v2-mobile-narrow.png` (320px) | 필수 |
| E4 | `PLANNER_WEEK-v2-mobile-scrolled.png` | 필수 |
| E5 | `PLANNER_WEEK-v2-2day-overview.png` | 필수 |
| E6 | `PLANNER_WEEK-v2-day-card-filled.png` | 필수 |
| E7 | `PLANNER_WEEK-v2-empty-slots.png` | 권장 |

---

## Closeout 금지 조건

| # | 조건 |
|---|------|
| C1 | authority evidence 필수 variant 누락 (E1~E6) |
| C2 | day-card 내 4끼가 한 덩어리로 읽히지 않음 |
| C3 | 320px에서 CTA 가림 또는 레이아웃 붕괴 |
| C4 | contract-evolution PR 없이 구현 선행 |
| C5 | `ui/designs/PLANNER_WEEK.md` 또는 `ui/designs/PLANNER_WEEK-v2.md`가 구현 기준으로 갱신되지 않음 |
| C6 | `ui/designs/authority/PLANNER_WEEK-authority.md`가 새 day-card 기준으로 재설정되지 않음 |
| C7 | authority report에 unresolved blocker 존재 |
| C8 | page-level horizontal overflow 존재 |
