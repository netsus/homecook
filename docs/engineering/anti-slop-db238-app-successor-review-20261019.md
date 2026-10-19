# DB238 이후 Anti Slop 앱 전용 후속 배포 경계 검토

상태: 읽기 전용 분석·최소 변경 제안. 배포 도구/가드/PIN/기존 승인/운영 변경0. 이 문서는 추가 승인이 아니다.

## 현재 결과와 원인

- PR1811의 검증 head `572063abd9f2893cca72cacdfadd14d4143e1ad9`는 master `64112be4bec14e29f88449214140250685210f15`로 머지됐다. 운영은 여전히 웹 `d09ab4bcdd519e2921165ff33779821096172373`/DB238 ready이며 복구 대기 없음이다. 실제 상세의 새 코드 운영 검증은 아직 못 했다.
- 정상 앱 전용 명령 `pnpm deploy:dev:plan -- --reviewed-ref 64112be4bec14e29f88449214140250685210f15 --already-applied-db --db-config <기존 full-local 비공개 설정> --test-script test:feedback-batch:web`는 exit1, `Exact nutrition/recipe-save source is not already committed under its separate authority`로 거부됐다. 실제 deploy는 실행하지 않았다.
- `scripts/deploy-prelaunch-web.mjs`의 `nutritionSourceHandoff`는 상세 파일에 기존 PATCH의 `read_recipe_future_patch_result` 또는 `write_recipe_future_plan_change_recoverable` 문자열이 있으면 파일을 recipeRuntime으로 분류한다. 이번에 PATCH를 수정했는지나 emitted 동작이 같은지는 판정하지 않는다. 이는 source gate이며 검출 자체가 권한 변경의 증거는 아니다.
- 이 분기의 feature 허용과 바로 다음 SQL 없는 runtime-only/조상 검사는 모두 recipe-save-recovery231/request-role232에 한정된다. 실제 current maintenance는 saved-recipe-nutrition-experience238이어서 거부된다.
- 238의 별도 `assertSavedRecipeNutritionSourceHandoff`는 과거 승인한 정확한 review.from/to·legacy build/plist·전체 파일/blob pair만 허용한다. 같은238 위의 임의 새 앱 후보를 위한 별도 successor는 아니다. 기존 flag·다른 reviewed mode·옛 source 쌍을 전용해 배포할 근거가 없다.

## PR1811 실제 영향 확인

- 실제 diff는 상세 GET route, 새 테스트, 진행 원장, inventory4파일이다. SQL·DB schema·인증/권한 소스·배포 설정 변경0이다.
- native 타입과 literal select로 기존 재료 조회를 맞췄으며, 같은 request client·네 projection의 선택 열/순서·recipe_id·sort_order·공개/인증 제품 라벨·정규화·canonical 영양·quantity 경로는 회귀 검사/독립 리뷰로 확인했다. 새로운 권한이나 writer 경로를 추가하지 않았다.
- TypeScript AST에서 각 함수만 추출해 ES2022/ESNext로 emit한 대조에서 PATCH는 양쪽 SHA256 `10747bb756e5f82b82904b54fb05d8174a071a59a3f69d84f619411f4975f2ee`, DELETE는 `e724932fe988a3bd2be6d4186edee90ae444319ab337cf68128cb07b0439075f`로 동일하다. GET 외 다른 기존 함수도 모두 동일하다. GET은 변경됐으므로 파일 전체 JS 동일이라고 주장하지 않는다.
- 이는 공개 Git/소스·SDK fixture·compiler 증거다. 실제 DB/RLS 또는 새 웹의 운영 흐름을 재검사한 증거로 확대하지 않는다.

## 제안하는 최소 도구 수정과 추가 승인 범위

**미구현 제안**: 정상 앱 전용 옵션을 유지하되, 최초238 exact source handoff와 구분되는 검증된 새 앱 후보 successor 경계를 별도로 추가한다. 단순 feature 목록 확대, 가드 삭제, 검사 생략, 옛 PIN 재지정은 하지 않는다.

1. 기존 `nutritionSourceHandoff` 분기에서 current238의 SQL 없는 앱 변경을 별도 검증기로 연결한다. 검증기는 원235/238 review/committed receipt/guard와 live 조상 계보를 그대로 확인하고, 정확한 live→candidate 파일·before/after blob bytes에 대한 **별도 create-only 승인 근거**를 요구한다. 과거 정확 source 쌍의 검사는 유지한다.
2. SQL 추가/수정·DB 쓰기·환경/키·worker·인증/권한·보호 설정 변경은 앱 successor로 허용하지 않는다. 이번 수정에서는 type-only와 읽기 경로 정합화의 실제 의미를 별도 리뷰하며, 임의의 상세 파일 변경 전체에 권한을 부여하지 않는다. 기존 승인/receipt/PIN·고정 A/B·만료·reader floor·R2/lead/C05 OFF를 갱신하지 않는다.
3. 최소 제품 도구 범위는 `scripts/deploy-prelaunch-web.mjs`의 해당 선택 분기와 별도238 앱 successor 검증기/관련 문서다. 기존 `saved-recipe-nutrition-maintenance.mjs`의 exact handoff 및 PIN은 수정 대상으로 삼지 않는다. 기존 DB/worker/배포 일반 허용 목록은 넓히지 않는다.
4. 실제 CLI의 `nutritionSourceHandoff` 진입점에서 정상238 앱-only와 음성 사례를 검사한다: source 조상 불일치, live/build 불일치, receipt/guard/feature 불일치, 후보 SHA 또는 blob 누락/불일치, SQL·환경·보호 소스 변경, 잘못된/누락된 새 승인, 과거 exact238 handoff 변조, 기존231/232 동작 보존. helper fixture만 통과한 것으로 끝내지 않는다.
5. 부모에게 필요한 추가 승인은 **새238 앱 successor 검증 경계의 최소 구현·회귀·독립 리뷰 및 정확한 후보/승계 근거 추가**다. 기존 PIN·승인을 덮어쓰기, SQL 적용·DB/권한/정책 변경은 포함하지 않는다. 구현 검증 후 정확한 새 SHA의 공식 plan을 먼저 확인하고 통과한 경우에만 직렬 deploy·실제 상세 흐름을 확인한다.

현재 승인이 필요한 도구 단계만 보류한다. 독립 요리모드의 별도 로컬 수정·검증은 이 운영 차단과 분리해서 진행한다.
