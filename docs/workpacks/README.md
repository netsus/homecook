# Workpack Roadmap

## Purpose

- 앞으로의 구현은 `작은 세로 슬라이스` 단위로 진행한다.
- 각 슬라이스는 공식 문서 기준의 사용자 가치 하나를 닫아야 한다.
- 같은 슬라이스에서도 개발 브랜치는 `백엔드`와 `프론트엔드`로 분리한다.

## Operating Rules

- 슬라이스 시작 전 `docs/workpacks/<slice>/README.md`를 먼저 만든다.
- 예외: `docs/engineering/` 아래의 repo-engineering automation, workflow tooling, agent 운영 규칙 변경은 제품 workpack roadmap 바깥이다.
- 이런 engineering 작업은 `docs/workpacks/<slice>/README.md` 대신 관련 `docs/engineering/*.md`를 source of truth로 사용한다.
- 슬라이스 시작 전 Dependencies 테이블의 모든 선행 슬라이스가 merged 상태임을 확인한다.
- 백엔드 브랜치는 API, 권한, 상태 전이, 테스트를 먼저 닫는다.
- 프론트엔드 브랜치는 백엔드 계약을 기준으로 `loading / empty / error / read-only / 로그인 게이트` 흐름을 닫는다.
- 디자인이 아직 없어도 기능 가능한 임시 UI로 먼저 개발한다.
- 디자인 확정 후에는 `CSS 변수`, `Tailwind 클래스`, 공용 화면 컴포넌트 중심으로 스타일을 교체한다.

## Branch Convention

- 백엔드: `feature/be-<slice>`
- 프론트엔드: `feature/fe-<slice>`

## Slice Order

| Slice | Status | Goal |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | 레시피 탐색, 상세 조회, 로그인 게이트, 소셜 로그인 복귀 |
| `02-discovery-filter` | planned | HOME 재료 필터 모달과 필터 조회 계약 |
| `03-recipe-like` | planned | RECIPE_DETAIL 좋아요 토글과 로그인 복귀 |
| `04-recipe-save` | planned | 저장 모달, 저장 대상 책 선택, `saved/custom` 제한 |
| `05-recipe-to-planner` | planned | 상세에서 플래너 추가, 날짜/끼니/인분 입력, Meal 생성 |
| `06-planner-week-core` | planned | 위클리 플래너 조회, 컬럼 CRUD, 상단 CTA와 상태 뱃지 |
| `07-meal-manage` | planned | `MEAL_SCREEN` 조회/수정/삭제와 409 예외 상태 |
| `08-meal-add-picker` | planned | `MENU_ADD`, `RECIPE_SEARCH_PICKER`, 일반 식사 추가 |
| `09-shopping-preview-create` | planned | 장보기 preview, 대상 검증, 리스트 생성, 상세 이동 |
| `10-shopping-detail-edit` | planned | 장보기 상세 조회, 체크, 제외/되살리기, 공유 텍스트 |
| `11-shopping-reorder-readonly` | planned | 장보기 순서 변경, 완료 후 read-only 재열람 |
| `12-shopping-complete-pantry` | planned | 장보기 완료, 팬트리 반영 선택값 처리, `shopping_done` 전이 |
| `13-pantry-core` | planned | 팬트리 조회, 직접 추가, 묶음 추가, 삭제 |
| `14-cook-session-start` | planned | `COOK_READY_LIST`, 요리 세션 시작/취소 |
| `15-cook-complete` | planned | `COOK_MODE`, pantry 소진, `cook_done` 전이 |
| `16-leftovers` | planned | 남은요리 저장, 재등록, 다먹은 목록 |
| `17-mypage-books-history` | planned | 마이페이지, 레시피북, 저장 해제, 장보기 기록 조회 |
| `18-manual-recipe-create` | planned | 직접 레시피 등록과 상세/플래너 연계 |
| `19-youtube-import` | planned | 유튜브 검증, 추출, 등록, 신규 조리방법 반영 |

## Slice Notes

- `02`부터는 한 슬라이스를 더 작은 기능 단위 하나로 제한한다.
- 장보기 슬라이스에서는 `exclude -> uncheck`, read-only, `add_to_pantry_item_ids`, `pantry_added` 규칙을 항상 테스트로 고정한다.
- 요리 슬라이스에서는 플래너 경유 요리와 독립 요리의 상태 전이를 절대 섞지 않는다.
