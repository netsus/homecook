# QA Fixtures

## Slice 01-05

- 공통 fixture 원본: `qa/fixtures/slices-01-05.json`
- real local DB 브라우저 검증: `pnpm dev:local-supabase`
- one-command local demo 실행: `pnpm dev:demo`
- clean reset + 실행: `pnpm dev:demo:reset`
- local demo dataset 전체 리셋: `pnpm local:reset:demo`
- local demo dataset 재주입만: `pnpm local:seed:demo`
- 앱 QA fixture 모드: `pnpm dev:qa-fixtures`
- local 테스트 계정 seed: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
- 실 DB smoke seed: `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`

## Notes

- `pnpm local:reset:demo`는 local Supabase를 reset한 뒤, 메인/다른 테스트 계정과 slices 01~05 데모 데이터를 다시 만든다.
- `pnpm dev:demo`는 Docker와 local Supabase를 확인한 뒤, demo dataset이 비어 있으면 자동으로 seed하고 Next dev 서버를 켠다.
- `pnpm dev:demo:reset`는 clean reset이 필요할 때 쓰는 one-command 경로다.
- local 로그인 카드는 메인 계정과 다른 유저 계정을 둘 다 제공한다. 소유권/경계 테스트는 `다른 테스트 계정으로 시작`을 사용한다.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`이 `.env.local` 또는 현재 셸에 있으면 `pnpm dev:demo`에서도 Google OAuth 버튼이 함께 노출된다.
- QA fixture 모드는 앱 우하단 QA toolbar와 `localStorage["homecook.e2e-auth-override"]` 값을 읽어 guest/authenticated 상태를 재현한다.
- `pnpm dev:local-supabase`는 mock 없이 local Supabase auth/session/DB를 그대로 사용한다.
- 일반 `pnpm dev`에서는 QA localStorage override를 읽지 않는다. fixture를 보려면 `pnpm dev:qa-fixtures`를 사용한다.
- `pnpm qa:seed:01-05`는 여전히 특정 user id/email 기준의 ad-hoc smoke seed 용도로 유지한다.
- fixture 모드와 DB smoke는 동시에 쓸 필요가 없다.
