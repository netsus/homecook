# 수량 v4 영양 validator의 DB228 → 229 보호 배포 준비

## 운영 결속 준비 — 아직 DB 적용 전

독립 검토한 동일 소스에 새 review PIN `7260854b2b072543379cebc8e75c3159c81c4f043da1feeaafe6e445bc2e325a`와 단일 migration raw SHA `a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd`를 고정했다. 기존13 PIN은 유지한다. 호환 reader `f0ae89064202fa63c5f13907dcfbd860494d65f8`/`prelaunch-f0ae89064202-rmygKW`가 DB228에서 동작하며, full source `aad3135bca56870eb8f2da5ccce7be9d63d0fb29`의 단일 SQL만229 대상이다. 실제 before와 native postimage의 단일 함수 투영·기존권한/기록 보존·백업/reader 근거를 별도 검토서에 결속했다. 이 결속 자체는 운영 DB 적용이나 pending 등록 복구 완료를 뜻하지 않는다. 아래 null/PIN 미주입 문장은 구현 동결 당시 기록이다.

이 문서는 기존 배포 도구의 로컬 구현 계약이다. 새 운영 PIN과 migration SHA 상수는 null이며 실제 실행은 거부된다. 운영 적용·worker 설치·실제 AI 호출을 검증한 기록이 아니다. 기존 C04/개인 확인의 DB227/228 검토서와 영수증은 변경하지 않는다.

## 대상과 순서

1. 기존 일반 웹 배포로 `sourceReaderRef` A를 먼저 반영한다. A는 SQL228을 유지하면서 저장된 기존/새 warning을 읽는 JS reader다.
2. 별도 `recipe-nutrition-v4-validator` 검토서는 A의 ref/build/plist와 `lib/server/recipe-nutrition-snapshot.ts` SHA를 고정한다. `migrationSourceRef` B는 A의 후손이며 runtime 변경 없이 정확한 새 migration과 검토서에 적힌 tests/docs만 추가한다.
3. 기존 `pnpm deploy:dev:plan` / `pnpm deploy:dev`의 `--reviewed-protected-rollout --protected-phase nutrition-database`를 사용한다. 새 CLI·generation override·임의 SQL 옵션은 없다. 확정된 미적용 결과의 재시도는 `nutrition-database-retry`, 미확정 결과의 읽기 복구는 `nutrition-reconcile`이다.
4. 단일 `20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql`만 기존 엔진에서 적용한다. C03/C01/C04/개인/worker ON과 현재48, queue0/permit 없음/enqueue0, exact catalog·함수/metadata·source registry·권한을 확인한다. 개인 facts/quantity metadata가 존재해도 허용하고 내용을 보존한다.
5. 기존 admin-owned ledger 잠금·postgres payload·5초 lock timeout·같은 transaction의 snapshot 백업/전체 decode·SQL와 원장229의 원자 commit을 재사용한다. reader를 SQL 직전과 COMMIT 직전에 다시 확인한다. 새 SQL validator 확장이 v4 쓰기의 활성 시점이며 새 control/table/writer flag를 만들지 않는다.
6. committed229 뒤에만 기존 일반 `--reviewed-ref B --already-applied-db --db-config … --test-script test:feedback-batch:web`로 A→B의 정확한 전체 source 차이를 인계한다. 다른 migration·파일/byte 추가·부분 인계·unknown 상태는 거부한다. 이후 일반 UI도 같은229 증명과 reader floor를 검증한다.

실행 명령의 ref/config는 최종 고정 검토서 값만 사용한다. 기존 root 권위 파일은 덮어쓰지 않는다.

## 증명과 보존

새 검토서는 원 개인228 terminal/reader/writer의 path와 raw SHA, ordered228/229 migration 목록, 단일 SQL raw/payload SHA, 단일 함수 definition/body/metadata before/after를 고정한다. immutable/stable/scope/columns/worker critical catalog는 같은 값이어야 한다. 격리 증거는 함수 하나만 변경·일반 행/개인 facts/모든 control 보존을 확인하고 reader flow는 기존 payload와 v4 warning payload 호환을 별도로 확인한다.

새 committed 영수증은 고정 `protected-nutrition-validator` guard/operation 경로에서만 읽는다. 현재229는 별도 `databaseMaintenance` binding으로 연결한다: schema, 원 review SHA, 새 terminal path/SHA, 개인228 terminal SHA, target, ledger229, migration SHA, sourceReaderRef, 새 DB plan SHA. 기존 marker의 `databasePlanSha256`은 원228 그대로이며 현재229 plan으로 바꾸지 않는다.

DB 결과가 applying/unknown이면 status/일반 웹/다른 writer 입장을 차단한다. 기존228 성공으로 fallback하지 않는다. COMMIT ACK나 terminal 발행이 유실되면 자동 재실행하지 않고 원 intent/backup/현재 exact 함수와 ledger를 읽어 reconcile한다. 미확정 개인/C04 writer가 남아 있으면 migration admission을 거부하고 새229 writer intent에는 현재 binding을 넣는다. old228 unknown의229 reconcile/retry는 거부한다. 이미 committed된228 writer ON 이력은 보존한다.

worker critical catalog·credential48·모델/pipeline/policy/key version은 바꾸지 않는다. 기존 worker CLI의 같은48 pause/resume/activation은 원227 및228 증명과 현재229 binding을 분리해 소비한다. old228 unknown activation을229로 재해석하지 않는다. 새 pause/repair의 enabled/timestamp whole-row 변동은 기존 controlled 영수증 chain과 stable policy 검증으로만 승인한다. 실제 사용자 데이터의 새 hash를 과거 transaction hash와 영구 동일하게 요구하지 않는다.

## 실패와 복구 한계

B의 웹 교체 실패 시, 캡처한 정확한 A ref/build/원 plist/reader JS bytes와 committed229를 확인하고 B checkout의229 source/applied 목록으로 다시 검증한 뒤 A 웹으로 보상할 수 있다. A의 Git migration 목록228을 현재 DB229의 기대값으로 쓰지 않는다. pre-fix reader로의 자동 복귀·자동 DB 복원은 금지한다. 이 추가 검증이나 기존 서비스/marker guard가 실패하면 보상도 중단하며 forward repair가 필요하다. 성공 배포 뒤 임의의 구버전 rollback 권위를 새로 만들지 않는다.

새 warning을 가진 행이 생긴 뒤 이전 validator/reader로 되돌리지 않는다. 기존 safe OFF는 각 기존 control만 닫으며 이 SQL 변경을 되돌리지 않는다. 기존 writer ON 재승인·재발행 한계, credential 만료 거부와 같은48 복구 조건을 유지한다. 새 renew/키 발급 체계는 포함하지 않는다.

## 로컬 확인 범위

선택 unit은 reader SQL 전/COMMIT 전 실패, ACK/terminal 유실과 읽기 reconcile, old unknown 입장 거부, 229 marker·source handoff·A 보상, nonempty facts/정상 새 데이터,229 same48 pause/resume/activate 및 foreign binding 거부를 검사한다. mock CLI/모듈은 원 PIN들을 중립화한 소유 복사본과 임시 경로만 사용한다.

별도 격리 native는 허용된 schema-only228 dump/무비밀번호 roles, 신규 UUID label, pinned image/pull-never, network none·공유 port/mount 없음·행0 선행 확인 후 synthetic control/worker/ledger만 사용한다. fixture의 before/after catalog는 운영 기대값이 아니다. 원 guard를 낮추지 않으며 운영 직전 exact 증명/백업/서비스 상태 확인은 별도 운영자 단계다. 구체 결과와 실패 이력은 최종 `/tmp/mumeok-nutrition-validator-deploy-v2-freeze.json` 및 handoff에 기록한다.


독립 검토 보완: failed activation catch는 원 successor와 현재 maintenance를 각각 비교한다. 현재229 proof가 바뀌면 OFF 관측만으로 not_applied를 확정하지 않고 unknown을 유지한다. nutrition CLI 결과도 committed receipt의 true값을 그대로 보고하며 unknown/not_applied에는 null을 출력한다. 기존 기능의 false 출력은 보존한다.

V1의 facts0 native 보고서는 역사 근거로 보존한다. V2는 별도 owned fixture에서 정상 complete/retract wrapper로 개인 확인3행(철회1행), 실제 식사 writer로 원1/2인분 quantity_input 행1개를 생성한 뒤 engine 적용과 백업 복원에서 사실·원근거·행 전체 JSON·quantity_input SHA를 각각 비교했다. 정상 데이터는 replica 모드로 만들지 않았다. schema-only 초기 metadata4행에 한한 기존 fixture bootstrap은 짧은 LOCAL replica transaction 후 origin SHOW, 전체 catalog/trigger enabled/ACL 불변을 확인했으며 실제 인증 bootstrap 검증으로 해석하지 않는다.

최종 결속 검토에서 운영 예상 catalog 생성기의 문자열 치환이 함수 정규식의 `$'`를 해석하는 오류를 발견해 적용 전에 중단했다. 잘못된 예상값과 검토서는 별도 보존했다. callback 치환으로 고친 뒤 embedded 함수 원문 SHA `40be1d8a…`와 전체 읽기 전용 query SHA `c93cfd25…`가 독립 재현값과 같은지 실행 전에 검사했다. DB228을 다시 읽어 계산한 단일 함수 변경 후 예상 catalog는 `f2df5d3be461f310fa159bef640cb62eb113735bfdeac1ccb2e2d334895078a6`다. 이는 여전히 예측값이며 실제 COMMIT 후 일치 검사를 대체하지 않는다. 운영 함수나 원 migration SQL은 수정하지 않았다.
