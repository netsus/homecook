# Snapshot entrypoint 읽기 권한 후속 작업

## 현재 상태 — 2026-09-22 정리

해당 읽기 scope 누락은 `supabase/migrations/20260919000000_prelaunch_recipe_meal_log_repairs.sql`에서 기존 권한 wrapper를 보존하면서 두 exact read RPC를 추가하는 방식으로 해결했다. [9월 18~19일 적용·배포 기록](prelaunch-repair-20260918.md)에 격리 검증과 운영 적용이 기록돼 있으며, 9월 21일 읽기 확인에서도 해당 migration checksum 이력이 존재했다. 같은 수정 SQL을 다시 적용할 후속 작업이 아니다.

읽기 scope 복구와 recipe-v2 활성화는 별개다. 9월 21일 직접 Postgres 연결의 UI mode는 `legacy_v1`이었으며, 앱 요청별 설정은 확인하지 않았다. 실제 사용자 편집·저장 흐름의 최신 확인 결과는 [베타 흐름 실행 기록](beta-flow-gaps-20260922.md)에 별도로 남긴다.

9월 22일 후속 운영 요청으로 설정 활성화를 완료했다. 실제 공개 레시피 편집 확인에서 scope와 별개로 조회 함수 본문이 과거 개인 전용 버전으로 남은 문제를 발견해 `20260922030000_recipe_snapshot_activation_repairs.sql`로 복구했다. 실제 편집 진입·검색과 요리 시작/조회/취소를 확인했다. 적용 ledger만으로 실제 함수 정의를 확인했다고 간주하지 않는다. 최신 조치·검증 결과는 [운영 반영 기록](beta-rollout-20260922.md)을 따른다.

## 당시 검토 기록 — 2026-09-15

아래는 수정 전 원인과 당시 배포 범위를 보존한 기록이다. 당시 웹 배포에는 DB 변경을 포함하지 않았다.

`recipe-future-propagation` 내부 scope의 기존 허용 목록에는 `read_recipe_snapshot_ui_mode`, `read_recipe_snapshot_entrypoint_context` POST RPC가 없다. 최신 클라이언트 scope 연결 수정도 이 DB 허용 목록은 변경하지 않는다. UI mode는 legacy fallback을 사용할 수 있고 context 조회는 실패할 수 있다. 실제 운영 DB 함수 정의 확인이 필요하다.

초기 20260915060000 수정 후보는 제거했다. 최신 20260915090000 저장 migration 이후 적용하면 기존 `recipe-save` / `recipe-meal-weight` wrapper 분기를 덮어쓰기 때문이다. 후속 변경은 최신 번호를 사용하고 현재 함수를 고유 이름으로 보존한 뒤 두 exact read RPC만 추가해야 한다. 기존 권한을 포함한 후속 적용 순서의 격리 검증과 백업을 먼저 수행한다. 빠른 배포 도구의 함수 SQL 제한을 우회하지 않는다.
