# C04 worker 원문 계량 저장 연결 — 로컬 후보

2026-10-14. 베이스 `5bbf3c291dea157008422a0774b9ef4bc43a77af`. 운영 DB·worker·키·정책 적용과 활성화는 하지 않았다. 실제 추출·모델·외부 API 호출은 0이다.

## 실제 연결과 남은 범위

`scripts/lib/youtube-extraction-worker-runtime.mjs`의 실제 `runOnce`가 호출하는 기존 prepare 함수에서 검증된 explicit 문자열 수량만 `quantity_input` 원문 계약으로 전달한다. source-bound basis는 기존과 같이 `stated`로 바꾸고 독립 재료 resolver 결과를 기다린다. 입력 객체는 변경하지 않으며 모델이 미리 붙인 `quantity_input`/`unit_context`는 거절한다. 미해결 source-bound 행에서는 finalizer가 수량과 변환 metadata를 함께 제거하고 원문 근거·unknown을 유지한다.

새 `20261014223000_youtube_quantity_input_bridge.sql`은 기존 actor·credential·lease·permit·근거·재료 검증 뒤에만 private helper를 호출한다. 이 helper는 기존 `quantity_input_v4_enabled()`를 유일 활성 권위로 사용하고, 기존 raw parser와 검토된 catalog predecessor의 unit context/resolver를 재사용한다. 제출된 density/컵/개당 중량은 읽지 않는다. 원문·분자·분모·실제 표시량·정규량·품질·근거 ID/버전이 source draft → editable saved result → saved canonical snapshot으로 이어진다. 제품 resolver나 대표재료 자동 매칭은 추가하지 않았다.

새 metadata가 없는 old worker는 정책 ON에서도 새 키를 저장하지 않는다. 새 worker/OFF도 기존 source draft JSON에 새 키를 저장하지 않는다. 원문 `1/3`은 숫자 표시 반올림과 별도로 유지한다. legacy SQL이 `.125`를 125로 읽는 모양은 새 explicit v4 transport에 한해 native numeric와 기존 v4 parser로 0.125를 사용한다. 일반 old worker/v3 parser와 과거 값을 다시 해석하지 않는다. 현재 v71 source-anchored formatter의 `0.125` 정규화와 이 후속 guard는 별도 경계다. shared v4 parser가 지원하지 않는 mixed fraction은 새 structured 필드를 생성하지 않고 기존 문자열·근거를 보존한다.

우유 200mL의 실제 원문·양은 유지한다. 질량 기준 영양 profile에 검토된 밀도가 없으면 normalized null/`DENSITY_REQUIRED`다. T/t/cup 정의나 통/알의 실제 물리 개수·상태·크기·가식부 근거가 없으면 unavailable이며 이름으로 근거를 만들지 않는다. 서버에 등록된 출처별 컵 정의가 없는 현재 hydration을 정의 완료로 주장하지 않는다.

이번 실제 소비 경로는 standalone background runner다. bundle·프롬프트·TS decoder·동기 import·모델 identity는 바꾸지 않았다. 기존 safeOutput의 문자열 amount/unit을 사용하므로 새로운 추출 출력 문법이 필요하지 않다. 기본 영양 계산은 v3이며, worker의 전체 영양 predecessor를 v4로 전환하거나 새 출처 근거를 등록하지 않았다. 따라서 C04-U5 전체 완료, 기존 worker 설치 완료 또는 모든 원문 문법 지원으로 넓히지 않는다. 일반 recipe UI/API/physical snapshot의 14220000은 별도 소유 범위다.

## 저장한 결과의 재열기와 편집

새 owner reader는 `X-Homecook-Quantity-Contract: quantity-v4`를 요청할 때만 저장된 `quantity_input`과 현재 검토용 `quantity_contexts`를 웹 응답에 전달한다. 헤더 없는 레시피북 호출은 기존 응답 형태 그대로이며, 헤더는 소유자·계정 세대·세션 권한을 대신하지 않는다. DB 정책 OFF에서도 저장 당시 원문을 읽을 수 있고 새 수량 쓰기는 거절한다. 웹 쓰기 flag와 DB 정책을 모두 확인한다.

행의 `quantity_context_fingerprint`는 저장 당시 근거를 나타내며, `quantity_contexts[row_id].fingerprint/options`는 현재 검토 가능한 선택이다. 최신 profile·밀도·개수 근거로 과거 snapshot을 자동 환산하지 않는다. 원문이 `1/3g`이고 표시 단위만 kg이면 원문은 그대로 남는다. 새 수량/단위 입력은 기존 parser·resolver로 검증하고 현재 fingerprint를 요구한다. SI 환산 외에 밀도나 개당 무게가 필요한데 근거가 없으면 `UNIT_CONVERSION_MISSING`, 현재 근거가 달라졌으면 `QUANTITY_CONTEXT_CHANGED`로 전체 저장을 거절한다. 수량 편집을 새 contract 없이 보내면 `QUANTITY_INPUT_REQUIRED`이며, 과거 editor의 같은 수량·같은 source 행 title-only 요청은 현재 서버 저장값을 정확히 보존한다.

새 raw draft는 공통 원문 3필드와 `expected_context_fingerprint`만 받는다. 클라이언트 snapshot echo는 서버의 현재/원본 snapshot과 일치해야 한다. explicit null은 명시 삭제이며 키 누락과 구분한다. 같은 키 재시도는 같은 소유자·계정 세대·작업의 서버 receipt만 사용하므로 이후 제목 변경이나 정책 OFF가 이전 성공 응답을 바꾸지 않는다. source snapshot은 계속 불변이다. JS 숫자로 전송한 기존 수량은 동일한 binary float view일 때만 서버 numeric 원값을 되살리고 원문 변경은 별도로 재검증한다.

공개 상세/요리 decoder는 공통 Snapshot 검증을 통과한 선택 필드만 전달한다. 새 raw draft를 표시 snapshot으로 승격하지 않는다. 검증된 현재 원문을 DTO의 display text에 사용하므로 수량을 1/2로 수정한 뒤 원본 1/3 문구가 요리에 남지 않는다. 일반 recipe 편집의 `context_sha256`을 worker 근거에서 추정하거나 추가하지 않는다. metadata 없는 기존 JSON 형태는 동일하다.

저장한 결과 화면의 소비 코드는 별도 UI 담당이 구현·375/1440 mock 검사를 수행한다. 이 문서의 SQL/native 결과를 UI 완료나 운영 worker 활성화의 증거로 넓히지 않는다.

## 정책 OFF와 진행 중 저장

독립 검토에서 owner 수정·명시 삭제가 열린 transaction인 동안 OFF가 즉시 완료하고, resolver ON 뒤 별도 OFF가 된 late finalize도 새 metadata를 저장하는 경합을 재현했다. 원 `dd924580…`/`4101e5…` 16파일 기록은 이전 후보로 보존하며 이 보호 완료의 근거로 사용하지 않는다.

소유자 writer는 성공 receipt replay 이후 실제 새 수량 변경·삭제의 admission에서만 기존 `require_recipe_quantity_writes_v4()`를 호출한다. 이 함수의 정책 행 SHARE가 transaction 종료까지 유지된다. worker resolver와 실제 source 저장 finalizer는 좁은 VOLATILE admission helper로 정책 행을 SHARE 읽기한다. 기존 STABLE quantity helper/validator나 owner read-only projection에는 잠금을 넣지 않는다. ON에서 계산 후 OFF된 새로운 structured finalize는 `UNIT_POLICY_INACTIVE`로 source/job 상태를 원자적으로 보존한다. 초기 OFF의 legacy 경로와 이미 성공한 finalize/owner receipt replay는 그대로다.

동시성 회귀는 정책 ON을 먼저 별도 commit한다. A가 실제 변경을 마쳤다는 marker를 받은 뒤 연결을 열어 두고 B의 OFF statement timeout 대기를 확인한다. fixture 안에서 정책 UPDATE가 만든 잠금을 근거로 삼지 않는다. A가 rollback한 뒤 OFF는 정상 완료하고, owner read-only는 연결이 열려 있어도 OFF를 막지 않는다. 임의 sleep 시간으로 성공을 판정하지 않는다.

## 권한과 고정 카탈로그

기존 resolver owner는 `youtube_extraction_worker_rpc_owner`다. 이 역할에는 원 v4 hydration helper의 EXECUTE/catalog 영양 테이블 SELECT가 없다. 그 shared helper를 직접 열면 넓은 profile 선택 계약까지 노출하므로 좁은 `private.youtube_worker_quantity_input_v4(jsonb,jsonb)` 한 개만 postgres-owned SECDEF로 만들고 기존 RPC owner만 EXECUTE한다. PUBLIC/anon/authenticated/service_role/worker login/authenticator의 직접 EXECUTE는 없다. helper는 고정 search_path를 쓰고 동적 SQL을 실행하지 않는다. 기존 public RPC signature와 사용자 권한은 유지한다.

DB DDL actor는 과거 YouTube migration과 같은 `supabase_admin`이다. postgres는 restricted owner의 ADMIN option이 없어 owner lease에 실패한다. 이는 현재 C03/C01 postgres-only 배포에 섞을 수 있는 migration이 아니다. 임시 restricted owner membership과 public/private CREATE를 함수 치환 동안만 빌리고 돌려준다. 로컬 실패 검사에서는 helper 생성 이후 role lease 42501로 실패한 transaction이 전체 함수/ACL·membership·schema ACL·role config를 그대로 복원했다.

resolver 본문이 카탈로그 guard에 포함되므로 기존 두 함수의 고정 fingerprint를 같은 방식으로 재-attest한다. 원 guard·readiness 계산식·issuer·credential 검사는 낮추지 않는다. 정확 before `81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9`, after `de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05`는 빈 search_path의 고정 원 guard 문맥에서 계산했다. 런타임 postimage를 기대값으로 학습하지 않는다. 10기존 함수+3신규 helper의 native prosrc MD5/definition SHA/owner/ACL/SECDEF/config/volatility는 [고정 postimage](../security/youtube-worker-quantity-function-postimages.json)에 결속했다. 기존 10개의 실행 metadata는 변하지 않는다.

추가 family는 resolver·saved builder·validator·canonical snapshot·기존 guard 두 개·shared dependency contract·owner projector·owner writer·실제 source 저장 finalizer의 10개다. 새 quantity helper는 reviewed dependency contract의 정확한 signature로 런타임 지문에 포함한다. legacy private helper는 변경 전 validator 본문을 그대로 보존한 실제 호출 단계이며, 기존 8키 검증을 제거하거나 재구현하지 않기 위한 것이다. 이 legacy 단계에는 사용자 EXECUTE를 주지 않는다. mutation admission helper에는 기존 restricted worker RPC owner만 EXECUTE를 주며, 기존 shared helper 권한을 넓히지 않는다. 기존 public owner read/write RPC signature와 ACL은 불변이다.

초기 inline probe의 default search_path 때문에 정책 `auth.uid()`가 `uid()`로 표시되어 25e/9a 가상 해시가 나온 기록은 실패 근거다. 원 SECDEF 문맥을 재현하지 않은 값이며 새 pin으로 채택하지 않았다. 또한 기존 raw catalog의 마지막 role NULL은 rolvaliduntil이었다. rolconfig NULL로 잘못 해석한 중간 판단은 철회했고 role RESET은 0이다. 운영 reader의 정상 81362 확인은 root의 별도 읽기 전용 증거이며 이 worker 후보의 운영 적용 증거가 아니다.

## 검사·배포·복구 경계

격리 PG는 고정 기존 image `a9946f08…`를 `--pull=never`, network none, 본인 UUID label/container, 공유 port·volume 없이 사용한다. 허용 archive SHA `15c29821…`를 schema-only로 복원하고 password-free roles와 exact219 SHA `e51b6a05…`를 사용한다. application rows 0을 먼저 확인한 뒤 committed disabled worker bootstrap과 가짜 transaction fixture만 넣는다. 실제 계정·자료·운영 credential을 복원하지 않는다. C03 exact0a1f·C01 frozen0c92·C04 reviewed predecessors를 함께 적용한다. first C04는 peer cold SHA `9ec96a2a…`, recipe 14220000은 cold SHA `9b15696a…`를 사용한다. 철회된 recipe d3e7 근거를 현재 통과로 사용하지 않는다.

검사는 실제 worker role의 credential/pre-request/lease/permit resolver → JS finalizer → finalize/replay → 실제 saved-result writer → canonical snapshot의 1/3와 .125를 확인한다. legacy editable JSON·snapshot hash는 두 committed predecessor 함수를 temporary 비교 함수로 실행해 exact 동일을 확인한다. 변환 근거 누락, source/numeric 불일치, 오래된 lease, private helper 직접 권한, 구 editor key 누락+정책 OFF의 source/hash/canonical ID 보존도 확인한다. 임시 baseline 비교는 권한 guard를 대체하지 않는다. 정상 bundle/모델을 실행한 검사가 아니다.

이 DB 변경 자체는 worker credential 행이나 pipeline policy를 갱신하지 않는다. 같은 유효 credential/고정 정책과 old worker는 새 DB에서 여전히 읽기/기존 저장 경로를 사용할 수 있어 DB-first/OFF 호환을 검사한다. 새 runner bytes는 기존 artifact 기본 include에 포함되므로 새 sealed artifact/release manifest 검토와 exact credential/release/policy 결속이 필요하다. bundle의 22-file manifest와 모델 identity를 임의 갱신하거나 기존 credential로 새 code pin을 우회하지 않는다. 실제 교체·credential generation 변경은 별도 운영 승인 대상이다.

향후 복구의 첫 단계는 기존 C04 정책 OFF다. 저장된 raw metadata와 source snapshot을 삭제하거나 과거 content/nutrition을 재계산하지 않는다. reader는 metadata를 보존하고 같은 원문 tuple의 older-editor key 누락은 현재 서버 저장값을 우선해 되살린다. 다른 이름/수량/단위·위조 metadata에는 기존 원문 근거를 붙이지 않는다. DB까지 내리려면 정확 기존 함수 source/metadata와 81362 guard를 복원하는 별도 묶음이 필요하며 새 행의 structured metadata를 old validator로 편집할 수 있는지는 별도 검토한다. 운영 rollback 실행이나 데이터 backfill은 하지 않았다.
