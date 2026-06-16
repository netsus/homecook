# Launch Readiness Priorities

상태: 출시 전 점검 우선순위
날짜: 2026-06-16

## 판단 기준

- Codex와 Claude의 독립 리뷰 결과를 합쳐서, 출시 전에 실제 장애/데이터 손상/사용성 이탈 가능성이 큰 항목을 우선한다.
- 사용자가 운영 의도로 확인한 항목은 출시 blocker에서 제외한다.
- 외부 개발자가 별도 진행 중인 YouTube 유료/LLM 개선은 이 우선순위에서 제외하고 외부 의존성으로 관리한다.
- 2026-06-16 addendum으로 공식 문서에 반영된 planner column reorder 계약 불일치는 해결 완료 항목으로 분리한다.

## 출시 전 수정 우선순위 Top 10

| 우선순위 | 항목 | 출시 전 필요한 조치 | 근거 |
| --- | --- | --- | --- |
| 1 | 장보기 완료 API 원자화 | `shopping_done` 전이, 완료 상태, 팬트리 반영 전제 데이터가 중간 실패로 갈라지지 않게 트랜잭션/RPC 경계를 고정한다 | 데이터 상태가 어긋나면 장보기/요리 흐름 전체가 꼬인다 |
| 2 | 장보기 생성 API 원자화 | preview 대상 `meals.shopping_list_id` 세팅과 `shopping_lists/items` 생성을 한 성공 단위로 묶는다 | 실패 시 같은 식사가 여러 장보기 리스트에 들어가거나 누락될 수 있다 |
| 3 | `GET /recipes` mock fallback 제거 | 운영 경로에서 mock/fixture fallback이 실제 데이터 실패를 숨기지 않게 분리한다 | 출시 후 데이터 문제를 정상 응답처럼 보이게 만들 수 있다 |
| 4 | 레시피 목록 pagination 구현 | HOME/검색/레시피 목록에 cursor 또는 page 기반 paging을 적용하고 API 계약과 UI 상태를 맞춘다 | 데이터가 늘면 초기 로딩과 DB 부하가 급증한다 |
| 5 | 수동 레시피 생성 원자화 | recipe, ingredients, steps, image reference 저장을 한 성공 단위로 묶고 실패 시 부분 생성물을 남기지 않는다 | 사용자가 직접 만든 핵심 데이터가 부분 저장될 위험이 있다 |
| 6 | RLS/service-role 소유권 경계 재검증 | service-role 사용 route의 소유자 검증, RLS 기대치, IDOR 테스트를 재점검한다 | 권한 경계 문제는 출시 blocker다 |
| 7 | 장보기 상세 전체 체크 partial failure 수정 | 전체 체크/해제 중 일부 항목만 반영되는 실패를 막고 rollback 또는 명확한 재시도 상태를 제공한다 | 사용자가 구매 완료 여부를 잘못 믿을 수 있다 |
| 8 | 모바일 터치 타깃 44px 미만 수정 | 핵심 플로우 버튼/아이콘의 터치 영역을 44px 이상으로 맞추고 screenshot/e2e evidence를 남긴다 | 모바일 실사용에서 조작 실패와 접근성 문제가 크다 |
| 9 | Admin page-view API 문서/엔드포인트 정합성 정리 | 실제 route, 공식 API 문서, endpoint count, Admin Foundation workpack의 불일치를 맞춘다 | 운영 화면은 내부용이어도 계약 불일치가 유지보수 리스크를 만든다 |
| 10 | Cook mode 공개/비인증 정책 확정 | 공개 레시피 cook mode 허용 범위, 비인증 접근, 플래너 경유 요리 상태 전이를 공식 문서와 route guard에 맞춘다 | 요리 시작은 핵심 행동이고 인증/상태 전이가 섞이면 UX와 데이터가 모두 흔들린다 |

## 출시 blocker에서 제외한 항목

| 항목 | 결정 | 후속 관리 |
| --- | --- | --- |
| 사용자 생성 레시피 노출 | 운영 의도이므로 blocker 아님 | 작성자 표시(`created_by`/표시명)는 커뮤니티 기능 확장과 함께 별도 기획 |
| YouTube 유료/LLM 개선 | 별도 개발자가 진행 중이므로 현 우선순위에서 제외 | 외부 개발 결과 수령 후 integration review |
| Planner column reorder 공식 문서 불일치 | 2026-06-16 addendum으로 공식 문서 반영 | 이 문서 변경 PR에서 닫음 |
