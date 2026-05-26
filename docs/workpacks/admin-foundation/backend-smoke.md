# Admin Foundation Backend Smoke

Stage 2 local/ops smoke 절차다. 실제 Supabase 인스턴스에서 실행할 때만 evidence로 인정한다.

## 1. Migration

```bash
supabase db push
```

확인 SQL:

```sql
select to_regclass('public.admin_members') as admin_members,
       to_regclass('public.operational_events') as operational_events,
       to_regclass('public.admin_audit_logs') as admin_audit_logs;
```

세 값이 모두 `public.<table>`이면 migration이 적용된 상태다.

## 2. First Admin Bootstrap

운영자가 OAuth로 한 번 로그인해 `auth.users.id`가 생긴 뒤, service-role 또는 Supabase SQL editor에서 정확히 한 명만 등록한다.

```sql
insert into public.admin_members (user_id, role)
values ('<operator-uuid>', 'viewer')
on conflict (user_id) do nothing;
```

runtime 환경변수 allowlist 우회는 사용하지 않는다. `admin_members`가 관리자 신원의 유일한 소스다.

## 3. Fail-Closed Check

로컬 검증에서만 `SUPABASE_SERVICE_ROLE_KEY`를 제거한 별도 프로세스로 Admin API를 호출한다.

```bash
curl -i http://localhost:3000/api/v1/admin/users
```

로그인 세션이 없는 경우 `401`이 먼저 나올 수 있다. 로그인 세션이 있고 service role만 빠진 경우 기대 결과는 `500`과 `ADMIN_SERVICE_ROLE_UNAVAILABLE`이다. 이 경로에서도 route handler client로 admin 데이터를 읽으면 실패다.

## 4. PII Redaction Spot Check

다음 흐름을 각각 한 번씩 발생시킨 뒤 `operational_events`와 `admin_audit_logs`를 조회한다.

- OAuth callback failure
- YouTube provider failure
- Admin user search

확인 기준:

- `request_path`에는 query string이 없어야 한다.
- `metadata_json`에는 OAuth `code`/`next`/`error`, YouTube URL/source text, admin search term, email, nickname, private shopping/pantry detail이 없어야 한다.
- `admin_audit_logs.ip_hash`와 `user_agent_hash`는 `sha256:` prefix만 저장하고 원문을 저장하지 않는다.
