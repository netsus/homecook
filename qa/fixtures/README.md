# QA Fixtures

## Slice 01-05

- 공통 fixture 원본: `qa/fixtures/slices-01-05.json`
- real local DB 브라우저 검증: `pnpm dev:local-supabase`
- 앱 QA fixture 모드: `pnpm dev:qa-fixtures`
- local 테스트 계정 seed: `pnpm qa:seed:01-05 -- --user-email local-tester@homecook.local`
- 실 DB smoke seed: `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`

## Notes

- QA fixture 모드는 앱 우하단 QA toolbar와 `localStorage["homecook.e2e-auth-override"]` 값을 읽어 guest/authenticated 상태를 재현한다.
- `pnpm dev:local-supabase`는 mock 없이 local Supabase auth/session/DB를 그대로 사용한다.
- 일반 `pnpm dev`에서는 QA localStorage override를 읽지 않는다. fixture를 보려면 `pnpm dev:qa-fixtures`를 사용한다.
- 실 DB smoke는 Supabase 실스키마에 합성 데이터를 넣는다. 플래너 결과를 가장 안정적으로 보려면 빈 테스트 계정을 쓰는 편이 좋다.
- fixture 모드와 DB smoke는 동시에 쓸 필요가 없다.
