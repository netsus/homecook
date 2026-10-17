# 요리 요구에 직접 연관된 로컬 후보28개 후속 — 2026-10-17

초기1차 분류의 추가 조사28개를 **13개 조사 단위**로 묶었다. 같은 patch/기능 계열을 반복 조사하거나 후보 수를 결함 수로 세지 않는다. 현재9개와 직접 관련된 수량 권위·영양 원천·저장/재진입 경로를 먼저 확인했다. 앞선 실험8개·정책 보류20개는 활성화하지 않았다.

[전체 ID·관련 요구번호·근거 파일·재개 조건 기계 기록](data/cooking-related-runtime-followup-20261017.json). ‘원천/정책/authority 대기’는 불필요 판정이나 수정 완료가 아니다.

| 조사 단위 | 후보 | 결론과 재개 조건 |
| --- | --- | --- |
| saved_quantity_provenance | `3ea568317`, `55e8a3651`, `dbd15fbe7` | 옛 provenance projection/formatter 하나의 겹치는 계열. 현재 unknown 재진입, confirmed quantity, v4 1/3→2/3/fingerprint 보존을 pure AST로 확인. 옛 추정 출처를 주입해도 사용자 확인량을 미확인으로 덮지 않음. #6 원입력 보조행 복원 근거 없음.3ea의 worker/media 부문은 별도 봉인 owner 범위. **재개:** 현재 saved reader/API→HTTP→실제 SQL 전 구간은 운영 잠금 해제 뒤 확인. provenance 상태가 user 확인권위를 덮는 구체 재현 또는 additive 출처 계약 필요. |
| optional_source_contract | `403e0f050` | 숫자 optional true/false가 현재 parser에서 같아지고 saved row에 optional을 넣으면 invalid_shape. 선택가능과 실제 미사용은 다름. 실행분0은 현재 계약상 거절/null은 양미확인. 자동 제외·0·완성무게 축소로 바꾸지 않음. **재개:** 원천 선택성의 UI/저장/canonical/실행분 의미를 additive 계약으로 확정한 뒤 구현. 이번9개가 선택 재료 자동 영양 제외를 요구한 것으로 확대하지 않음. |
| catalog_lookup_context | `79747f2b1` | 현재 정확 오일→식용유/size wrapper/Spaghetti mass rawText/정확 우선/동명이항목 문맥 분리 회귀 통과. 옛 amount/originalName/sourceTexts 신뢰 계약은 다름. 기존 정규화 rawText만으로 옛 source evidence 전체 동등성 주장 불가. 최근6개 최소 oil2행 계획과 제품/원천 미상 보류는 별도이며 새로운 연결/영양값 쓰기0. **재개:** 출처 진위/별칭 확장 추가 사례와 원문 컨텍스트 계약이 확보될 때 검토. 전역 substring alias·특수오일 치환 금지. |
| repeated_quantity_total | `4420a222c`, `aacc2c684`, `af1bbde7e`, `fe4603157` | 4420/aacc/fe460은 반복 투입 총량 확인/전달의 겹치는 계열. 현재 반복1T@90s/다시1T@122s가 explicit1T/issues[]이며 sanitizer 경고 필드 전달도 부재. af1은 같은 제목이지만 action-separated sourceName+suffix 복구 diff이며 별개 숫자 덧셈 fix가 아님. 이번 기준의 소스SHA/validator 결과 일치 재확인. **재개:** v85 소유자가 봉인 source/schema/adapter/UI/저장 계약과 총량 미확인 정책을 함께 검토. 자동2T 확정·옛manifest/worker patch 통합 금지. |
| fractional_duration_progress | `6e99bc4f2` | raw303.8초 progress가 정수 계약에 막혀 send0, ceil304초 send1. 영양량 숫자 결함과 구분. pure fake IPC이며 실제 worker/event 전달 검증 아님. **재개:** 봉인된 single-pass/worker/artifact version을 v85 소유자가 함께 갱신할 때 bounded duration 계약 보완. 현재 배포 target 변경0. |
| ocr_selection_budget | `be52242cd`, `db353398d`, `f87f50eeb` | 앞2개 low-confidence selection hint .5/.4 events[]와 f87 text-first representative120중96 선택을 확인. 실제 프레임/모델을 검증하지 않았으며 낮은 신뢰를 숫자 확정으로 승격하지 않음. f87은 repeated-step abstention 제거도 혼재. **재개:** v85 owner source-first 품질/비용/프레임 선택 정책과 실제 허용 평가 범위를 정한 뒤 검토. 추가 영상/모델 호출0. |
| source_bound_recovery | `0c98a367d`, `4b4ccbf90`, `bc8d1c89c`, `be9ea8dc0`, `c2e069259`, `e869582b4` | 인접 이름/approximate suffix, stable OCR/unitless amountRawText, qualified amount, merged-caption final action, parenthetical owner, inherited-unit heading의 연결된 원천 복구 계열. 현재 보수적 unknown/conflicting 합성 사례를 확인했지만 정확 수치가 무조건 복원되어야 한다는 근거는 아님. **재개:** v85 source fidelity 계약과 current schema-v5/verifier-v54에서 각 근거 소유권·모호량 정책을 검증한 뒤 최소 적용. 다른 계보의 동명v85/옛수치 복원 금지. |
| alternative_quantity_options | `d63342073` | alternativeOptions validator→sanitizer→parser→import 전달이 현재 없고 대안 수량은 unknown. 옵션을 합산하거나 임의 하나를 영양에 포함할 근거 없음. **재개:** worker/schema와 웹/저장 row의 선택 수량 additive 계약을 함께 정한 뒤 검토. 현 미확인 수량 유지. |
| quick_import_server_ack | `5dd595d02`, `8ed4fb0bd`, `d1bd349a7` | 동일 patch3개를 하나로 묶음. 현재 Recipio 성공 시 notify→durable local ack→notification center의 first/cursor/archive owner-scoped 조회→정확 job seen 성공 뒤 제거/실패 재시도 경로 존재.87회귀 중 관련 ACK 회귀 통과. 옛 server bookkeeping 전체 동등성은 아니며 현재9개 수량/완료/영양에 즉시 server helper 필요성 미확인. **재개:** 헤드리스/API 성공까지 server ACK가 필요한 별도 요구 또는 구체 실패 확보 뒤 최신세션RPC로 재설계. 옛 userId-only helper 복원 금지. |
| meal_readers_replay | `6abe9f0aa` | checked-in get_meal_log_day/get_recent_meal_log_sources/list_cooked_batches는 STABLE이며 잠금 가능한 assert_recipe_future_session_authority 호출. cached232 세함수는VOLATILE. 완료 후 기록/잔여요리와 직접 관련하나 현재운영/233·234 실패로 단정 불가. **재개:** 현재운영 상태 확인은 잠금 해제 뒤 담당자만. faithful fresh actor/canonical baseline과 catalog 지문 결속 포함한 격리 forward 검증 전 새DDL 추가/옛scopewrapper 복원 금지. |
| gamification_writer_replay | `d22ddb447`, `fb7b364ad` | 동일 patch2개. current caller/scope와 cached232 writer 존재는 확인했으나 checked-in CREATE SQL 없음. 요리/영양의 즉시 동작 결함으로 확대하지 않음. **재개:** writer 원 body/authority/owner/ACL/postimage와 repository replay inventory를 소유자와 일치시킨 뒤 forward 검증. cached 존재만으로 현재운영 동등성 주장 금지. |
| image_origin | `4bb48856c` | recipe managed thumbnail은 이미same-origin download proxy. book list만loopback/public origin이 불일치하는 공백을 재현해 매요청재인가 same-origin book proxy와 reader exact relative path를 최소 보완. origin분리1FAIL/13PASS·reader1FAIL/17PASS→4파일57PASS/독립57PASS/finding0·type/lint/build0. PR1793 master4446d01fc 병합, 운영 미반영. 옛7파일 전체 merge 아님. **재개:** 실제auth/Storage/모바일·데스크톱흐름은운영잠금해제후부모직렬조율. 다른legacy upload/create origin 정책은별도보존. |
| extraction_session_mutation_scope | `c12102df5` | current import의session table호출은insert/select. old Proxy update/delete/upsert 차단은없지만SQL youtube-extraction scope의session POST만허용하고PATCH목록에session없음/DELETE없음. actualRPC/HTTP경계시험미실행이므로방어완전동등성주장불가. **재개:** 확인된session mutation caller/권한실패또는추가defense-in-depth요구가있을때최신scopechain격리검증. 전역servicefallback이나불필요정책변경금지. |

## 기준 master의 실패2건 재현

수정 전 masterd55f20562(PR1788 뒤)와 최종 master4446d01fc(PR1793 뒤)를 각각 자기 소유 독립 checkout에서 동일 Node/dependency·동일5파일로 실행했다. 두 결과 모두 **67 PASS/2 FAIL, exit1**이고 실패 본문 전체가 같다. 기대 pipelineIdentity85fbf487…/실제6dd49441…, jobs 기대 policy2/실제3도 동일하다. 중간 master14464a83c도 같은 결과였고, 최종 master까지 제품/검사 변경은 저장/표지의8경로에 한정된다. 따라서 선택한 두 기존 실패가 저장 fallback·표지 scope 수정으로 추가/악화됐다는 근거는 없다. 전체 테스트/운영 readiness 통과로 확대하지 않는다. [기계 대조](data/runtime-core-baseline-comparison-20261017.json).

현재 정확 재료 연결/정규화·범위 제한·동명이항목 문맥·등록ACK의 기존4파일은 **87 PASS**다. ACK 성공은 현재 브라우저가 성공을 관측한 사용자 흐름이며 옛 server ACK의 모든 호출자 동등성은 아니다. 같은 원patch3개는 별도 server 확장 필요성이 생길 때까지 보류한다.

저장 분수/사용자 수량 UI와 실행분 서버·계산의 기존4파일은 추가 **34 PASS**다. 기존 UI/jsdom/서버 mock 회귀이며 PostgreSQL/실제 인증 HTTP/운영 완료 저장을 증명하지 않는다.

## 수량 권위와 선택성은 구분

[순수 재현7개](data/quantity-provenance-review-20261017.json)와 [그대로 보존한 스크립트](data/quantity-provenance-review-20261017.mjs)는 현재 함수31개/파일7개·UI callback을 AST 추출해 실행했다. 작성자 재실행도 동일 결과 SHA를 확인했다. React 렌더/HTTP/SQL 통합/영양 완료 저장 실행은 아니다. 스크립트의 root와 출력 경로는 원 /tmp checkout을 가리키므로 다른 위치에서 실행할 때 해당 로컬 경로를 맞춰야 한다.

unknown 재진입·현재 confirmed quantity·v4 원문1/3과2/3 사용자 편집/fingerprint는 보존된다. 실행 overlay190g은 원본100g을 바꾸지 않고 scalable:false/옛 proof 제거로 이중 배율을 막는다. 옛 provenance map을 주입해도 현재 확인량을 미확인으로 되돌리지 않았다. 옛 ‘원입력’ 보조행을 복원하거나 dbd/55e/3ea를 독립3개 수량 결함으로 세지 않는다.

반면 숫자 optional:true/false가 현재 parser에서 동일해지고 optional 저장 필드는 invalid_shape로 거절되는 원천 충실도 공백은 확정이다. 선택가능과 실제 미사용은 다르므로 영양에서 임의 제외/0처리하지 않는다. UI·저장·canonical·실행분의 additive 선택성 계약을 정해야 하며 현재9개의 실측/미확인 계산을 임의 변경하지 않았다.

## 남은 소유자·운영 경계

worker15개는 현재 봉인 source/schema/manifest에 걸친다. 반복 기름 총량 경고는 현재 소스SHA와 출력이 그대로 재현됐고 자동 합산 근거가 아니다. source recovery/OCR/alternative option은 보수적 unknown의 정책·원천 소유권을 검토해야 한다. 소수점 progress는 순수 fake IPC 경계로만 확인했다. v85 owner 없이 bundle/manifest/worker를 변경하거나 추가 모델 평가를 하지 않았다.

식사 reader1개와 gamification 동일patch2개는 source↔cached schema232 차이로 남는다. cached232는 현재 운영 동등성 증거가 아니며 새DDL3개를 지금 추가할 필요성까지 확정하지 않았다. faithful fresh actor·catalog/fingerprint 계약을 포함한 격리 forward 검증이 재개 조건이다. 기존177/214 차단과 원fence를 보존한다.

운영 DB/인증/Chrome/API 접근·데이터쓰기·배포·키/공유설정 변경0이다. 최근 영양 연결2행의 backup/CAS·실제 인증 종단과 DB233/234·웹 반영은 v85 잠금 해제 및 부모 직렬 조율 대기다. 기존 공개 UUID GET 거절은 실행 전 denied/재시도0이며 재접근하지 않았다.

## 이번 독립 조사 종료와 인계

추가 조사28개는13단위 모두 읽기·좁은 합성 검증·독립 리뷰를 마쳤다.4bb의 표지 부분은 [PR1793](https://github.com/netsus/homecook/pull/1793)으로 병합했고 다른 origin 정책은 보류한다. ACK동일3개는 현재UI 동작 확인 뒤 distinct server extension 소유자 보류로 이동했다. 남은24개는 재개 조건이 있는 조사 pending이다.

초기133개 최신 분할은 **최소 수정3·runtime 재머지 불필요75·실험8·정책/소유자 보류23·추가 조사24**다. 기존 실험8/정책20의 활성화0이며 새로 정책 보류에 들어간3개는 ACK동일patch다. 첫5개/C05별도5개, 부분 수정의 public-read/기타origin·다른파일 보류는 계속 별도다. 후보 전체 필요성/운영 완료를 선언하지 않는다.

현재 운영 접근 없이 독립적으로 확인할 범위는 마쳤다. 다음 작업은 표의 additive source/optional 계약, v85 봉인 worker 소유자 조율, faithful schema/catalog forward 검증 또는 운영 잠금 해제 뒤 담당자의 실제 인증/Storage/데이터 확인에 의존한다. Anti Slop는 기존5개 초과로 전체exit1이며 신규 표지 지적0/baseline수정0이다. 이것을 core의 기존 기대값2개 실패와 혼동하지 않는다.
