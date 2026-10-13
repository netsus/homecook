# C01 W1/W2/W3 · T8 무게 근거 로컬 통합 준비

상태: **로컬 구현·fixture 검증 중, 운영 미반영**. C03 parser/제품 변환과 검토된 보안 postimage 기준을 최종 통합한 뒤 타입·빌드·독립 리뷰를 닫아야 한다. 기존 worktree의 parser를 복사하거나 수정하지 않았다. 이 기록은 추정 정확도 개선 완료나 운영 활성화 승인 근거가 아니다.

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
