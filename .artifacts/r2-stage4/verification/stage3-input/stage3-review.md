# Stage 3 최종 백엔드 검토 — 승인

검토 SHA: `09413ba38ee6d1c69925b1c479ce44e03e6885cd`
base: `16444fe86eab374c2a1468f73d5c25b94a51e546`
PR: https://github.com/netsus/homecook/pull/1552

**판정: approve. 백엔드·공유 소유 checklist 30/30 검토 완료, 필수 R2-S3-001/002 해결, 잔여 필수 0.** 새 필수 finding은 없다. 이 판정은 해당 SHA의 Stage3 범위에 한하며 GitHub 승인/merge·Stage4 UI·운영 배포/활성화를 실행하거나 승인한 것이 아니다.

Reviewer task `01a08d65-e8dc-74c0-8d0e-3c8a96c1ac00`는 author `01a08d06-6589-72f0-ab20-2da7a6b91e08`, coordinator `01a07316-265c-7f22-b0af-fa22b7fb2b8a`와 다르다. 기존 부분 보고서와 재개 checkpoint는 역사 기록으로 보존하며 현재 SHA 판정은 이 보고서가 대체한다.

## 필수 수정 종결

- **R2-S3-001 해결:** 검증된 schema/topiccookie에서 식별한 bucket을 단일consumeRate로 처리. 기본rate가 JSON/schema/cookie 오류에 우선하고 부정cookie PID는 사용하지 않음. 실제file regression 최장3570초/미초과counter증가/무RPC 확인. Cookie-less bootstrap은 기본rate뒤 inspect로확인한참여만추가차감하여 DB경계보존. [코드](/Users/cwj/.codex/worktrees/210f/homecook/lib/server/marketing-round2.ts:121)
- **R2-S3-002 해결:** END후 IDB transaction에서 비식별marker로대체, memoryfallback삭제. 정상/explicitrestart/storagefailure에서 newkey/event/cookie_resume0. END전1ms/정각/후1ms/retention후/quota후복구를 실제Chromium검증. [코드](/Users/cwj/.codex/worktrees/210f/homecook/lib/marketing/round2-session.ts:107)

미확정 후보 **R2-S3-C01**은 이번 변경에 포함되지 않았고 required가 아니다. r2 Turnstile/HMAC 교차 중복 설정의 실제 계약 위반이나 권한 우회를 확증하지 못했다. 기존7HMAC 독립·legacy키중복 차단을 검토했으며 이 후보만으로 임의 제품·공식 계약 변경을 요구하지 않는다.

## 검증 증거

| 소유·범위 | 결과 | 기록 |
|---|---|---|
| Reviewer, exact head R2 suite | 201 passed, exit0 | [unit.log](unit.log) |
| Reviewer, fresh isolated SQL/SDK | 396 assertions, exit0 | [isolated.log](isolated.log) |
| Reviewer, 실제 HTTPS→handler→SDK→DB/file | 6 passed, 0failed, 0skipped | [http-integration.json](http-integration.json) |
| Reviewer, 실제 Chromium/IndexedDB | 21 scenarios, exit0; publicPOST/외부요청/serverDB0 | [browser-result.json](browser-result.json) |
| Reviewer, 이전SHA legacy/SDK | 107 passed; 관련기존코드불변 | [legacy-sdk.log](../legacy-sdk.log) |
| Author, f09a85c8 전체 backend | lint/typecheck/build, product7708 passed/515 기존환경skip, securityE2E12, exit0 | [backend-final-head.log](/Users/cwj/.codex/worktrees/c7d7/homecook/.omx/artifacts/r2-stage3-repair/backend-final-head.log) |
| GitHub, exact reviewed head | 22checks COMPLETED SUCCESS/intentionalSKIPPED; pending/failed0; nonDraft | [pr-final.json](pr-final.json) |

396은 독립 SQL 테스트 수가 아니라 assertion 합계이며 HTTPS6 실행확인 assertion도 포함한다. 신규 경쟁은 **3범주·6시나리오·52assertions**다. 네 병렬 케이스는 fresh fixture table을 잠근 뒤 두 RPC transaction이 기다리는 것을 직접 관측하여 같은key bootstrap/same-pid lead 경합을 확인한다. 나머지 두 케이스는 inspect 후 다른 survey/lead가 commit된 뒤 apply가 상태를 재검사하여409·부분쓰기0·원receipt불변을 확인한다. 기존에 부족했던 실제 경쟁 증거가 닫혔다.

DB는 고유 `hcg_14862_6dfdfa`, Supabase CLI2.110.0, migration bundle `6e04722b44718c0f3e62579dd5617370b68a4a813d3164c816952079b009d3c8`, SQL `1a783932ef81041414828e336b1f8c9a75666db44180583add72a4f326324ff8`다. 기존 runner의 finally와 owned-resource 잔여 검사까지 exit0이며 운영 target/volume은 선택하지 않았다. HTTPS runner 종료 후 Chromium runner를3443에서 직렬 실행했다. provider만 fixture이며 Next 전체페이지/실제Turnstile 검증이라고 주장하지 않는다.

f09→09413은 삭제참여검증 요청의 freshcontrol 한 줄뿐임을 직접 diff 확인했다. app/lib/tests/types/SQL/package/lock은 같아서 author 전체backend 결과를 재사용했고 currenthead CI를 별도로 확인했다. concurrency-result.json의 초기실행과 최종isolated 실행은 구분한다. Reviewer는 최종runner396을 직접 다시 실행했다. 이전 실패customartifact 재실행·모델/환경변경 우회0, 이번 보안제한 재발0이다.

## 소유 checklist 30개

| ID | 검토·충족 근거 |
|---|---|
| `delivery-backend-contract` | 공식 r2.1 §2–10/workpack 대조 및 두 finding closure. 기존 v2/Stage4 소유 경계 유지. |
| `delivery-api-adapter` | exact Next POST→handler→execute-only scoped SDK→단일 RPC. SDK107 회귀 기록 및 current HTTPS6. |
| `delivery-types` | 공개 union/내부 command·result/nullable와 topic 설문 상수 일치. R2 201 및 prior 정적 검토. |
| `delivery-state-policy-tests` | 실제 상태·오류·멱등/동시성 검증396. 같은key/pid와 inspect/apply 공백 해소. |
| `delivery-fixture-smoke-split` | unit/file/Chromium/실제SQL·HTTPS 분리. provider fixture 및 운영·UI 미검증 표시. |
| `delivery-bootstrap-readiness` | 최초 parent1/event1/revision1/lead0, cookie_resume no-op, IDB21과 END정리 직접 통과. |
| `accept-api-envelope` | exact response projection, fixed errors/headers/receipt 및 실제 HTTPS6 확인. |
| `accept-r2-survey-copy` | 네문항 label/API/SQL enums와 Q1/Q2/부정응답 공용 상수·검증 일치. |
| `accept-state-transition` | 두주제 단독3활동·6순서, 선행없는complete409, 다른상태를 가짜완료하지 않음. |
| `accept-idempotency` | same-key bootstrap same/differentevent, same-pid lead same/differentevent 병렬잠금대기 확인; revision/receipt/row수 직접검증. |
| `accept-r2-survey-state` | 시작/제출 server example snapshot, sameanswers no-op/different409, inspect뒤 경쟁survey commit 재검사 통과. |
| `accept-r2-errors` | 고정 오류표/fields와 rate+JSON/schema/cookie 우선순위 회귀 통과. R2-S3-001 최장3570초 확인. |
| `accept-owner-guard` | 서명topiccookie/context/exactorigin/scope 및 모든replay gate/generation 유지. 합성rate 수정검증. |
| `accept-invalid-input` | exactparser/unknown·duplicatekeys/8KiB/UTF8/enums/email/token/동의 검증201. |
| `accept-r2-bootstrap` | 실제Chromium 원자IDB/동시탭/별attribution/reload/confirmed와 실제DB 동일key 경쟁 검증. |
| `accept-r2-expiry-restart` | 서명확인410 matchingcookie만삭제, IDB restartmarker; END정각/이후/retention이후 newkey/event0. R2-S3-002종결. |
| `accept-r2-rpc-atomicity` | 실제3경계fault rollback0, 같은pidlead경쟁, staleinspect→survey/leadcommit→apply409 및 losingevent미선점. |
| `accept-r2-rpc-authority` | 실제owner/searchpath/timeout/FORCERLS/anon·auth·service직접tabledeny/wrongscope·role·method·path; 9함수manifest불변. |
| `accept-derived-fields` | deferred revision=applied수/시간/survey·leadprojection/deadline/일부event삭제deny/cascade 실제 검증. |
| `accept-r2-control-lease` | 실제HTTPS commit응답유실→sameevent proof와 unknown→lease유지/controlwriter차단. 단위gate갱신검증. |
| `accept-r2-limiter` | 실제filestorage 다중bucket 한lock/최장retry/미초과증가 및 오류우선순위. 기존owner/symlink/orphan/clock/persist실패 테스트 통과. |
| `accept-r2-contact-dedup` | 같은email 20pid/양topic unique와repeatNULL/legacy accepted·expiry·lookuperror 확인. provisional한계 유지. |
| `accept-r2-pii` | 실제backendlog와event/public projection PII배제, safeSQLSTATE 변환. 실제운영log승인은 별도. |
| `accept-r2-retention` | deferreddeadline/expiry·withdrawal matching모든topic cascade/export삭제/generation 실제fixture. END local정리 보강. 운영purge와구분. |
| `accept-r2-legacy-regression` | prior legacy+SDK107 직접검증 및 currentisolated legacychecksum 불변; author전체7708와CI 참조. |
| `accept-real-db-ready` | 고유 hcg_14862_6dfdfa/CLI2.110.0/고정migrationbundle/HTTPS3443직렬, 실제exit0 및ownedcleanup. |
| `accept-bootstrap-owning-flow` | 실제DB 신규parent/event/revision/lead수와기존cookie_resume 관측event/상태불변 확인. |
| `accept-r2-additive-migration` | SQL SHA1a783932 불변. 신규3table/constraints/index/FK/RLS/trigger/RPC추가와기존wrapper보존 검토·replay. |
| `accept-vitest-split` | current 직접R2 201, SQL396assertions, HTTPS6/0skip, Chromium21로 구분. UI는Stage4. |
| `accept-vitest-regression` | rate/END 회귀와신규6경쟁52assertions 직접검증. authorbackend7708/515환경skip과테스트소유분리. |

## 범위·유지한 제한

- 기존975의 SQL507줄/프로토콜·서명·런타임·파일storage·보조inventory/SDK/tooling·커밋·PR 정적검토를 재사용하고 새7파일은 테스트부터 다시 읽었다. 두추가커밋의 Lore 설명과 PR Actual Verification/Closeout/Stage4 미체크를 확인했다.
- 완료 설문/lead의 read-only·멱등/다른참여소유권은 backend 범위로 검토했다. 장보기 exclude→uncheck, pantry null/[]/선택값, 독립/플래너요리 전이는 해당변경이 없어 N/A다.
- 새경로 실제Next페이지/전체활동UI큐·화면권한복구·시각/접근성 authority는 Stage4이므로 미구현을 backend 결함으로 세지 않았다. 실제provider·실기기·privacy공개·운영키/ingress/activation·실제retention/purge/철회/export는 별도 인수한다.
- 저장소 장애 중 물리적IDB 삭제는 보장할 수 없다. 종료 후 재발급을 차단하고 복구 시 정리를 재시도하는 한계를 테스트와 문서에 명시했다.
- unknown결과의lease와orphan은 승인복구 전 닫힘을 유지한다. legacy 동시writer/삭제뒤재유입의 고유연락처 집계 한계도 유지한다.
- reviewer제품파일변경0, 작성자worktree변경0, 운영DB/배포/메일/광고/Discord/GitHubreview·merge0. own tracked worktree는clean이다. 보고서·실행evidence만저장했다.

최종 기계판정: [stage3-result.json](stage3-result.json). SHA별 변경파일과hash: [source-manifest.json](source-manifest.json). 최종merge 및 Stage4 진입은 조정자가 currenthead/CI와 이 독립검토를 확인한 뒤 관리한다.
