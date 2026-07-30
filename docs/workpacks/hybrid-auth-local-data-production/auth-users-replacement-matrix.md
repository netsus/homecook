# `auth.users` replacement matrix

Stage 2 local authority migration:
`supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql`

| 기존 의존 | Stage 2 replacement | 삭제/재생성 정책 | 격리 restore 결과 |
| --- | --- | --- | --- |
| `admin_members.user_id -> auth.users(id)` | `public.users(id)` | `ON DELETE CASCADE`, migration에서 validate | valid |
| `admin_members.granted_by -> auth.users(id)` | `public.users(id)` | `ON DELETE SET NULL`, migration에서 validate | valid |
| `admin_audit_logs.actor_admin_user_id -> auth.users(id)` | `public.users(id)` + `actor_identity_created_at_snapshot` | historical actor는 application owner로만 참조하고 `ON DELETE SET NULL`, migration에서 validate | valid |
| `set_account_generation_cutover_snapshot()` digest/read | local `auth.users` population을 authority로 쓰지 않음 | Stage 2에서는 기존 public error `ACCOUNT_LIFECYCLE_MAINTENANCE`로 fail closed | replaced |
| `promote_account_generation_cutover()` digest/lock | remote epoch mirror + 별도 maintenance barrier가 후속 authority | local write/cutover 미개방, fail closed | replaced |
| `resolve_account_cutover_quarantine()` identity read | `private.remote_auth_identity_epochs` + HMAC session binding | Stage 2에서는 fail closed | replaced |
| `bootstrap_account_generation_identity()` identity read | `record_hybrid_remote_session_authority()` control-plane RPC | `service_role`만 실행, capability `legacy`만 허용, public user row를 생성하지 않음 | replaced |
| `auth.users` table lock | issuer+owner advisory transaction lock | local Auth table lock 금지 | zero |
| identity/session digest | issuer, owner UUID, identity epoch, session ID의 versioned HMAC | raw token, refresh token, email/provider payload 저장 금지 | PII-free |

격리된 encrypted-restore PG17 검증 결과:

- `auth.users=0`, `public.users=5`, `public tables=82`, `storage.objects=1`
- `auth.users` 외부 FK residual `0`
- final `pg_proc` body의 `auth.users` residual `0`
- external normal `pg_depend` residual `0`
  (`auth.users` 자체 index/toast/check constraint의 auto/internal dependency는 table 내부 구조라 제외)
- invalid constraint `0`
- account-generation capability `legacy`
- 알려진 pre-migration gap `admin_members_missing_auth=1`,
  `admin_audit_missing_auth=99`는 validated `public.users` actor/owner authority로 대체
- epoch+binding create, exact method/path attestation, revoke rejection은 한 transaction에서 실행 후 rollback

이 문서는 Stage 2 schema replacement 증거다. remote identity reconcile, user write
cutover, generation activation, production write를 승인하지 않는다.
