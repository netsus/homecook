# QA Fixtures

## Slice 01-05

- 공통 fixture 원본: `qa/fixtures/slices-01-05.json`
- 앱 QA fixture 모드: `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
- 실 DB smoke seed: `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`

## Notes

- QA fixture 모드는 `localStorage["homecook.e2e-auth-override"]` 값을 읽어 guest/authenticated 상태를 재현한다.
- 실 DB smoke는 Supabase 실스키마에 합성 데이터를 넣는다. 플래너 결과를 가장 안정적으로 보려면 빈 테스트 계정을 쓰는 편이 좋다.
- fixture 모드와 DB smoke는 동시에 쓸 필요가 없다.
