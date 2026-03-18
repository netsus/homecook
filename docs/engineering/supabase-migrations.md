# Supabase Migrations

이 문서는 슬라이스 개발 중 DB 스키마 변경을 어떻게 관리할지 정한다.

## Prerequisites (첫 마이그레이션 전에 1회)

1. Supabase CLI 설치:
   - macOS: `brew install supabase/tap/supabase`
   - 공식 문서: https://supabase.com/docs/guides/cli/getting-started

2. CLI 초기화 (저장소 루트에서, 이미 `supabase/config.toml`이 커밋되어 있음):
   ```bash
   # config.toml이 없을 때만 실행
   supabase init
   ```

3. 프로젝트 연결 (개인 환경에서, 커밋 불필요):
   ```bash
   supabase link --project-ref <project-ref>
   ```
   `<project-ref>`는 Supabase Dashboard → Project Settings → General에서 확인한다.

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

## 로컬 적용

```bash
supabase db push
```

## CI 정책

현재 CI에서는 마이그레이션을 실행하지 않는다 (시크릿 없음).
마이그레이션은 개발자가 로컬에서 직접 실행하고 SQL 파일만 커밋한다.

## 롤백

롤백은 **신규 마이그레이션 파일**로 처리한다.
`down.sql` 파일은 사용하지 않는다.

예: 테이블 추가를 롤백하려면 `DROP TABLE` 구문이 담긴 새 마이그레이션 파일을 추가한다.
