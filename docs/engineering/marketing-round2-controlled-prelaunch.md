# 2026-09-12 R2 한정 controlled DB·웹 배포 계획

상태: 사용자 승인 범위의 **검증 완료·실행 전 runbook**, 실제 운영 적용 전.
범위는 **두 topic / 검토된 4 SQL bundle / 아래 1개 live target / 한 전용 배포 브랜치**다. 일반 배포 framework나 SQL allowlist를 확장하지 않는다.

## 1. 이번 승인과 고정 대상

사용자는 이번 광고 집행 전 예외를 재승인하고 `master 머지 없이 두 랜딩 배포`, `기존 데이터 백업·보존하는 R2 전용 DB 적용 절차 준비·검증·저장 연결 완성 뒤 배포`에 진행을 명시했다. 같은 승인을 다시 요구하지 않고, 정확한 후보·도구·SQL·보존/중단 범위를 독립 검토한 뒤 그 안에서만 실행한다. 계약은 [r2 위임 계약 §12](../marketing-demand-validation-r2-contract.md)를 따른다.

| 항목 | 고정값/조건 |
| --- | --- |
| 현재 운영 predecessor | `458ce2daab6cdd91a70504657ce5981a4d4acf3c` |
| 통합 branch | `release/mumeok-r2-only-20260912` |
| 통합 작업 위치 | `/Users/cwj/.codex/worktrees/r2-prelaunch-20260912/homecook` |
| 문서 기준 | `8c6573bf594fa15613205ce97e4435d751c7d87c`; 이 전체 head를 배포하지 않음 |
| homeflow 원본 export | `f692ec738db53569d0e54acd9846700e3a4877f6`, 원본52파일과 통합 수정 bytes의 provenance 분리 |
| 배포 경로 | `/beta/r2/recording`, `/beta/r2/homeflow`, 기존 `POST /api/v1/marketing/round2` |
| live Compose / DB volume | `homecook-full-local-isolated` / `homecook-full-local-postgres` |
| 사전 관측 | 조정자 read-only 보고상 R2 tables0/RPC 없음, legacy 존재. 실행 직전 재확인 필요 |
| 원격 master | 변경0. 작성자는 local commit만 인수하고 push/merge/운영을 수행하지 않음 |

live 이름에 `isolated`가 있어도 **운영 데이터 target**이다. 어떤 isolated replay/restore 테스트에서도 위 project/volume·실제 container/PG system_identifier/PGDATA mount를 재사용하지 않는다. 실제 full-local은 승인된 controlled apply 또는 read-only 확인에만 쓴다. [local-only 기준](supabase-local-only-operations.md)을 유지한다.

## 2. 허용 변경과 최소 보안 패치 예외

candidate는 live predecessor의 descendant여야 한다. R2 변경만 선별하고 HOME/auth/planner 등 무관 코드·동작을 함께 가져오지 않는다. 기본은 무관한 의존성 업데이트0이다. 이후 조정자가 보고한 audit 실패에 따라 다음 **명시된 최소 보안 patch만** 별도 commit/검토로 허용한다.

| 패키지 | 이전 | 허용 대상 |
| --- | --- | --- |
| next | 15.5.21 | 15.5.24 |
| eslint-config-next | 15.5.21 | 15.5.24 |
| sharp (간접) | 0.35.3 | 0.35.4 |
| postcss (간접) | 8.5.18 | 8.5.23 |

live package.json의 next/eslint-config-next 15.5.21과 packageManager pnpm10.32.1은 Git object로 확인했다. 간접 구버전과 audit `critical2/high1/moderate1, exit1`은 조정자 관측이다. 여기서 운영 침해, Windows 한정 문제의 Mac 영향, 패치 후 보안 완료를 단정하지 않는다.

각 patch commit은 정확한 package old/new와 `package.json`/`pnpm-lock.yaml` delta를 대조한다. 불가피한 기존 간접 패키지 lock 변경도 항목별 이유·old/new를 독립 검토하며 무관 업데이트·새 package·기능·major 업그레이드는 허용하지 않는다. `corepack pnpm`10.32.1의 frozen install, `audit --prod`, build 및 기존v2/R2 회귀 결과를 확보한다. audit 잔여 항목을 숨기거나 임의 waive하지 않는다. generic file/SQL allowlist를 넓히는 예외가 아니며, 새 security delta를 반영한 최종 candidate SHA로 readiness를 다시 결합한다.

## 3. 기존 도구가 할 수 없는 부분

[일반 prelaunch](prelaunch-web-deployment.md)의 `validatePrelaunchMigrationSql`은 DO/함수/RLS 등의 이번 SQL을 거부한다. 그 guard나 전체 migration ordered-prefix 규칙은 그대로 둔다. 최초 파일이 거부되는 것은 우회할 오류가 아니다.

전용 경로는 이번 manifest의 exact 파일만 처리하는 `scripts/deploy-marketing-round2-reviewed.mjs`와 제한된 helper로 구현·검증됐다. 실행 순서는 `plan → prepare-web → apply-db`(결과 불명 시 `reconcile-db`) `→ stage-web → enable`이다. 임의 SQL 경로/glob/함수명/추가 옵션을 받지 않는다.

현재 일반 CLI에 `--reviewed-ref`는 있지만 `--nomaster`나 이 전용 receipt 소비 옵션은 없다. DB를 먼저 적용했다고 일반 `deploy-prelaunch-web.mjs`가 migration diff를 자동 인정하는 것도 아니다. fake baseline, filtered scope, 거짓 `migrationMode=additive`, SQL guard 비활성으로 일반 CLI를 통과시키지 않는다.

재사용 가능 범위는 기존 local Docker/production identity predicate와 `prelaunch-web-deploy.mjs`의 prepare/switch/verify/restore protocol 등 검토된 작은 primitive다. generic DB engine은 plan/apply에서 자기 guard를 호출하므로 이번 SQL bundle의 adapter라고 가장하지 않는다. 정식 [production promotion](local-mac-production-release-promotion.md)의 kill switch/tag/attestation 체계를 전역 해제하지 않는다.

## 4. 정확한 SQL 목록과 payload 변환

검토된 원본 순서는 첫 R2 생성 → homeflow 버전 추가 → recording 버전 추가 → 운영 shared scope 호환 보존이다. 네 번째 파일은 기존 3개 파일을 수정하지 않고 운영의 기존 outer 권한과 inner delegate를 보존하면서 R2 scope만 추가한다.

| 순서 | immutable source / 파일 | raw SHA256 |
| --- | --- | --- |
| 1 | `8c6573bf594fa15613205ce97e4435d751c7d87c` / `20260911100000_marketing_round2.sql` | `1a783932ef81041414828e336b1f8c9a75666db44180583add72a4f326324ff8` |
| 2 | `f692ec738db53569d0e54acd9846700e3a4877f6` / `20260911110000_marketing_round2_linear_homeflow.sql` | `8487ec85f9f55230d4eb9ec995781efbc22bec6aee4155cf6e1af79b95cdfe0b` |
| 3 | `20260911120000_marketing_round2_linear_recording.sql` | `d0c1a9918e624dd24f97cd355283bbf9cdd12440386846f6f3dce4a0cb8fdcf9` |
| 4 | `20260911130000_marketing_round2_scope_compat.sql` | `202a663a6ef2ee5fa3e6b61ec4334aeb244b6c30f659ebc51b9968da5d6e8d3d` |

네 파일은 자체 `begin;`/`commit;`을 포함한다. 외부 BEGIN 안에 원본을 그대로 이어 붙이면 내부 COMMIT으로 ledger 원자성이 깨진다. 검토한 변환은 **raw hash 검증 뒤 각 파일의 첫 7 bytes와 마지막 8 bytes만 제거**하는 것이다. BOM/개행 변환/trim/범용 SQL sanitizer/본문 정규식 치환은 없다. 원본 파일은 보존한다.

| 파일 | 원본 bytes / 제거 span (0-based, UTF-8 bytes) | 검토용 실행 payload SHA256 / bytes |
| --- | --- | --- |
| 110000 | 41684; `[0,7)`=`begin;\n`, `[41676,41684)`=`commit;\n` | `4ec3982dd76957185ddf6bedfada315932d6916f77391413df0471d5b5978eb0` /41669 |
| 111000 | 3669; `[0,7)`=`begin;\n`, `[3661,3669)`=`commit;\n` | `83e5843ebce996a1ec8806fa263cd482c6259818e248de85beba3fca09896016` /3654 |
| 112000 | 1726; `[0,7)`=`begin;\n`, `[1718,1726)`=`commit;\n` | `8edfcd54d17d0e4eb4b016da6518c79a8582d22d06fe6dbb796121a1600f846e` /1711 |
| 113000 | 2579; `[0,7)`=`begin;\n`, `[2571,2579)`=`commit;\n` | `450a384116c67e0f0f280f3d7e68023a9be8b579d1af7d755b4561380ec4328c` /2564 |

이 hash는 Git 원본에서 정적으로 계산한 **변환 검토 입력**이지 운영 적용 증거가 아니다. 고정 outer transaction/검증/ledger SQL와 네 payload를 조립한 bundle SHA는 `b36a0db141e1265e23b5d7d233028dec135bee0405d41a8c9784bdaf3e66665f`이며, 예상 외 transaction control/psql meta command는 거부한다.

111000의 CHECK 선택은 두 LIKE와 개수1 조건을 사용한다. preflight에서 대상 CHECK의 exact definition/dependency hash까지 승인된 baseline과 비교한다. 이름/개수만 맞는 다른 CHECK를 덮어쓰지 않는다. 기존2인자 r2.1 answers 함수는 보존하고3인자 함수는 version+topic을 엄격히 분리한다. 첫2개만으로 r2.2-recording 저장이 된다고 주장하지 않는다.

## 5. 실행 전 반드시 잠글 입력

하나의 private manifest에 operation ID, candidate fullSHA/tree, tool fullSHA, live predecessor, 원본 export/통합 provenance, 위 **4개** filename/raw/payload SHA와 bundle SHA, security patch old/new/lock delta, 독립 review refs, target identity, backup refs, 유한 timeout을 결합한다. 미기입/placeholder/unknown SQL/해시변경/무관 diff는 fail closed다.

target은 운영자가 제공한 외부0600 config와 로컬 Unix Docker socket으로 확인한다. exact Compose/container ID/image digest·실제 image identity·volume labels·PGDATA mount·health, PG system_identifier/DB명/서버 major/role을 실행 직전에 고정한다. 현재 운영 이름이나 과거 identity 관측만으로 선택하지 않는다. Docker 첫 항목/`--local` fallback/Cloud·linked·remote DB는 없다.

초기 prestate는 R2 세 table/RPC/helper 부재, 실제 legacy table/catalog, shared scope wrapper와 `pre_legacy_compat`의 exact signature/owner/proconfig/definition/dependency다. 일반 ledger/Supabase history도 fingerprint한다. 부분 R2 상태/알 수 없는 wrapper drift는 중단한다. 이미 적용된 경우에는 아래 전용 ledger와 exact postimage가 모두 같을 때만 no-op다.

## 6. bounded backup·legacy fence·단일 transaction

아래는 구현/격리 리허설에서 검증할 순서다. 이 작성 작업에서 실행하지 않았다.

1. 실제 최종 candidate와 tool의 독립 검토·isolated replay/기존458ce 호환·보안 patch 검사·유한 operation 예산을 확인한다. 웹/plist/build identity와 기존 배포 lock을 고정하고 R2 env/control off, in-flight/DB transaction drain 및 동일 CONTROL_PATH.lock lease를 확인한다. 결과 불명 기존 작업이면 새 작업을 시작하지 않는다.
2. 하나의 지속 `BEGIN ISOLATION LEVEL READ COMMITTED` transaction에서 기존 deploy advisory lock `(104230921,77101)`과 legacy `marketing_validation_sessions` SHARE lock을 얻는다. lock 전에 얻은 오래된 snapshot을 기준으로 쓰지 않는다. R2 lease만으로 v2 writer가 멈춘다고 가정하지 않는다.
3. 기존 writer 완료/lock 확보 후 legacy fingerprint를 기록하고 `pg_export_snapshot()`을 발행한다. exporter transaction을 유지한 채 같은 snapshot의 `pg_dump -Fc --snapshot`을 별도 연결에서 완료한다. DB 전체의 non-system schema/data/large object를 보존하며 table filter/sanitize/data-only/schema-only를 쓰지 않는다. roles는 `--no-role-passwords`와 기존 비밀 저장소 복구 근거를 분리한다.
4. 새 외부0700 directory/0600 exclusive 파일에 dump를 저장하고 fsync, SHA256, target/tool/candidate/snapshot 시각·bytes를 기록한다. archive TOC/list와 전체 archive 읽기/해독을 확인하고, 별도 진짜 isolated restore/replay의 실제 수행 범위를 기록한다. `pg_restore --list`만으로 전체 복원 PASS라고 하지 않는다. 기존 백업을 덮어쓰거나 자동 삭제하지 않는다.
5. 같은 fence에서 prestate/4SQL hashes/ledger를 재확인하고 고정 payload를 실행한다. 모든 schema 변경·invariant 검사·R2 전용 ledger 기록은 같은 transaction 안에 둔다. 네 파일의 내부 BEGIN/COMMIT이 섞이면 실행 전에 거부한다.
6. commit 직전 legacy의 PK순 전체 column row digest/count와 column/default/constraint/index/trigger/RLS/policy/ACL catalog hash가 동일한지 확인한다. 이메일/개별 row/row별digest는 공개 출력하지 않는다. 의도된 shared scope wrapper 변경은 별도 승인된 유일한 definition delta로 검사하며 몰래 불변 대상에서 제외하지 않는다. 다른 table의 정상 동시 DML까지 불변이라고 주장하지 않는다.
7. R2 exact3table/RPC/helpers/권한/버전 CHECK와 ledger가 맞으면 COMMIT한다. 별도 read-only 연결로 동일 operation의 완전한 ledger/postimage/target을 재확인한 뒤에만 committed receipt를 발행한다. 이후 승인된 PostgREST schema reload/읽기 확인을 수행한다.

SHARE lock 동안 legacy INSERT/UPDATE/DELETE는 대기하고 SELECT는 허용된다. 따라서 이 방식은 무중단이라고 표현하지 않는다. 이번 manifest는 lock 대기, exporter idle-in-transaction, dump, SQL, 전체 legacy-write-pause의 **유한 상한**을 실제 수치로 고정해야 한다. 수치는 isolated 측정과 독립 운영 검토에서 결정하고 미기입/무한대/실행 중 자동 연장을 거부한다. 상한 초과/백업 실패/lock 실패면 DDL 없이 중단하거나 미커밋 transaction을 ROLLBACK한다. 큰 중단을 조용히 허용하기 위해 상한을 늘리지 않는다.

PostgreSQL의 [snapshot export](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION), [pg_dump snapshot/전체 archive](https://www.postgresql.org/docs/17/app-pgdump.html), [SHARE lock](https://www.postgresql.org/docs/17/explicit-locking.html) 지원을 문서에서 확인했다. 실제 설치 버전·용량·시간·복원 성공은 별도 실행 근거가 필요하다. raw dump는 기존 sanitized 플랫폼 백업이나 서비스 stop/start wrapper로 대체하지 않으며, DB snapshot이 Storage/off-Mac/v5 전체 플랫폼 복구를 대신한다고 하지 않는다.

## 7. ledger와 불명 결과

R2 전용 운영 내부 ledger를 사용한다. 제품 public3테이블과 별개이며 PUBLIC/anon/authenticated/service_role 직접 접근을 허용하지 않는다. ledger DDL 자체도 검토된 고정 bundle에 포함한다. operation/candidate/tool/filename/raw+payload+bundle hash/target/backup digest/실제 적용시각을 결합하고 SQL과 원자 commit한다.

일반 `homecook_deploy.migrations`는 전체 ordered prefix를 의미한다. R2 4개만 적용하고 나머지 migration을 applied로 넣거나 Supabase history를 조작하지 않는다. 일반 ledger는 그대로 보존한다. 후속 일반 배포는 전체 이력을 실제로 조사·독립 reconcile하기 전 prefix가 맞는다고 가정하지 않고 차단한다. 이번 전용 receipt를 일반 ledger의 대체 신뢰값으로 주입하지 않는다.

dispatch 전 owner-only journal을 fsync하고 lease를 보존한다. timeout/통신 단절/psql exit/COMMIT 뒤 검사 실패는 rollback 증거가 아니다. 상태는 다음처럼 구분한다.

| 상태 | 근거와 허용 동작 |
| --- | --- |
| not-applied | 관련 session 종료와 exact prestate/ledger 없음까지 확인. 백업/실패기록 보존 후 같은 승인계획의 명시 재시도 가능 |
| committed | target 동일·완전한 exact ledger+postimage readback. receipt 발행 및 웹 단계 검토 가능 |
| unknown 또는 partial/drift | lease/journal/backup 유지, 새 apply·웹 activate·자동 app rollback 금지. 담당자가 실제 session/DB상태를 확인해 reconcile |

객체 존재만으로 applied, ledger 없음만으로 미적용이라고 판단하지 않는다. 동일 manifest/ledger/postimage만 재실행 no-op다. hash 충돌/부분 ledger/다른 payload는 중단한다. orphan lock 자동 탈취·자동 SQL 재시도·backup 삭제·DB reset/restore는 없다.

여기서 미커밋 transaction의 ROLLBACK은 원자성 보호다. **COMMIT된 DB에 down migration/역SQL/backup restore로 돌아가는 DB rollback은 이번 범위에서 금지**한다. 문제는 R2 off와 증거 보존·조정자에게 보고한 검토된 forward repair로 다룬다. 비상 전체 복구는 이 제한된 배포 범위가 아니다.

## 8. 실제 readiness와 두 랜딩 저장 연결

기존 runtime은 매번 git HEAD와 `release_sha`를 대조한다. 최종 candidate SHA, 현재 consent_generation, 실제7개 독립 R2 HMAC key+R2 Turnstile fingerprint, exact origin/hostname, 실제 `proofs`와 `proxy`를 결합한다. 기존 v2 secret이나 과거8c/master readiness, placeholder path/hash/approval을 복사하지 않는다.

현재 정확한 proof keys는 `turnstile_live`, `db_migration`, `db_authority`, `privacy_consent`, `retention_runbook`, `operator_approval`; proxy proof는 `direct_access_denial`, `header_overwrite`, `launch_binding`이다. `cf-connecting-ip`, `loopback-only`, `cloudflare-tunnel` 경계의 실제 근거를 확보한다. tunnel health나 CF ray만으로 header overwrite/direct denial을 검증했다고 하지 않는다.

anonymous POST에도 production evidence가 필요하므로 성공 POST로 자기 readiness를 먼저 만들어야 하는 순환을 만들지 않는다. 승인된 **비저장 provider/ingress 경계 검증 → 실제 proof → collection/lead enable** 순서다. 두 topic의 실제 hostname/action challenge와 안전한 결과 증거가 필요하고 raw token은 저장하지 않는다. 독립 privacy/동의 공개 반영과 보관삭제 runbook이 갖춰지지 않으면 lead는 닫는다. 이번 문서가 실제 위젯/검증 완료를 주장하지 않는다.

candidate loopback의 두 exact GET/SSR topic/질문·version/404/canonical/cache/no-referrer/assets를 확인하고, 운영 스키마와 동등한 진짜 isolated baseline에서 두 UI가 bootstrap→각 시작/submit→최종체험완료→lead/receipt까지 실제 R2 저장을 사용하는지 검증한다. preview/fake provider와 실제 DB 저장 증거를 구분한다. 실제 운영 POST probe는 현재 승인범위의 synthetic identity/원본보존·정리·통계제외 계획이 구체화된 경우에만 수행하고, 계획 없는 시험 데이터를 legacy에 쓰지 않는다. 새 test flag/제품 field를 만들지 않는다.

## 9. 전용 receipt를 소비하는 exactSHA 웹 교체

전용 웹 교체는 receipt 파일hash뿐 아니라 승인 plan/candidate/tool/live predecessor/target/SQL ledger/postimage/immutable scope hash를 **다시 읽어** 일치시킨다. candidate의 DB diff가 검토된 4SQL과 완전히 같고 실제 applied hashes가 같을 때만 이미 적용된 R2 bundle로 인정한다. 관련 없는 DB 파일이 하나라도 있으면 중단한다. 일반 CLI가 해당 receipt를 지원한다고 가정하거나 fake scope/baseline으로 호출하지 않는다.

같은 operation lease와 기존 웹 plist/build identity fence 아래 기존 prepare/build/별도포트확인/switch/verify protocol을 제한적으로 재사용한다. 변경할 웹/환경/고유 build ID/원복본은 manifest와 결합한다. `--reviewed-ref`가 요구하는 live descendant도 검증한다. master merge나 remote master update를 수행하지 않는다. worker/Docker/volume/network 구성을 이 경로로 교체하지 않는다.

웹 교체 후에는 `/beta`와 비R2 smoke뿐 아니라 두R2 path, 실제 build/static hash, DB read-only identity/ledger, 실제 승인된 저장 연결 결과를 확인한다. DB unknown이면 activate나 rollback을 시작하지 않는다. DB committed+이전 앱 호환 증거가 있을 때 웹 검증 실패는 **이전 웹/env만 복원**하며 DB/data/ledger/backup은 보존한다. DB commit 뒤 오류를 이전 transaction 미적용으로 잘못 분류하지 않는다.

## 10. 구현 담당자에게 넘길 최소 테스트 계획

| 검증 | 반드시 증명할 결과 |
| --- | --- |
| scope/identity | 다른SQL/bytes/candidate/tool/target/운영volume를 격리target으로 선택/무관패키지 delta 전부거부 |
| payload | 원본hash·exactspan·payload/bundlehash검증; 내부COMMIT/추가transaction/임의SQL 없이4SQL+ledger 원자성 |
| backup/fence | 원본전체dump·같은snapshot·archive검증·실제isolated복원범위,legacy DML경쟁·timeout시무적용,원본PII공개0 |
| schema/legacy | 실제live458ce 의존 baseline replay,두r2.1+두r2.2 교차거부·기존row/함수의미보존·sharedwrapper정확delta·legacycatalog/datahash동일 |
| fault/retry | SQL1/2/3/4·ledger실패 rollback,commit응답유실/after-commit오류 unknown보존,완전ledger+postimage+immutableScopeHash만no-op |
| readiness/web | 가짜/과거SHA/fingerprint/proof/receipt거부,일반guard유지,DBunknown교체0,두landing실제연결·기존v2회귀·웹만원복 |
| security patch | 명시package/oldnew/lockdelta별도검토,audit/build/회귀;무관업데이트·새package·major0 |

정적 원본/변환 hash와 격리 runtime/DB/복원 검증은 기존 PASS 증거로 잠겼다. 실제 운영 apply와 provider/ingress readiness는 이 문서나 기존 PASS로 대체하지 않고 배포 operation에서 직접 확인한다.
