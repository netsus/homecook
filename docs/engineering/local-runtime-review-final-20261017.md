# 로컬 runtime 후보133개 후속 검토 — 2026-10-17

기준 master `3cf169063b94c3a8b6500c8137186261e0b28837`에서 원 diff와 현재 구현을 읽고 독립 리뷰했다. 초기133개는 PR1788 뒤 남은 의미 검토 후보이며, 수정 필요133건을 뜻하지 않는다. 원 브랜치·worktree·타 작업 미커밋을 삭제/reset/덮어쓰기하지 않았다.

| 판정 | 후보 수 | 처리 |
| --- | ---: | --- |
| 실제 runtime 공백 최소 수정 | 2 | PR1789·1791 master 병합, 운영 미반영 |
| 해당 runtime 재머지 불필요 | 75 | 현재 보호·후속 구현 대조, 원 commit 전체 완료 뜻 아님 |
| 실험 보존 | 8 | 실패/max-iter checkpoint·프롬프트/비교 실험 보존 |
| 정책·소유자 검토 보류 | 20 | 중복/불필요 판정 없이 보존 |
| 추가 조사 | 28 | 모두 원인 메모·독립 리뷰 있음, 미착수0 |
| 합계 | 133 | 필요한 변경 전체 완료·운영 완료 아님 |

기계 집계는 [커밋별 인덱스](data/local-change-necessity-review-20261017.json)의 `semantic_review_summary.initial133_final_partition`이다. 앞선 첫5개/C05보류5개는 이133개 밖에 있다. 최소 수정 후보444fe1f6f의 public-read 두 경로는 별도 보류다. 재머지 불필요75개 중 c8c1b61df/dc9b1e450은 이번 unmatched runtime 범위만 판정했고 나머지 원파일 보류를 유지한다.

## 실제 수정2건

- [PR1789](https://github.com/netsus/homecook/pull/1789), `634fa5b99`: 저장 RPC 부재/PGRST202 뒤 fallback을 사용자 routeClient로 제한했다. service-role 전역 하강 공백을 먼저2FAIL로 재현하고 관련24 PASS·독립23 PASS·타입/lint를 확인했다. 원자 RPC·세션·소유권·응답 계약 불변이다.
- [PR1791](https://github.com/netsus/homecook/pull/1791), `3cf169063`: 소유 레시피북 목록을 사용자 권한으로 승인한 뒤 표지의 service-only projection/Storage만 기존 이미지 내부 클라이언트로 읽는다. user/service mock을 분리해1FAIL/10PASS로 재현했고 관련23 PASS·독립23 PASS·타입/lint를 확인했다. 목록 실패 시 내부 호출0, 타인 owner 서명0, 내부 client 부재 시 목록 보존이다.

두 수정의 실제 인증 HTTP/Storage·운영 화면은 미검증이다. 초기 요리9개 묶음의375/1440 Chrome 확인을 이 후속 수정의 운영 증거로 확대하지 않는다.

## 마지막58개 분류 근거

- 추출 worker10개: sourceName 노출·optional 근거·제한 복구·진단 전달의 별도 정책4개 보류, 수량/인용/진행 이벤트6개 추가 조사.
- 인증·이미지·legacy12개: durable draft/create-owned cleanup·직접 공개 env 참조·좁은 gamification writer의 후속 동작4개와5MiB 상수2파일 동등1개는 runtime 재머지 불필요. legacy upload 제거·57파일 facade·LAN origin·Mac 전환·보류 draft PR1745의5개는 정책/담당자 보류. Data/Storage origin과 extraction session mutation2개는 조사.
- 추출 worker11개: optional/choice/on-screen identity/예산/보수적 선택 수량 정책5개 보류, parenthetical·alternativeOptions·OCR selection·unit heading·frame 선택·total-review 전달6개 조사.
- async18개: durable job·strict body·사용자 세션 RPC·readiness role/artifact/schema hash/expiry·policy409·기한 있는 이전 fingerprint·live lease/permit generation·applied===true·예약 quota/cache 제외·job→permit 잠금/성공 replay/list503을 대조했다. 동일 patch6쌍도 확인했으며 옛 manifest/policy/hash 복원이나 키 사용 승인 근거가 아니다.
- parser1개는 leading amount/component label/단계 원문 순서/표시 문자열 분리의 후속 구현을 확인했다. 일반 heading 결합과 의미 있는 component 구분 정책을 보존한다. optional flag·saved provenance·lookup context·동일 patch server ACK3개는 조사로 남긴다.

## 추가 조사28개

안전한 unknown/보수적 거절을 자동 결함으로 간주하거나 옛 숫자를 복원하지 않는다. 아래는 미대체·replay 차이·필요성 조사를 뜻하며 모두 수정 확정은 아니다.

| 후보 | 남은 조사 |
| --- | --- |
| `0c98a367d` | 인접 이름 인용 복구/approximate suffix 보완의 완전 대체 미확인. 원 인접 penne파스타/200g fixture도 현재 unknown/source-name-not-anchored. 안전 거절이므로 숫자 복구 승인 아님. |
| `3ea568317` | 표시·출처SQL·프레임 성능·정체성 보완이 혼재. provenance map/formatter·sampled fallback 등 미반영 부분은 분해 검토 필요. |
| `403e0f050` | optional ingredient flag의 UI/source/save 필드가 현재에 없음. 후속 완전 대체로 닫지 않고 요구/저장 계약 필요성 조사. |
| `4420a222c` | P2: 반복 기름 투입 근거에도 explicit1T/issues[]/total-review없음. 원천·adapter/UI·저장 경계의 소유자 검토 필요. 현재 v85와 옛 동명v85는 다른 계보. |
| `4b4ccbf90` | stable OCR 신뢰 승격과 unitless amountRawText 전달 미반영. 원문 snippet 보존과 동등하지 않음. 필요성 조사 유지. |
| `4bb48856c` | 현재 이미지 경로에 legacy public URL이 남고 옛 Data-origin adapter 부재. 내부 Data URL과 브라우저 반환 Storage origin 계약을 구분해야 하며 자동 origin 변경 보류. |
| `55e8a3651` | 옛 provenance migration과 source.ingredient_quantity_sources projection 부재. 후속 quantity-v4와 원 출처 구분의 동등성 미입증, forward 필요성 조사. |
| `5dd595d02` | 옛 server QuickImport ACK helper 부재, 현재 UI client ACK 존재. RPC authority 계약이 달라 server ACK 필요성 조사; 옛 userId-only helper 복원 금지. |
| `6abe9f0aa` | 저장소 replay gap 조사: scope는 후속 보존, 원3reader STABLE에 대한 VOLATILE 보완 SQL 부재. cached schema232에는3개 모두VOLATILE. 현재 운영 검증/장애 주장은 아님. |
| `6e99bc4f2` | P2 합성 재현: model_analysis producer는 raw durationSec를 전달하고 reportProgress는 정수만 허용.303.8초는 false/send0,304초는 true/send1. 실제IPC/worker 동작 검증 아님; sealed bundle 수정은 v85 소유자 조율 대기. |
| `79747f2b1` | 옛 source alias context(amount/originalName/sourceTexts)와 현재 name/unit/rawText 계약 차이. 옛 exact-source amount/current mass regex만으로 완전 대체 미입증. |
| `8ed4fb0bd` | 5dd595d02와 동일 patch. server ACK/current client ACK의 필요성 및 authority 계약 조사 유지. |
| `aacc2c684` | 반복 기름 투입에서 explicit1T/issues[] 유지. repeated-step abstention/unitless raw 수량 정책이 후속 구현과 완전 동등하지 않아 필요성 조사. |
| `af1bbde7e` | action-separated sourceName+quantity suffix 복구 미대체. 기름1T/팬에 기름을 두르고 (1T) 합성은 unknown/source-name-not-anchored. saved UI 복원 완료 판정 아님. |
| `bc8d1c89c` | qualified quantity/direct source recovery 미대체. Add a heaped 1 tbsp of flour 합성은 unknown. 불확실한 계량의 보수적 거절이며 정확 수치 복구 승인 아님. |
| `be52242cd` | low-confidence selection-only hint 미대체. confidence.5 반복 기름 OCR 합성 events[]; 실제 프레임/모델 결과는 미검증. |
| `be9ea8dc0` | merged-caption final action/양방향 인접 인용 미대체. 마지막 설탕 문장 합성 unknown/quantity-not-bound-to-name. 근거 복구 필요성 조사. |
| `c12102df5` | scoped extraction client는 있으나 sessions delete/update/upsert의 옛 Proxy 차단은 부재. SQL scope PATCH/DELETE 제한은 존재해 실제 보호 공백 여부 추가 조사. |
| `c2e069259` | 현재 source-bound recovery v6는 다른 설계. parenthetical owner/citation position/container/qualified 복구의 전체 대체 미입증; 새송이버섯5개(420g)는 conflicting. |
| `d1bd349a7` | 5dd595d02와 동일 patch. server ACK/current client ACK의 필요성 및 authority 계약 조사 유지. |
| `d22ddb447` | 저장소 replay gap 조사: 현재 writer caller/scope는 있으나 CREATE SQL 부재. cached schema232에는 write_user_gamification_projection 존재. body/현재운영 동등성 metadata만으로 미입증. |
| `d63342073` | alternativeOptions의 validator→sanitizer→runtime parser→import 전달이 없고 대안 수량은 unknown. 원천 구조와 후속 저장 계약 조사. |
| `db353398d` | confidence>=.3 closed-label selection hint 미대체. 기름1T confidence.4 합성 events[]; 실제 프레임 미검증. |
| `dbd15fbe7` | saved source quantity/provenance projection과 옛 recipe-quantity-display helper 부재. quantity-v4는 다른 계약이므로 동등성 미입증. |
| `e869582b4` | cited unit heading에 근거한 bare amount suffix 복구 부재. 간마늘1/밥숟갈 heading 합성 unknown. 안전 복구 범위 조사. |
| `f87f50eeb` | text-first OCR representative 확장은120개 합성 프레임 중96개 선택. 옛 full OCR과 다르고 repeated-step abstention 삭제도 혼재하여 전체 patch 통합 보류. |
| `fb7b364ad` | d22ddb447와 같은 patch-id. writer CREATE의 checked-in replay gap 조사 유지. cached schema232 존재와 현재운영을 구분. |
| `fe4603157` | 유효 quantityTotalReviewRequired/Basis/EvidenceRef가 sanitizer/normalizer에서 사라짐.4420a222c의 생성→표시/저장 전달 조사와 연관; 새 영양 숫자 확정 아님. |

## 합성 재현과 검증 한계

[반복 기름 총량 경고](data/repeated-oil-total-review-repro-20261017.json)는 ledger의1T@90s와 다시1T@122s에도 현재 explicit1T/issues[]이며 total-review 경고가 없음을 보여준다.4420a222c/fe4603157의 생성→adapter→표시/저장 전달이 온전히 반영됐다고 닫지 않는다. 자동2T 확정이나 운영 추출 검증은 아니다.

[소수점 영상 길이 진행 이벤트](data/duration-progress-repro-20261017.json)는 기존 reportProgress 함수만 추출해 fake process.send로303.8초 false/send0,304초 true/send1을 재현한다. 소스3개 SHA와 추출 함수 SHA를 현재 기준에서 재확인하고 같은 결과를 얻었다. 실제IPC/모델/영상/worker process를 실행하지 않았다. artifact의 재현 명령은 원 /tmp 증거 파일을 읽으므로 다른 checkout에서는 JSON 경로·repository_root만 로컬 경로로 맞춰야 한다. sealed bundle 수정은 v85 소유자 조율 대기다.

선택 회귀5파일은 **67 PASS/2 FAIL**이다. 현재 backend 기대 pipelineIdentity는85fbf487…/실제6dd49441…, jobs 기대 policy version2/실제3이다. 두 테스트와 관련 runtime 경로는 PR1789 기준부터 변경0이다. 기존 기대값 불일치로 기록하며 기대값·정책·fence를 임의 갱신하거나 전체 green으로 표시하지 않는다. 재현 범위/실패 세부는 [기계 증거](data/runtime-core-review-checks-20261017.json)를 따른다.

배포 도구 `prelaunch-recipe-save-maintenance.test.ts`의 기존 import fixture collection 실패도 별도 남는다. 임시 복제본의 single-quoted 상대 import 변환 누락이며 제품/운영 도구를 함께 수정하지 않았다. 이전 합성 notification48 PASS는 기존 실행 증거이며 이번 독립 재실행으로 세지 않는다.

## 배포·DB·운영 보류

현재 세션은 운영Chrome/인증/프로필/DB/API 재접근0, 데이터쓰기0, 배포/worker/manifest/공유설정 변경0을 유지한다. C05/R2/lead OFF와 구키 fallback 금지 fence 유지다. 앞선 공개 UUID GET은 자동 승인 검토에서 실행 전 거절됐으며 재시도0이다. 운영 탭 닫힘은 확인되지 않았고 v85 담당자는 사용자 탭 종료를 기다린다.

원 migration/fence를 수정하지 않았다. [schema232→233/234 격리25 PASS](data/cooking-schema232-regression-20261017.json)는 현재 운영232 전체 동등성·실제 인증 HTTP·deploy ledger/PIN을 대신하지 않는다. [fresh actor 격리 시도](data/fresh-historical-actor-attempt-20261017.json)는177에서 synthetic role ADMIN-option 차이로 멈췄고214 해결을 뜻하지 않는다. helper owner/ACL의 역사 actor 단서와 reader VOLATILE/writer CREATE의 저장소 replay gap을 분리해 보존한다.

최근 영양 식용유 연결2행은 [최소 계획](data/recent-nutrition-link-plan-20261017.json)만 준비했으며 backup false/writes0이다. 제품/원천 불명 재료는 검증된 영양 수치로 채우지 않는다. v85 전환 완료·배포 잠금 해제·부모 직렬 조율 뒤 담당자가 현재 상태/백업을 확인하고 DB233/234·실제 흐름·승인 경로 웹 배포를 진행해야 한다.

독립 문서 리뷰 finding0: 초기133개 집계·최근58개 판정·조사28개 표/JSON 일치·합성 artifact SHA·상대 링크·diff check를 확인했다. 새 테스트/제품/운영/모델/DB 변경0이다.
