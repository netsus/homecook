# Snapshot entrypoint 읽기 권한 후속 작업

2026-09-15 검토 결과. 이번 웹 배포에는 DB 변경을 포함하지 않는다.

`recipe-future-propagation` 내부 scope의 기존 허용 목록에는 `read_recipe_snapshot_ui_mode`, `read_recipe_snapshot_entrypoint_context` POST RPC가 없다. 최신 클라이언트 scope 연결 수정도 이 DB 허용 목록은 변경하지 않는다. UI mode는 legacy fallback을 사용할 수 있고 context 조회는 실패할 수 있다. 실제 운영 DB 함수 정의 확인이 필요하다.

초기 20260915060000 수정 후보는 제거했다. 최신 20260915090000 저장 migration 이후 적용하면 기존 `recipe-save` / `recipe-meal-weight` wrapper 분기를 덮어쓰기 때문이다. 후속 변경은 최신 번호를 사용하고 현재 함수를 고유 이름으로 보존한 뒤 두 exact read RPC만 추가해야 한다. 기존 권한을 포함한 후속 적용 순서의 격리 검증과 백업을 먼저 수행한다. 빠른 배포 도구의 함수 SQL 제한을 우회하지 않는다.
