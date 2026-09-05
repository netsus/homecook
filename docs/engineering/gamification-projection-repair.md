# 성장 정보 조회의 서버 저장 권한 복구

2026-09-06 사용자 승인: 성장·업적 정보 500 오류 수정 및 검증.

## 원인과 변경 범위

`GET /users/me/gamification`의 기존 silent reconcile이 사용자 권한으로 업적 INSERT,
배지 INSERT, 퀘스트 UPSERT를 실행했다. 해당 테이블의 사용자 권한은 SELECT 전용이며,
계정 세대 보호도 내부 저장 경로를 요구하므로 실제 PostgreSQL에서
`new row violates row-level security policy for table "user_achievement_awards"`가 발생했다.

사용자에게 테이블 쓰기 권한을 추가하지 않는다. 성장 정의·계산·조회는 기존 코드와 사용자
클라이언트를 유지하고, 이 GET의 저장만 검증된 본인 세션을 받는 서버 전용 RPC로 보낸다.
성장 요약이 없는 경우의 생성도 같은 경로를 사용한다. 다른 호출의 기본 동작은 유지한다.
업적 중복 처리, 사용자 확인 상태, 과거 알림 미생성 계약을 유지한다.

## DB 선행 조건과 배포

- DB migration: `supabase/migrations/20260906010000_gamification_projection_writer.sql`.
- service_role 전용 RPC와 정확한 내부 scope/path를 추가하며, 기존 wrapper 분기를 보존한다.
- 기존 `assert_recipe_future_session_authority`와 같은 transaction의 내부 쓰기 표식을 사용한다.
- 앱 변경보다 DB 함수를 먼저 적용한다. 기존 웹과 호환되는 추가 경로이며 worker 재가동은 하지 않는다.
- 함수 생성은 빠른 추가형 DB 배포기의 허용 범위 밖이다. 해당 자동 경로를 확장하거나 검사를
  비활성화하지 않고, 승인된 controlled local SQL 적용과 웹 배포를 별도 수행한다.
- SQL은 exact container/image/volume 확인, 전체 DB·schema 백업, 격리 검증 후 한 transaction으로
  적용한다. 오류 시 rollback하며 DB 전체 restore/reset을 실행하지 않는다.
- 웹은 SQL 선행 조건 확인 후 기존 출시 전 `--reviewed-ref` 웹 배포 경로로 검증·교체한다.
- SQL 원본은 별도 migration commit으로 보존해 후속 전체 schema replay에도 포함한다.

## 검증

- Vitest: 읽기 전용 클라이언트 + 별도 저장 writer, 세션/소유자 불일치, 오류 전달,
  업적 중복, 과거 알림 미생성, 누락 성장 요약, RPC-only factory.
- 실제 운영 DB 백업을 같은 이미지의 네트워크 없는 임시 PostgreSQL에 복원해
  `tests/gamification-projection-postgres.sql` 실행. 운영 volume/port 공유 금지.
- SQL 테스트는 업적·배지·퀘스트·요약 저장, 업적 중복, 다른 소유자/이벤트/세션 거부,
  사용자 실행 금지, scope/method 제한, 알림 수 보존, 내부 표식 정리를 검증한다.
- 전체 lint/typecheck와 웹 배포의 product tests/build 검사를 수행한다.
- 배포 후 실제 사용자 `users/me/gamification` 응답 및 오류 로그를 확인한다.

알림 확인·튜토리얼 닫기 등 다른 쓰기 endpoint의 권한 경로 변경은 이 GET 수정에 포함하지 않는다.
