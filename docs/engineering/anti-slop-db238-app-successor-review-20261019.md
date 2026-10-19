# DB238 이후 Anti Slop 앱 전용 후속 배포 경계 검토

상태: 최소 앱 successor 검증기/공식 CLI 연결과 관련 회귀·독립 리뷰를 통과했다. 원 DB238 승인/PIN·가드는 수정하지 않는다. 부모의 영양5행 작업 완료 인계 후 현재 데이터 읽기 전용 재확인과 별도 exact 앱 승인 결속을 완료했다. 코드 통합과 공식 plan·배포·최종 실제 흐름 확인은 아직 후속이다. 이 문서는 승인 자체가 아니다.

## 구현된 경계와 검증 후보

- 앱 후보 C는 `f204073a2dbd8468644d7f40e206f48ec6518e20`이다. 별도 도구 T는 이 후보 위에서 작성하며, 앱 C의 승인으로 도구 T를 승인하거나 PIN 자기참조를 만들지 않는다.
- `scripts/lib/prelaunch-db-app-successor.mjs`는 별도 create-only 승인 파일의 exact digest, 원 committed238 receipt/guard binding, live SHA/build/plist, reader floor→live→candidate 조상, 전체 변경 파일과 before/after blob을 검증한다. `--reviewed-ref --already-applied-db --db-config`의 정상 앱 경로만 사용하며 baseline/환경 patch/다른 reviewed mode/테스트 생략을 허용하지 않는다.
- 허용 제품 파일은 이번 타입 정리의 정확한 파일 집합이다. SQL·환경·키·auth·worker·보호 설정을 일반적으로 허용하지 않는다. 기존 closed R2 환경/DB/제어 검사는 그대로 유지한다.
- live→C에 포함된 역사적 `saved-recipe-nutrition-maintenance.mjs` PIN 바인딩은 이번 수정이 아니다. SHA256 `319506c51d235a8eb2844dd6f9a95a75833e4547d1bd8b44e4f5479824ae5655`→`cd5668ce05f0fdcf89e448243d7244af1f204ffc539719bf9f1e3aea07dba070`인 정확한 단일 파일만 classifier support로 넘긴다. 전체 앱 파일을 support로 바꾸거나 구 maintenance handoff 권위를 부여하지 않는다.
- C의 `pnpm typecheck`, `pnpm build`, 공식 `test:feedback-batch:web` 1466 PASS/133 이름 필터 SKIP를 확인했다. build의 기존 hook/미사용 변수 경고4건은 남는다. Anti Slop126/baseline207/신규0이며 검사 설정을 바꾸지 않았다. 이 검사는 실제 운영 DB/RLS 또는 배포 후 브라우저 흐름 확인을 대신하지 않는다.
- 새 helper42/실제 CLI18(합60)와 기존 exact238 7개 회귀가 통과했다. CLI fixture는 실제 plan/deploy의 release 생성 전 경계/stage 몸체·실제 검증기/classifier를 실행하며, 운영 대신 합성 관측값을 사용한다. 역사적 operator 쌍은 공개 Git blob 실제 SHA256으로 확인한다. 기존229/231/232 테스트의 오래된 import 재배치·CLI 필수 상수 주입을 보완하며 기대값이나 제품 검사를 완화하지 않았다.
- 기존229/231/232 76개와 일반 배포110개를 최종 파일로 함께 재실행해186 PASS를 확인했다. 보상 source-ancestor=false도 실제 DeploymentError를 검증한다. 관련 ESLint는 경고0이다.
- 원 DB235/238의 transaction 행·OID·worker 관측은 역사적 authority 증거이지 새 앱의 fresh 운영 baseline이 아니다. 인계 후 현재 DB238/closed-R2/worker 검증과 별도 exact 앱 승인을 다시 확인해야 한다.
- 인계 후 운영은 d09/DB238 ready·recoveryPending=false다. canonical 저장소에서 두부 revision4 양조간장60g/조청30g, 소갈비 revision2 간장90ml/맛술90ml, 잡채 revision3 물300ml을 읽기 전용으로 재확인했다(재료 총42개). 이 작업에서는 DB 쓰기·영양 재발행을 하지 않는다. 최초 legacy `recipe_ingredients` 조회는 이 canonical 저장소의 재료가 없어, 실제 `youtube_saved_recipe_results.editable_content_json`에서 확인했다.
- 새 승인 raw SHA256은 `ee3d6baf1b42fe168ed53977fe230e80e89e034840764696669697225992bf32`이며 전용 비공개 디렉터리에 create-only로 생성했다. exact54파일, live build/plist, 원 maintenance binding과 인계 후 fresh 관측을 담는다. 두 차례 읽기에서 normalData SHA256 `82205065b22ff73da3807157a909f4de50f86f1a8b28817ab80eea23003bbb7e`가 같았다. fresh 지문은 수동 전후 대조 기준이며 source 검증기가 이를 현재 DB와 자동 비교한다고 주장하지 않는다.

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

## 최초 검토의 최소 도구 제안과 승인 범위 (이력)

아래는 추가 승인 전 작성한 제안이다. 구현·검증의 최신 상태는 위 절을 따른다. 정상 앱 전용 옵션을 유지하되, 최초238 exact source handoff와 구분되는 검증된 새 앱 후보 successor 경계를 별도로 추가한다. 단순 feature 목록 확대, 가드 삭제, 검사 생략, 옛 PIN 재지정은 하지 않는다.

1. 기존 `nutritionSourceHandoff` 분기에서 current238의 SQL 없는 앱 변경을 별도 검증기로 연결한다. 검증기는 원235/238 review/committed receipt/guard와 live 조상 계보를 그대로 확인하고, 정확한 live→candidate 파일·before/after blob bytes에 대한 **별도 create-only 승인 근거**를 요구한다. 과거 정확 source 쌍의 검사는 유지한다.
2. SQL 추가/수정·DB 쓰기·환경/키·worker·인증/권한·보호 설정 변경은 앱 successor로 허용하지 않는다. 이번 수정에서는 type-only와 읽기 경로 정합화의 실제 의미를 별도 리뷰하며, 임의의 상세 파일 변경 전체에 권한을 부여하지 않는다. 기존 승인/receipt/PIN·고정 A/B·만료·reader floor·R2/lead/C05 OFF를 갱신하지 않는다.
3. 최소 제품 도구 범위는 `scripts/deploy-prelaunch-web.mjs`의 해당 선택 분기와 별도238 앱 successor 검증기/관련 문서다. 기존 `saved-recipe-nutrition-maintenance.mjs`의 exact handoff 및 PIN은 수정 대상으로 삼지 않는다. 기존 DB/worker/배포 일반 허용 목록은 넓히지 않는다.
4. 실제 CLI의 `nutritionSourceHandoff` 진입점에서 정상238 앱-only와 음성 사례를 검사한다: source 조상 불일치, live/build 불일치, receipt/guard/feature 불일치, 후보 SHA 또는 blob 누락/불일치, SQL·환경·보호 소스 변경, 잘못된/누락된 새 승인, 과거 exact238 handoff 변조, 기존231/232 동작 보존. helper fixture만 통과한 것으로 끝내지 않는다.
5. 부모에게 필요한 추가 승인은 **새238 앱 successor 검증 경계의 최소 구현·회귀·독립 리뷰 및 정확한 후보/승계 근거 추가**다. 기존 PIN·승인을 덮어쓰기, SQL 적용·DB/권한/정책 변경은 포함하지 않는다. 구현 검증 후 정확한 새 SHA의 공식 plan을 먼저 확인하고 통과한 경우에만 직렬 deploy·실제 상세 흐름을 확인한다.

당시에는 도구 구현을 추가 승인 전까지 보류했다. 현재는 구현 승인을 받았으며, 실제 배포는 위 영양5행 작업 완료 인계와 별도 exact 앱 승인 결속 전까지 보류한다.
