# Slice 28 Public Data Live Fetch Smoke - 2026-05-29

## Scope

`.env.local`의 `DATA_GO_KR_API_KEY`만 사용해서 식약처/농식품올바로 계열 source를 실제 API로 가져올 수 있는지 확인했다.

사용한 source:

- 식약처: 공공데이터포털 `전국통합식품영양성분정보(가공식품)표준데이터`
- 농식품올바로/RDA: 공공데이터포털 `농촌진흥청 국립식량과학원_농식품 국가표준식품성분정보 조회 서비스`
- 농식품올바로 legacy endpoint: `https://koreanfood.rda.go.kr/kfi/openapi/service`

## Command

```bash
pnpm external:ingredients:live-fetch -- --providers mfds,rda --output-dir .artifacts/external-ingredient-ingest/live-public-data-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z --rda-groups A --mfds-rows 5 --rda-page-size 5
```

## Result

- successful providers: 0 / 2
- source export rows: 0
- candidate dry-run executed: no
- production DB writes: 0

Provider details:

- `mfds`: failed, `code=30`, `message=SERVICE KEY IS NOT REGISTERED ERROR.`
- `rda`: failed, `code=HTTP_401`, `message=Unauthorized`
- `rda legacy koreanfood endpoint` manual probe with the same public data key: failed, `resultCode=9100`, `resultMsg=일치하는 API키가 없습니다.`

Generated artifacts:

- `.artifacts/external-ingredient-ingest/live-public-data-2026-05-29/live-fetch-report.json`
- `.artifacts/external-ingredient-ingest/live-public-data-2026-05-29/live-source-export.json`
- `.artifacts/external-ingredient-ingest/live-public-data-2026-05-29/live-fetch-summary.md`

## Interpretation

현재 `.env.local`의 공공데이터포털 인증키는 일반 key 값으로는 존재하지만, 이번 live smoke 대상 API에 대해 아직 사용 가능하지 않다.

- 식약처 표준데이터는 해당 API 활용신청/승인 또는 key 등록 상태가 필요하다.
- RDA 신규 공공데이터포털 API는 같은 key fallback으로는 `401 Unauthorized`가 발생했다.
- 농식품올바로 legacy API는 공공데이터포털 key와 별도 key를 기대하는 것으로 보이며 같은 key를 `apiKey`로 넣으면 거부된다.

## Verification

```bash
pnpm exec vitest run tests/external-ingredient-live-fetch-script.test.ts tests/external-ingredient-file-dry-run-script.test.ts tests/external-ingredient-ingest.test.ts
pnpm external:ingredients:live-fetch -- --providers mfds,rda --output-dir .artifacts/external-ingredient-ingest/live-public-data-2026-05-29 --generated-at 2026-05-29T00:00:00.000Z --rda-groups A --mfds-rows 5 --rda-page-size 5
```

## Remaining Risk

- 실제 data ingest는 아직 file-backed fixture 경로만 성공했다.
- production seed promotion 전에는 dataset별 license metadata와 활용신청 상태를 source artifact에 함께 보관해야 한다.

## Follow-up

인코딩된 공공데이터포털 인증키와 API 활용신청 반영 이후 식약처/RDA live fetch가 모두 성공했다. 균형 샘플 결과는 `docs/workpacks/28-external-ingredient-data-ingest-gate/live-fetch-balanced-sample-2026-05-29.md`에 기록한다.
