# Marketing demand validation source archive

이 디렉터리는 독립 저장소 `mumeok-funnel`의
`0aaa282552256ac9e77a5c134bb45a52e42ade33` 시점에서 Homecook에 반드시 남겨야 할
고유 자산을 가져온 canonical archive다. 원본 상대경로를 각 보존 루트 아래 유지하며,
제품 runtime이나 production release 파일은 변경하지 않는다.

## Cleanup plan

1. 원본의 고유 tracked 파일 47개와 선택한 ignored final evidence 6개를 합쳐 53개를
   Homecook tracked 후보로 byte-identical하게 가져온다.
2. 각 파일의 Homecook 저장소 상대경로, 원본 상대경로, bytes, SHA-256을
   `manifest.json`에 고정한다.
3. 가져오지 않은 tracked 파일 8개와 ignored 고유 파일 155개는 Homecook에 억지로
   섞지 않고 외부 archive로만 보존한다.
4. canonical import가 origin에 merge되고 active task/process가 0이 되기 전에는 독립
   저장소를 삭제하지 않는다.

## Homecook tracked import: 53

- 이 루트: final design baseline 24개, 비실행 원문 `Prototype.tsx.txt`/CSS 2개,
  design QA/product decisions 2개, final-v4 4장, final-v5 2장
- `docs/marketing/assets/campaign/0aaa282/`: 광고 export 7개
- `docs/marketing/assets/source/0aaa282/`: source/decor 4개,
  Hero A/B/C solution·visual 6개, 비실행 원문 광고 generator/test 2개

파일별 검증값은 `manifest.json`의 53개 항목을 따른다. `README.md`와
`manifest.json` 자체는 가져온 53개에 포함하지 않는다.

## External-only archive: 163

Homecook으로 가져오지 않은 고유 파일은 163개다. 독립 저장소의 나머지 tracked 파일
8개와 가져오지 않은 ignored 고유 source/evidence 155개로 구성된다. 이 파일은 아래
검증된 외부 archive에서 복구한다.

- Git bundle: `mumeok-funnel-all.bundle`
  - SHA-256: `40a8f6ff3d21d5f2d90b74f7dedf329f7cb86a7204651acf73fcf789816b60fc`
- ignored archive: `mumeok-funnel-ignored-unique.tar.gz`
  - SHA-256: `840763a848696dc1d606730e5c65661e796e008a6abe4f31a2128f45aa563a15`

외부 archive 위치와 restore 검증 결과는
`docs/engineering/repository-source-consolidation-archive-receipt.json`을 기준으로 한다.
독립 저장소가 active한 동안은 삭제하지 않는다.
