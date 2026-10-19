# DB238 이후 Anti Slop 앱 전용 후속 배포 경계 검토

상태: PR1812로 최소 앱 successor 검증기/공식 CLI와 검증된 타입 정리를 master에 통합하고, 공식 앱-only 배포와 최종 브라우저 읽기 검증을 완료했다. 원 DB238 승인/PIN·가드는 불변이다. 영양5행 완료 인계 후 exact 앱 승인과 fresh 기준을 별도로 결속했다. 이 문서는 승인 자체가 아니다.

## 실제 통합·배포 결과

- PR1812 head `484e89df92f5104a21ce8ae91cf1bf74ad338c54` → merge `cd91be21ac12d1a04a15467d057b6b682cc6d75a`. 앱 C의 조상 관계를 일반 merge로 보존했다. draft부터 시작했고 관련 검사·독립 리뷰 후 반영했으며 CI/보호 설정은 변경하지 않았다.
- 공식 plan은 C의 exact54파일·SQL0·환경0·DB 읽기 전용·`test:feedback-batch:web`를 확인했다. 공식 `pnpm deploy:dev`에서 웹1466 PASS/133 이름 필터 SKIP·타입/빌드·별도 포트·DB/closed-R2/worker 승계 검사를 거쳐 앱 C로 교체했다.
- 실제 ref는 `f204073a2dbd8468644d7f40e206f48ec6518e20`, build는 `prelaunch-f204073a2dbd-A2tFiO`. 공식 status에서 DB238 ready·원 readerFloor48c4 보존·복구 대기 없음이다. 배포 단계의 SQL/DB 구조/운영 데이터·환경·키/자격·worker/정책 변경은 없다. 이후 QA의 기존 조회수 부수효과는 아래에 별도 기록한다.
- 브라우저 QA 전에9개 normal/preserved/attestation/control/execution/ledger/catalog/immutable/stableImmutable 지문을 배포 전 기준과 대조해 모두 같음을 확인했다. 인계된5수량과 다른37재료·원문·과거 끼니/요리/스냅샷을 되돌리지 않았다. 이는 수동 전후 관측이며 기존 source 검증기의 검증 범위를 확대해 주장하지 않는다.
- 실제 운영 앱의 격리 Chrome 공개 읽기에서3개 상세/5수량과 revision4/2/3·총42재료, 1440/375px6개 화면·가로 넘침0, 인분 보기2→3→2, 모바일 재료→만들기→재료, 비로그인 요리 안내→로그인 `next`를 확인했다. 공개 cook-mode는 필수 인분 누락422/정상2인분200·13재료이며, 북/장보기 보호 GET은401·없는 레시피는404다. pageerror0/쓰기 요청0이다. 실제 로그인·저장·장보기 완료·요리 완료나 전체 RLS 검증으로 확대하지 않는다.
- `playwright-interactive`의 js_repl 도구가 없어 설정을 변경하지 않고 기존 `@playwright/test`의 격리 Chrome을 사용했다. 사용자 프로필/쿠키를 복제하지 않았고 브라우저는 종료했다. 초기 QA의 hidden title locator와 `ml`/표시 `mL`, cook-mode 필수 query 누락의 기대를 실제 계약에 맞춰 수정했으며 제품·검사를 완화하지 않았다. 로컬 `.omx/evidence/db238-app-successor-20261020/`의 inventory/QA script/report/screenshots로 범위와 증거를 보존한다.

## QA 후 조회수 부수효과 (원 지문 차이 보존)

- 브라우저 QA 후 normalData는 `3f48996f7ae9b9b372181241c644a1b0b97bde88989b169704d8a19f98dd9e9a`로 바뀌고 이를 포함하는 preservedRows도 달라졌다. 제어·실행·원장·attestation·세 catalog 지문7개는 그대로다. 이 차이를 배포 직후9개 일치 결과로 숨기거나 새 승인 기준으로 덮지 않았다.
- 원인: 기존 공개 상세 GET은 `view=preview`가 아니면 서버 내부 `recipe-view` POST RPC로 `recipes.view_count`를 올린다. 브라우저의 nonGET 요청0은 DB 쓰기0을 의미하지 않는다. d09→C의 이 블록·factory·RPC SQL·account-generation telemetry 예외·normalData 투영·migrations가 동일함을 독립 소스 대조했다.
- 읽기 전용 가설 계산에서 소갈비 조회수2→14(+12), 잡채1→11(+10), 두부6→25(+19) **세 필드만** 과거 값으로 가정하면 원41테이블 전체 지문 `82205065b22ff73da3807157a909f4de50f86f1a8b28817ab80eea23003bbb7e`가 각 정수0..현재조회수 탐색 범위에서 유일하게 재구성됐다. 먼저 현행 row-hash/chunk 알고리즘과 실제 현재 지문의 동치를 검증했다. DB UPDATE나 조회수 복원은 하지 않았다. 독립 소스 대조·동일 진단 재실행도 통과했다.
- 기존 observer와 같은 보호10테이블의 현재 행/absence와 원 normalData·원장/실행 지문으로 원 preservedRows `011795a2daa4e54b61c5e247a6713f4fc7e605042d96cf24e3a786cdf354d51c`도 재구성됐다. 원장·실행 지문은 같은 진단에서 현재 값을 다시 조회해 원 값과 같음을 확인한 뒤 사용했다. 따라서 이 관측 구간의 차이는 위 조회수3개이며, 수량5개·다른37재료·원문·과거 기록·보호 행은 보존됐다. 세 recipes.updated_at은 saved row의15:49/15:51/15:53 원 시각과 같다.
- 이는 로컬 `diagnose-view-counts.mjs`/`view-count-diagnosis.json`의 원인 진단일 뿐 배포 gate나 허용 목록이 아니다. 원 projection에서 필드를 제외하지 않았고 PIN/승인/제어도 갱신하지 않았다. 이후 새 배포는 당시의 실제 데이터와 exact source를 다시 검증해야 한다.

## 구현된 경계와 검증 후보

- 앱 후보 C는 `f204073a2dbd8468644d7f40e206f48ec6518e20`이다. 별도 도구 T는 이 후보 위에서 작성하며, 앱 C의 승인으로 도구 T를 승인하거나 PIN 자기참조를 만들지 않는다.
- `scripts/lib/prelaunch-db-app-successor.mjs`는 별도 create-only 승인 파일의 exact digest, 원 committed238 receipt/guard binding, live SHA/build/plist, reader floor→live→candidate 조상, 전체 변경 파일과 before/after blob을 검증한다. `--reviewed-ref --already-applied-db --db-config`의 정상 앱 경로만 사용하며 baseline/환경 patch/다른 reviewed mode/테스트 생략을 허용하지 않는다.
- 허용 제품 파일은 이번 타입 정리의 정확한 파일 집합이다. SQL·환경·키·auth·worker·보호 설정을 일반적으로 허용하지 않는다. 기존 closed R2 환경/DB/제어 검사는 그대로 유지한다.
- live→C에 포함된 역사적 `saved-recipe-nutrition-maintenance.mjs` PIN 바인딩은 이번 수정이 아니다. SHA256 `319506c51d235a8eb2844dd6f9a95a75833e4547d1bd8b44e4f5479824ae5655`→`cd5668ce05f0fdcf89e448243d7244af1f204ffc539719bf9f1e3aea07dba070`인 정확한 단일 파일만 classifier support로 넘긴다. 전체 앱 파일을 support로 바꾸거나 구 maintenance handoff 권위를 부여하지 않는다.
- C의 `pnpm typecheck`, `pnpm build`, 공식 `test:feedback-batch:web` 1466 PASS/133 이름 필터 SKIP를 확인했다. build의 기존 hook/미사용 변수 경고4건은 남는다. Anti Slop126/baseline207/신규0이며 검사 설정을 바꾸지 않았다. 이 검사는 실제 운영 DB/RLS 또는 배포 후 브라우저 흐름 확인을 대신하지 않는다.
- 새 helper42/실제 CLI18(합60)와 기존 exact238 7개 회귀가 통과했다. CLI fixture는 실제 plan/deploy의 release 생성 전 경계/stage 몸체·실제 검증기/classifier를 실행하며, 운영 대신 합성 관측값을 사용한다. 역사적 operator 쌍은 공개 Git blob 실제 SHA256으로 확인한다. 기존229/231/232 테스트의 오래된 import 재배치·CLI 필수 상수 주입을 보완하며 기대값이나 제품 검사를 완화하지 않았다.
- 기존229/231/232 76개와 일반 배포110개를 최종 파일로 함께 재실행해186 PASS를 확인했다. 보상 source-ancestor=false도 실제 DeploymentError를 검증한다. 관련 ESLint는 경고0이다.
- 원 DB235/238의 transaction 행·OID·worker 관측은 역사적 authority 증거이지 새 앱의 fresh 운영 baseline이 아니다. 인계 후 현재 DB238/closed-R2/worker 검증과 별도 exact 앱 승인을 새로 확인했다.
- 인계 직후·배포 전에는 운영 d09/DB238 ready·recoveryPending=false였다. canonical 저장소에서 두부 revision4 양조간장60g/조청30g, 소갈비 revision2 간장90ml/맛술90ml, 잡채 revision3 물300ml을 읽기 전용으로 재확인했다(재료 총42개). 이 작업에서는 직접 SQL 쓰기·영양 재발행을 하지 않는다. 최초 legacy `recipe_ingredients` 조회는 이 canonical 저장소의 재료가 없어, 실제 `youtube_saved_recipe_results.editable_content_json`에서 확인했다.
- 새 승인 raw SHA256은 `ee3d6baf1b42fe168ed53977fe230e80e89e034840764696669697225992bf32`이며 전용 비공개 디렉터리에 create-only로 생성했다. exact54파일, live build/plist, 원 maintenance binding과 인계 후 fresh 관측을 담는다. 두 차례 읽기에서 normalData SHA256 `82205065b22ff73da3807157a909f4de50f86f1a8b28817ab80eea23003bbb7e`가 같았다. fresh 지문은 수동 전후 대조 기준이며 source 검증기가 이를 현재 DB와 자동 비교한다고 주장하지 않는다.

## 최초 차단 당시 결과와 원인 (배포 전 이력)

- PR1811의 검증 head `572063abd9f2893cca72cacdfadd14d4143e1ad9`는 master `64112be4bec14e29f88449214140250685210f15`로 머지됐다. 당시 운영은 웹 `d09ab4bcdd519e2921165ff33779821096172373`/DB238 ready·복구 대기 없음이었고, 상세 새 코드의 운영 검증 전이었다.
- 당시 정상 앱 전용 명령 `pnpm deploy:dev:plan -- --reviewed-ref 64112be4bec14e29f88449214140250685210f15 --already-applied-db --db-config <기존 full-local 비공개 설정> --test-script test:feedback-batch:web`는 exit1, `Exact nutrition/recipe-save source is not already committed under its separate authority`로 거부됐다. 그 시점에는 실제 deploy를 실행하지 않았다.
- `scripts/deploy-prelaunch-web.mjs`의 `nutritionSourceHandoff`는 상세 파일에 기존 PATCH의 `read_recipe_future_patch_result` 또는 `write_recipe_future_plan_change_recoverable` 문자열이 있으면 파일을 recipeRuntime으로 분류한다. 이번에 PATCH를 수정했는지나 emitted 동작이 같은지는 판정하지 않는다. 이는 source gate이며 검출 자체가 권한 변경의 증거는 아니다.
- 당시 이 분기의 feature 허용과 SQL 없는 runtime-only/조상 검사는 recipe-save-recovery231/request-role232에 한정됐고, current maintenance238을 거부했다. 현재는 위 별도 exact 앱 successor 경계를 추가했으며 최초238 exact 검사와 기존231/232 검사는 그대로다.
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

당시에는 도구 구현을 추가 승인 전까지 보류했다. 이후 구현·앱 반영 승인을 받고 영양5행 완료 인계·별도 exact 승인 결속을 거쳐 배포했다. 현재 결과는 문서 상단을 따른다.
