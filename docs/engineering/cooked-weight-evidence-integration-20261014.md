# C01 W1/W2/W3 · T8 무게 근거 로컬 통합 준비

상태: **C03 실제 통합·선택 로컬 검사 완료, 운영 미반영**. C03 parser/제품 변환을 같은 checkout에서 소비하며 타입·빌드·source postimage 및 격리 회귀를 확인했다. 독립 통합 리뷰와 운영 승인은 별도다. 아래 과거 checkpoint의 대기 문장은 당시 기록이며 최신 결과는 마지막 통합 마감 절을 따른다. 이 기록은 추정 정확도 개선 완료나 운영 활성화 승인 근거가 아니다.

## 계산과 실제 적용 범위

`bounded-weight-v2` / `snapshot-weight-v2`는 고정 recipe snapshot의 원량·단위·배율·row key·제품 버전 및 승인된 환산 근거를 서버에서 정규화한다. 원량은 별도로 보존하고 배치 인분으로 한 번만 환산한다. `quantityOrigin=planned`를 실사용량이나 실측으로 승격하지 않는다. 모든 행에 근거 있는 g이 없으면 전체 g은 null이고 부분합은 저장하지 않는다.

확정 폐쇄 혼합·확인된 외부 손실·정확 USDA 조건은 순수 함수의 제한된 입력 계약에서만 계산 가능하다. USDA2014 CC0 자료의 저지방 다짐육69% 후보를 일반 국·볶음·쌀에 적용하지 않는다. Bognár2.98은 상업적 재사용 미확인으로 운영 inactive이며 synthetic 산술 fixture만 있다. 영양 총량/잔존율을 무게 수율로 계산하지 않는다.

기존 snapshot에서 모든 비어 있지 않은 단계의 원방법 ID와 서버 cook-mode 방법 코드가 확인되고, 방법이 전부 MIX이며 명시 heat가 null인 경우 좁은 `inferred_closed_mix` 질량합을 허용한다. 빈/누락/자유문장뿐인 단계는 가열 없음의 근거가 아니다. 가열·배수·추가 물/기름을 명시한 문장은 긍정 추론 없이 해당 MIX를 unknown으로 막는 보수적 veto로만 사용한다. 원문을 evidence payload에 저장하지 않는다.

MIX 숫자에는 세 가지 가정을 불변 저장하고 완료·남은 요리·식사 미리보기에서 안내한다: 방법 태그상 가열 없음, 적힌 재료가 모두 남음, 미보고 배수·남김·용기·추가 물/기름 미확인. 이는 실제 음식의 닫힌 경계를 확인했다는 뜻이 아니다. 준비상태/식품역할·가열 수율·배수·흡수 조건은 실제 근거가 없으면 unknown이다.

### representative fixture 비교

추가 추출/AI/실자료 조회 없이 기존 필드 모양으로 만든 분기 fixture와 기존 `qa/fixtures/slices-01-05.json`을 사용했다. 아래 7개 분기 fixture는 기본2인분→4인분이다. 측정된 정답이나 실제 운영 레시피 모집단이 아니다.

| 분기 | 원량 | 기존0.75 | 신규 | 한계/근거 |
|---|---|---:|---:|---|
| 국 | 식품100g+물300g |600g|null|조리유형 BOIL 추론만 있고 실제 증발·배수·경계 없음|
| 볶음 | 식품100g+기름10g |165g|null|STIR_FRY 추론만 있고 exact 수율/경계 없음|
| 쌀 | 쌀100g+물300g |600g|null|흡수 규칙·원상태·물부족 조건 미확인, Bognár inactive|
| 이미 익힘 |100g |150g|null|REHEAT에 사용할 규칙 없음|
| 제품 MIX |고정 제품 버전100g |150g|200g|직접 g와 모든 단계 MIX, 가정 명시|
| MIX |100g+비배율25g |168.75g|225g|g 근거·모든 단계 MIX, 가정 명시|
| 적당량 MIX |100g+적당량 |150g|null|적당량0 치환/누락 부분합 금지|

이 7개에서 기존7/7 숫자→신규2/7 숫자(5 unknown)이며 수율 정확도 향상을 뜻하지 않는다. 실제 기존 김치찌개 QA fixture는 `개/대`의 승인 환산이 없는 입력과 적당량 때문에 기존/new 모두 null이다. 실제 서비스 레시피 산출률은 미조사다. unknown 증가와 완료 뒤 식사 기록을 위해 선택 전체무게 입력이 필요해질 수 있는 영향을 숨기지 않는다. 새 필수 입력은0이고 무게를 건너뛰어도 요리 완료는 가능하다.

## 저장·출처·호환

개인 evidence는 `private.cooked_batch_weight_evidence`, 쓰기 제어는 `private.cooked_batch_weight_evidence_control.enabled=false` 기본값이다. 예측과 `reported_measurement`/`manual_entry` 관찰은 별도 append-only 행이다. 원예측/모델·입력·조건·가정·원천판본을 이후 실측으로 덮어쓰지 않는다. `reported_measured`는 사용자의 명시 보고이며 기기 검증을 뜻하지 않는다. 동일한 숫자여도 입력 경로로 구분한다. 관찰은 원 receipt·owner/generation·batch/snapshot·작성 시 revision과 결속한다.

새 내부 wrapper 두 개는 기존 completion/weight 원장과 같은 transaction에서 동작한다. 기존 owner·account-generation·revision·no-events·빈 event checksum 보호와 fresh/replay 경로를 재사용한다. 예측은 요청 hash에서 제외해 재시도에 원결과를 유지하지만 명시 입력/source는 포함한다. 구 수동 입력의 성공 receipt를 새 명시 실측 경로로 재사용하면 `IDEMPOTENCY_KEY_REUSED`로 막는다. 완료/실측 실패에 예측·관찰·batch·meal·receipt 일부만 남지 않는다. quantity event에 무게 evidence를 넣지 않는다.

공개 endpoint는 그대로다. `X-Homecook-Cooked-Weight-Contract: evidence-v1`을 정확히 보낸 경우만 additive summary/식사근거를 반환한다. 헤더 없음·모르는 판본이면 기존 DTO를 유지한다. 새 client는 구 server의 근거 없는 DTO도 읽는다. 이 헤더는 응답 형식 선택이며 참여 동의·쓰기 권한·receipt 입력이 아니다.

완료 UI는 **빈 선택 숫자 한 칸**이며 예측값을 자동 채우지 않는다. 먹거나 버리기 전 전체음식, 용기 제외·먹을 국물 포함·한 접시/잔량 제외를 안내한다. 건너뛰기와 오류 후 같은 draft 재시도는 유지한다. DB/web capability가 둘 다 ON일 때만 새 개인 입력 UI를 사용한다.

새 식사는 기존 `nutrition_evidence_json.weight_basis`의9키(schema/batch/snapshot/finished g/source/model/prediction/observation/revision)를 같은 원장 transaction에서 서버 고정한다. MIX 가정은 별도 optional `weight_assumption_codes`이며9키를 바꾸지 않는다. 같은 source+canonical 양의 날짜/칸 이동은 원근거 또는 원래 부재를 보존한다. 명시 source/양 변경만 새 근거를 고정한다. 잔량 보정은 전체 분모/과거 식사 영양을 바꾸지 않는다. 구 기록에 모델/출처를 꾸며 넣는 UPDATE는 없다. C04 원량/분수/인분은 별도 quantity_input에 연계 예정이며 여기서 활성화하지 않는다.

## 운영 적용 전 대상과 복구 경계

- migration은 로컬 draft이다. 새 private 표2개, immutable/meal trigger2개, private helper와 신규 service-role RPC2개, 기존 completion/weight/project/read/preview 및 exact scope-chain postimage가 대상이다.
- anon/authenticated는 새 RPC 실행 불가, service_role도 private 표/helper 직접 권한이 없다. 원 chain을 predecessor로 보존하고 신규2개 exact POST 경로만 추가한다. owner/ACL/search_path/volatility/body MD5는 C03 기준 뒤 source→검토 postimage manifest로 별도 등록/검증해야 한다. 기존 검사를 제외하거나 현재 DB 지문을 무조건 채택하지 않는다.
- 운영 승인에는 최종 migration/source digest·backup·정확 적용대상·OFF 검증·복구 reader·C03 통합 보안 지문·기존 client 영향과 unknown 증가가 필요하다. 지금 로컬 검사는 실제 운영 변경 승인이 아니다.
- 쓰기 중지는 **DB enabled=false 먼저**, 그 뒤 웹 env OFF다. web OFF만으로 ON인 DB의 meal 근거 trigger를 멈추지 못한다. 기존 reader/표/불변 이력은 유지하고 과거 삭제·되돌림 UPDATE를 하지 않는다. OFF 이후 구 무게 입력은 상세 현재source를 legacy_unknown/model null로 읽되 원예측·참조는 보존한다.
- 전체 학습/수집/C05 collector·외부 AI·worker·새 개인정보 목적/기간·키/네트워크·권한 완화·실자료 적용은0이다. 90일/1년은 미확정 예시이며 선택하지 않았다.

## W4/W6 후속 한계

현재 개인 관찰에는 planned 양·조건 미확인·기기 미검증이라는 QA 사유가 남는다. 영구 부적격 boolean을 넣지 않았다. 전체무게 숫자만으로 실제 사용량·레시피 준수·용기 제외·배수·측정 전 섭취 여부가 확정되지는 않는다. 후속에서 필요한 선택 확인은 원 input/model/weight_basis 판본, 전체음식/용기제외/섭취전 보고, 실제 사용량 또는 계획 준수, 배수·추가매체/규모, 독립 조리 ID·시각, QA·자동/수동/잔량/한접시 구분, 수정/무효화·재조리 참조다. 새 필수 입력으로 만들지 않는다.

W1~W3 freeze 뒤 적격 synthetic fixture만 사용하는 pure/offline 후보는 동일 recipe/product/input 조건·규모 범위의 **서로 다른3개 batch** 이상, 예측 대비 실측 비율의 중앙값 등 강건 보정, 지원 입력 범위 밖 외삽 거부, 중복/수정전·QA/자동/잔량/한접시 제외이다. 선택 확인이 없는 현재 관찰은 pending이며 자동 적격으로 삼지 않는다. W4 개인 보정과 C05 전체 참여 수집은 분리한다. W6 통계/ML은 미래 독립 품질 게이트로 남기고 이번 구현에서 실행/학습하지 않는다.

## 검사와 미완료

현재 선택10suite132tests(순수 계산/DTO·route·client·UI/meal preview/read/기존 원장·호환) PASS. 저장된 식사 상세의 frozen 분모/source/가정과 기존 상세 actions/준비모드 관련3suite24tests도 PASS이며, 현재 batch/model을 조회하거나 과거를 역산하지 않는다. C03 parser/converter를 `/tmp` alias로 읽기만 연결한 mapper/loader2suite22tests PASS이며 최종통합 검사로 대체하지 않는다. 자기 network-none container의 실제218 schema-only 행0→정확219→draft migration에서13 SQL cases PASS·자기 container cleanup 확인: `/tmp/mumeok-v9-c01-schema-report.json`/log. 완료/실측/식사 실제 writer·preview, partial rollback, same-key, 날짜 이동/잔량 보정, old receipt 승격거부, OFF 구입력 현재source·과거원예측 불변을 포함한다.

320/375/1280/1440 local mock 완료/저장된 식사 상세8tests PASS와12 screenshots를 확인했다. 선택 입력0→200→오류 재시도→빈칸 skip, 원문 수량·가정·버튼 가시성과 가로 overflow0을 확인했다. 상세 QA는 임시config의 NEXT_PUBLIC_PRELAUNCH_UI=false로 renderer만 열었고 실제 준비모드/배포 env는 변경하지 않았다. 저장된 전체200g/먹은100g/500kcal를 표시하며 현재batch API 읽기0을 검증했다. Turbopack은 공유 node_modules symlink 범위 제한으로 시작 실패하여 동일 Next의 webpack dev 임시config를 썼다. 배포 설정은 변경하지 않았다. Anti Slop baseline 유지·새finding0와 변경 파일 ESLint는 PASS 시점 이후 식사 상세 표시/직접 테스트의 최종 재검사를 남긴다.

최종 대기: C03 freeze 및 실제 통합, C04 canonical 양 변경/같은 source+양 보존 교차 fixture, 검토된 source postimage/보안 inventory 등록, 최신 타입/빌드·독립 리뷰·운영 승인. 서비스 기능 완료/운영 적용으로 보고하지 않는다.


### 기준 HEAD의 stale tare 테스트 재현

기준483813287에서 component와 해당 test를 `git show HEAD:<path>`로 그대로 꺼내 자기 ignored diagnostic 경로에 두고 `/tmp/mumeok-c01-baseline-ui-vitest.mjs` alias만 적용해 `pnpm exec vitest run --config /tmp/mumeok-c01-baseline-ui-vitest.mjs --pool=forks --maxWorkers=1`을 실행했다. 첫 exact본은 기존 CSS PostCSS loader 때문에 테스트 실행 전 exit1이었다. 동일 원본에 기존 승인된 CSS module mock 한 줄만 추가한 두 번째 probe는 기존 assertion을 바꾸지 않고 `용기 무게 계산 도움` 버튼이 없다는 실제 실패로 exit1이었다. 기준 component에는 tare 도우미/두 숫자칸이 없다. 원본·mock-only 사본·SHA·두 로그는 `/tmp/mumeok-c01-baseline-ui`와 `/tmp/mumeok-c01-baseline-ui-report.json`에 보존했고 자기 ignored 사본만 정리했다.

새 UI 검사는 v9의 빈 선택 숫자1칸·skip·명시source·동일값·오류draft·OFF 보호5개로 갱신했다. 실제 CSS/화면은4폭 브라우저에서 검증했다. 기존 numeric/원장/개인무게 보호를 삭제하거나 실패 허용으로 낮추지 않았으며 독립 리뷰에서 이 이유를 다시 확인해야 한다.


브라우저 재시도 fixture는 첫 추가 실행에서 두 폭의 skip 검사가 기존200g을 보냈다. 테스트가 두 번째 요청 수신 개수만 기다리고 응답 처리·입력 disabled 해제를 기다리지 않은 시간 경합이었다. 실제 저장 중에는 입력이 잠긴다. fixture에서 두 번째 mock 응답을 직접 제어해 입력 disabled를 확인한 뒤 응답 완료·enabled·새 error focus를 기다리도록 보강했고, 값/출처/같은키/새 skip키 assertion은 유지했다. source 수정 없이8/8 PASS를 얻었으며 실패 로그는 `/tmp/mumeok-c01-weight-e2e-before-wait-fix.log`에 보존했다.


보안 source 후보는 운영 DB가 아니라 reviewed archive218/schema-only0행→정확219→현재 C01 SQL의 pre/post 정의에서 도출했다. `/tmp/mumeok-c01-source-postimage-candidate.json`의 raw MD5와 정의를 검증한 뒤 C03와 같은 MD5(btrim(prosrc, chr(10)))·signature·owner·ACL·search_path·volatility 형식으로 `/tmp/mumeok-c01-source-derived-postimage-preparation.json`을 준비했다. 기존6개 함수의 권한/owner/path/volatility 불변, 신규9개 signature, 이름만 바꾼 scope predecessor의 원 body/속성 불변을 확인했다. 이는 아직 등록/독립 승인되지 않은 후보이며 C03 migration/manifest 이후의 정확 source로 재산출해야 한다. 전체 inventory의 기존 drift를 면제하지 않았다.


## C03 실제 통합 마감 · 2026-10-14

최종 C03 `20261013190000_recipe_product_only_identity.sql` SHA `0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75`를 먼저 적용하고 C01 `20261013233000_cooked_batch_weight_evidence.sql` SHA `fa1c8edbc17eddd6d8fa9e4055a6d21ff9865170f0066b56a322c8b1eef46436`를 잇는 로컬 후보를 검사한다. 두 SQL 원문·C03 권한/쓰기 제어/정밀도/원문 계약은 통합 마감에서 변경하지 않았다. C05 수집·C04 단위 정책·W4 보정 세 파일은 수정하지 않는다.

완료와 cook-mode에서 같은 인증된 route client의 좁은 `cooking_sessions` 조회 및 기존 product RPC를 명시 위임한다. SDK의 과도한 타입 확장을 피하며 기존 owner/session authority 및 내부 source client를 그대로 쓴다. 변환 evidence의 actual measurement UUID를 공유 타입에 optional로 표시한다. 누락/무효 ID는 unknown이며 dataset source ID를 대신 근거로 쓰지 않는다.

실제 server builder는 method ID 대신 `cooking_methods`의 code/label/color/category projection을 snapshot에 고정한다. mapper는 owner 검증된 snapshot ID·정확 step/instruction·ordered frozen projection과 같은 cook-mode projection이 일치하는 경우만 기존 MIX 가정합을 inferred로 지원한다. 당시 ID가 있는 shape는 기존 ID 검증을 유지하고, malformed ID를 새 projection으로 구제하지 않는다. 원천 부재·빈 배열·다른 code/label/color·방법/단계 순서 불일치·heat·가열/배수/추가매체 충돌은 unknown이다. `evidenceRef`는 snapshot ID/step/고정 projection JSON으로 재현하며 현재 catalog 조회·합성 ID·자유문장 긍정 추론은 없다. 이 역시 실제 조리 경계나 사용량이 확인되었다는 주장이 아니다.

actual 격리 fixture는 real C03 builder를 호출해 NULL 공공제품의 saved V1 `.125 package →25g`(current V2=300g/package 차용0) 및 일반 `300g →300g`를 정규화하고 실제 C01 완료 RPC로 이어간다. snapshot 생성 뒤 current method code를 BOIL로 바꾸어도 frozen MIX가 유지되며, 원 snapshot 전체 JSON/hash·원문 숫자/문장·고정 수량/버전과 같은 키 완료 replay가 보존되는지 검사한다. revoked/deleting/replaced-generation은 각각 기존 `ACCOUNT_SESSION_STALE`/`ACCOUNT_DELETING`/`ACCOUNT_GENERATION_STALE`로 receipt·session·batch·history·event 변경 없이 거절한다. frozen meal basis9키/가정·날짜 이동·잔량 보정·OFF reader·실측 승격 금지 회귀를 유지한다. legacy 성공 receipt를 새 operation scope로 처음 읽는 호환 경로에는 replay alias receipt 한 행만 생기며 원 receipt/result/state·history는 보존하고 이후 동일 요청 재생은 전체 불변이다.

검토 지문은 `docs/security/cooked-weight-evidence-source-function-postimages.json`에 archive218 schema-only(자료 행0)→정확219→C03→C01의 source pre/post로 결속한다. 기존6 함수 owner/ACL/search_path/volatility/security-definer는 불변이며 새9 signature 중 public 쓰기 RPC2개만 service_role EXECUTE, private helper·scope alias는 API 역할 직접 권한0이다. ACL 문자열의 `EXECUTE:false`는 EXECUTE가 허용되며 GRANT OPTION이 없다는 뜻이다. scope predecessor alias는 변경 전 scope body/metadata를 그대로 보존한다.

`includeCookedWeightEvidenceFunctions:true`는 기존 C03 opt-in과 함께 사용한다. whole inventory의 기존 read-cook-mode body 기대 한 곳만 검토된 C03→C01 postimage로 교체하고 나머지14 signature를 추가한다(required76→90). 기존 baseline의 source8/owner18/ACL16/search_path2/RLS-owner1/table-ACL2/unexpected-policy1/member8 drift는 모두 그대로 남으며 전체 보안 PASS가 아니다. 별도 C0115 함수와 C03+C01 combined38 함수의 exact body/owner/ACL/execution-context 검사와 기존 whole inventory 전후 동일성은 서로 다른 근거다. 관련 배포 도구의 opt-in/승인 결속은 root의 별도 보호 전환 범위이며 여기서 운영 실행하지 않는다.

최신 실행 명령·종료값·파일 SHA와 남은 한계는 로컬 인계 기록에 고정한다. 과거 alias 검사와 C03 이전13 SQL은 실제 통합 근거로 대체한다. 운영 스키마/권한/제어 ON·실제 OAuth/개인 자료·C04 raw fraction 교차 통합·실제 산출률/정답·학습/외부 AI는 미실행이다. 새 자료 없이 정확도 개선 완료를 주장하지 않으며 reader 보존·DB OFF→web OFF 복구와 별도 운영 승인은 계속 필요하다.


최신 통합 확인: 관련12파일112, 식사4파일50, 변경 없는 W4 보정1파일64, schema218 행0→219→C03→C01 fresh native1파일17, 합계18파일243 검사가 각각 실패/skip0·exit0이다. `pnpm typecheck`, 변경9개 TS/JS 파일 ESLint, `pnpm verify:anti-slop`(716파일·신규0·baseline 변경0), `git diff --check`, 최종 mapper 변경 후 `pnpm build` exit0을 확인했다. build에는 변경 밖 기존 경고4개가 남는다(플래너·팬트리·레시피북 useCallback과 YouTube bundle unused). 실제 private table2 owner postgres/API역할 grant0 및 C0115/combined38 지문·메타0을 확인했고, whole inventory 잔존 drift와 전체 보안 PASS를 구분한다. 실제 UI/OAuth/운영 DB 적용 및 C04 교차 검사는 이 명령들이 증명하지 않는다.


## C01 OFF 호환 완료·제어 경합 보완 · 2026-10-14

C03 뒤 C01의 새 SQL SHA는 `0c92fa9d4a83cfefa5313e7b8a13c610ac108555248d1db756d4bd7f2d8384af`다. 위 `fa1c8e...`는 통합 마감 당시 원본이며 이번 두 보완의 최신 대상이 아니다. C03 SQL·권한·scope·기존9키·W4 보정은 바꾸지 않았다. source manifest의 네 함수 body와 raw migration SHA만 새 SQL에 결속한다.

웹 env가 ON이고 DB 제어가 OFF인 fresh 일반 완료도 가능하다. 새 wrapper의 정확한 SQLSTATE55000/message `COOKED_WEIGHT_EVIDENCE_DISABLED`에만 명시 source 없는 완료·구 수동 무게 요청을 기존 RPC로 보낸다. `weigh_later`는 기존 재료 추정 계산을 유지하며, 수동 숫자는 원값을 보존한다. failed wrapper의 transaction은 receipt·근거·batch 변경 없이 끝난다. 명시 `reported_measured` 요청은409를 유지하므로 같은 draft 재시도도 자동 호환 처리되지 않는다. 정보를 다시 확인한 뒤 source 없는 완료는 새 요청으로 보낸다. 응답 헤더·없는 헤더는 권위가 아니며 일반 충돌·권한·멱등 오류·문자열 포함 일치에는 fallback0이다. 성공한 새 wrapper receipt는 DB OFF 후에도 원결과를 재생한다.

완료·무게 wrapper, fresh 근거 기록, cooked-batch 식사 근거 trigger는 제어 행 `FOR SHARE`를 transaction 끝까지 유지한다. operator OFF가 이미 승인된 쓰기 완료를 기다린 뒤 다음 새 쓰기를 막는다. stable projection/cook-mode capability는 plain SELECT이고 일반 recipe 식사는 제어 행을 잠그지 않는다. DB OFF→web OFF 순서와 이력/reader 보존은 그대로다. 제어표가 없는 옛 DB와 새 서버의 호환이나 C01 운영 적용은 이 로컬 보완이 승인하지 않는다.

원 fa1c SQL의 자기 pinned-image/network-none/schema-only fixture에서 exact disabled 신호와 열린 완료 중 OFF 경합 두 회귀가 실패했고, 교정 후 fresh218→219→C03→C01의 native18 검사가 통과했다. 완료·무게·식사 transaction 중 OFF lock timeout과 plain/읽기 전용 projection 동시조회, commit 뒤 OFF 성공, 성공 receipt OFF 재생, failed wrapper 쓰기0 뒤 legacy 완료를 확인했다. 원 실패 로그·첫 Green의 테스트 receipt 필드 오인 실패·교정 로그를 `/tmp/mumeok-c01-off-lock-*.log`에 보존하며 자기 container는 정리했다. 실제 운영 DB·OAuth·개인 자료·UI 브라우저·build는 이번 보완에서 실행하지 않았다. 후속 배포의 정확 source/DB 대상과 reader/ON/floor는 총괄의 별도 적용 경계다.

보완 최종 검사: 관련7파일71검사와 fresh native1파일18검사, 합계8파일89검사 PASS·skip0·exit0이다. 타입 검사·변경5개 TS ESLint·Anti Slop(716파일, 신규finding0, baseline 변경0)·diff 공백 검사도 exit0이다. 기본 ESLint 호출의 공유 pnpm plugin 탐색 실패는 규칙을 바꾸지 않은 `/tmp` config로 실제 plugin 위치만 지정해 검사했다. 추가 수동 완료 fixture의 잘못된 구 DTO source 값으로 실패한 로그도 보존하고 기존 `measured` 값으로 교정했다. 본문에 남은 이전 검사 수치는 당시 기록이다.

## 독립 요리 로그인 복귀 후속 — 2026-10-14

상태: 로컬 구현·검사 완료, 운영 미반영. 공개 snapshot-v2 상세의 비로그인 ‘요리하기’는 기존 auth gate를 열고 세션 RPC를 호출하지 않는다. 기존 pending action에 선택 인분/당시 revision을 strict key·같은 recipe redirect·15분 TTL로 보관한다. 로그인 후 현재 권한 확인 상세를 다시 읽고 인분만 복원한다. 현재 revision이 다르면 변경 안내를 제공하며, ‘요리하기를 다시 눌러 시작’하는 명시 동작만 기존 snapshot-v2 API를 호출한다. 자동 시작/완료 저장과 legacy cook URL 우회는 없다.

정확401·ACCOUNT_SESSION_STALE/ACCOUNT_GENERATION_STALE409만 안내를 다시 열고 일반500/네트워크 실패는 오류로 유지한다. 취소/invalid/expired/다른 recipe·보관 실패·늦은 응답/화면 전환·반복 클릭을 검증한다. DB SQL·C01 예상구조·RLS/인증/권한·worker/모델/키 변경은0이다. 실제 OAuth/운영 계정 흐름은 로컬 fixture 결과와 구분한다. 다른 quantity-resume 묶음의 동일 pending/modal/detail 파일은 root가 후속 3-way 통합으로 보존한다.

관련 Vitest3파일163검사·직접 TypeScript·변경 TS7파일 ESLint·기존 anti-slop3단계(신규 지적0)를 통과했다. 실제 Next의320/375/1440px local fixture3검사/6PNG에서 guest 요청0·로그인 복귀 자동 요청0·현재 revision13/선택3인분 명시 시작1을 확인했다. server는 소유 loopback fake Supabase의 공개 metadata/UI-mode만 응답했고 browser API는 전부 fixture·외부 origin 차단이다. 실제 OAuth/운영 DB/완료 저장 검증이 아니며, 최종 production build는 C01 SQL 호환 보완과 통합한 후보에서 root가 수행한다. 최초 화면 실행은 background gamification fixture 누락으로 실패했으며 기존 fixture 연결 뒤 같은3검사를 통과했다.
