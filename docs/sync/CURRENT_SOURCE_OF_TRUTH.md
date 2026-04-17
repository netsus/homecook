# Current Source of Truth

## Official Versions
- Requirements: `v1.6.3`
- Screens: `v1.5.0`
- Flow: `v1.3.0`
- DB: `v1.3.1`
- API: `v1.2.2`

## Official Files
- `docs/요구사항기준선-v1.6.3.md`
- `docs/화면정의서-v1.5.0.md`
- `docs/유저flow맵-v1.3.0.md`
- `docs/db설계-v1.3.1.md`
- `docs/api문서-v1.2.2.md`

## Notes
- 위 5개 파일이 현재 공식 기준 문서다.
- `docs/reference/wireframes/`는 보조 참고 자료다.
- 구현 중 문서 충돌이 보이면 먼저 충돌 항목을 정리하고 작업 범위를 다시 확정한다.
- 사용자 승인으로 공식 계약을 바꾸는 경우에도 구현보다 문서가 먼저다. 관련 공식 문서와 이 파일의 버전/경로를 같은 `contract-evolution` PR에서 먼저 갱신한다.

## v1.2.3 → v1.3.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.0 | PLANNER_WEEK §5: day card 본문을 2×2 grid → 세로 slot row 방식으로 변경, 가로 스크롤 전면 제거, 5-column 정보 축약 원칙 추가 |
| 유저플로우 v1.3.0 | §③ 식단 계획 여정: 세로 스크롤 중심 탐색 명시, 가로 스크롤 없음 선언 |
| API (v1.2.2 유지) | 변경 없음 — `GET /planner` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 — `meal_plan_columns`, `meals` 구조 동일 |

> 이 변경은 H4 gate 승인(2026-04-16)을 기반으로 한 H2 Stage 1 contract-evolution이다.
> H2 FE 구현(`feature/fe-planner-week-v2`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.0 → v1.3.1 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.1 | RECIPE_DETAIL §3: PlannerAddPopup UX 확정 — 성공 후 토스트만 표시(PLANNER_WEEK 이동 없음), 토스트 텍스트 `N월 D일 끼니에 추가됐어요`, 바텀시트 날짜 확인 텍스트 `요일 M월 D일` 포맷 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H3 planner-add-sync Stage 1 사용자 승인(2026-04-17)을 기반으로 한 contract-evolution이다.
> H3 FE 구현(`feature/fe-h3-planner-add-sync`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.1 → v1.4.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.4.0 | HOME §1: 테마 섹션을 2열 카드 그리드에서 compact horizontal carousel strip(1.5장 peek, ~130px)으로 변경 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `GET /recipes`, `GET /themes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H1 home-first-impression Stage 1 사용자 승인(2026-04-17, D1/D2/D3/D4)을 기반으로 한 contract-evolution이다.
> 정렬 컨트롤 위치·재료 필터 위치는 현행 유지. 테마 섹션 형태만 변경.
> H1 FE 구현(`feature/fe-h1-home-first-impression`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.4.0 → v1.5.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.5.0 | `PlannerAddPopup`, `SavePopup`, `INGREDIENT_FILTER_MODAL`, HOME 정렬 선택 UI를 Quiet Kitchen Sheets 기준으로 재정의. eyebrow 제거, icon-only close, `olive base + thin orange highlight`, PlannerAdd 날짜 chip `요일 + 4/17`, Save 제목 `레시피 저장` 확정 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals`, `POST /recipes/{id}/save`, `GET /ingredients`, `GET /recipes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H5 modal-system-direction Stage 1 사용자 승인(2026-04-17, D1~D6)을 기반으로 한 contract-evolution이다.
> h5 modal system redesign FE 구현(`feature/fe-h5-modal-system-redesign`)은 이 문서 갱신 이후에 시작할 수 있다.
