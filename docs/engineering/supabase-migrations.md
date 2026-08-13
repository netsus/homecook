# Supabase Migrations

이 문서는 슬라이스 개발 중 DB 스키마 변경을 어떻게 관리할지 정한다.

Supabase target과 금지 사항은 `docs/engineering/supabase-local-only-operations.md`가 canonical이다. 이 문서는 local migration artifact 작성과 검증 방법만 구체화한다.

## Prerequisites (첫 마이그레이션 전에 1회)

1. Supabase CLI 설치:
   - macOS: `brew install supabase/tap/supabase`
   - 공식 문서: https://supabase.com/docs/guides/cli/getting-started

2. CLI 초기화 (저장소 루트에서, 이미 `supabase/config.toml`이 커밋되어 있음):
   ```bash
   # config.toml이 없을 때만 실행
   supabase init
   ```

3. local runtime 시작:
   ```bash
   supabase start
   supabase status
   ```
   Cloud project 연결, `project-ref`, remote credential은 필요하지 않으며 `supabase link`와 `--linked`는 금지한다.

## Migration Convention

- **디렉토리**: `supabase/migrations/`
- **파일명**: `<timestamp>_<slice>_<description>.sql`
  - 예: `20260317_05_add_meals_table.sql`
- **새 파일 생성**:
  ```bash
  supabase migration new <description>
  ```

## Trigger 조건

마이그레이션 파일이 **필요한** 경우:
- 테이블 추가 / 삭제
- 컬럼 추가 / 변경 / 삭제
- 인덱스 추가 / 삭제
- RLS 정책 추가 / 변경 / 삭제

마이그레이션 파일이 **불필요한** 경우:
- 기존 테이블을 읽기만 하는 슬라이스 (예: `02-discovery-filter`)
- API 로직, 타입, 컴포넌트만 변경하는 경우

workpack README의 `Schema Change` 체크박스로 해당 슬라이스의 필요 여부를 명시한다.

## Isolated local replay

```bash
supabase db reset --local --yes
```

- 이 명령은 fresh isolated development/CI stack에서만 실행한다.
- 운영 full-local volume, port, env 또는 secret mount를 공유하는 target에서는 실행하지 않는다.
- 운영 데이터가 있는 full-local target의 destructive reset은 금지한다.

## Controlled local apply

- migration 적용이 필요한 실제 full-local target은 target identity, immutable backup, maintenance fence, rollback/forward-fix 계획을 먼저 기록한다.
- deploy 목적의 무표시/remote `supabase db push`는 금지한다. 운영 apply는 별도 승인된 local runbook이 exact local database target을 확인한 뒤 수행한다.
- read-only preflight와 before/after schema identity·checksum evidence 없이 운영 apply를 완료로 기록하지 않는다.

## CI 정책

CI는 pinned Supabase CLI로 fresh local stack을 시작해 migration 전체를 replay한다. Cloud/remote secret, link 또는 database credential은 사용하지 않는다.

## 롤백

롤백은 **신규 마이그레이션 파일**로 처리한다.
`down.sql` 파일은 사용하지 않는다.

예: 테이블 추가를 롤백하려면 `DROP TABLE` 구문이 담긴 새 마이그레이션 파일을 추가한다.
