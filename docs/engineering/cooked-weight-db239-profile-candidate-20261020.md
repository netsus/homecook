# DB239 후속 프로필 후보와 운영 연결 범위

검토용 PR: https://github.com/netsus/homecook/pull/1841 . 앱/SQL과 아래 미결속 계약 후보는 구분한다. 현재 PIN은 null이며 정식 CLI/DB engine에 등록하지 않았다. 운영 DB·서비스·키·권한·R2 설정 변경은0이다.

## 구현한 호환성 후보

`scripts/lib/cooked-weight-mass-proxy-maintenance.mjs`는 외부 실행 코드가 없는 순수 검증 계약이다. 새 source manifest는 운영16cf3155→앱9645b954a의 정확55개 파일/blob pair와 원238개 SQL SHA를 고정한다. 55개 중5개는 최신master의 기존 운영/Anti Slop 문서를 그대로 승계한 것이며 제품·보호코드를 추가 수정한 것은 아니다. manifest/hash/PIN을 CLI 인수나 환경값으로 바꾸는 경로는 없다.

다음 범위만 검사한다.

- 원 DB238 committed predecessor binding, 현재 reader/build/plist, 별도 evidence/readiness 포인터와 기존 closed-R2 지문.
- 기존238개 migration의 순서/bytes 그대로+239 한 개의 정확한 raw/payload SHA. plan은 대상 I/O 없이 postgres용 payload 하나만 반환한다.
- 바뀌는 함수2개의 본문·메타데이터·원 OID, owner/ACL/grantor/config/security/language 보존. 완전한 기존 catalog query에서 이2개 OID만 제외한 나머지는 raw 지문으로 그대로 비교한다.
- 기존 전체 normal-data projection, 실행수량/식사/과거기록/원장 prefix/controls/scope OID 보존과 동일 gen50 worker의 drained 상태.
- 별도239 attempt/receipt의 원238 결속, snapshot/완전 decode/roles 백업, transaction-native postimage·OID·행보존 intent. unknown/applying/commit-dispatched/rollback은239 guard를 유지하고238 fallback/자동 재시도를 거부한다.

`assertMassProxyOperatingPin()`은 **새 PIN 미결속이면 config/target I/O 전 실패**한다. 이 후보는 운영 검토서를 읽거나 게시하지 않으며 DB 연결·DDL·backup·worker stop·selector 등록을 수행하지 않는다. 순수 receipt 검사의 review SHA 인수도 운영 승인 권위가 아니다. 향후 loader가 검증한 고정 PIN만 넘겨야 한다.

독립 리뷰는 최초76개 Node 검사를 직접 재실행해 통과를 확인했고, receipt의 normalProjection 결속 누락을 발견했다. 고정값 동일 검사와 삭제/변조 음성2개를 추가했다. 최종 재검사와 후속 독립 판정은 증거 JSON/로그를 따른다. 이 검사는 실제 CLI engine/DB239 적용 성공이 아니다. 앞 단계의 실제 native DB238 통합10개와도 구분한다.

## 실제 운영 연결에 필요한 최소 변경

| 파일/호출 지점 | 필요한 정확한 후속 연결 |
| --- | --- |
| 새 전용 계약/고정 source manifest | create-only239 검토서·새 SHA를 결속. 원238 PIN/receipt 불변. operator ref와 앱 ref 분리 |
| `prelaunch-database.mjs`: `openProtectedPrelaunchTarget`, adapter 선택 | 새 PIN/검토서/고정 query를 config/target I/O보다 먼저 확인. 정확2함수·전체 나머지·행·controls·238원장 관측 adapter |
| 같은 파일: migration plan/observation/engine/receipt/reconcile | 새 exact feature만 선택. 기존 SERIALIZABLE/exported snapshot/SQL+원장 한transaction/commit guard 재사용. 원 OID/native postimage/행보존 intent 결속. unknown은 새 거래 금지 |
| `prelaunch-web-deploy.mjs`: pins/paths/review/maintenance loader/binding/status/source handoff | 새 별도 경로.239를238보다 먼저 검사하고 unknown/foreign239에서238 fallback 금지. committed239 receipt 뒤 정확한 앱 source만 인계 |
| `deploy-prelaunch-web.mjs`: feature/phase 선택, `runProtectedDatabasePhase`, baseline/source/stage/status | 새 DB239 phase만 연결. 원238 predecessor와 현재 legacy reader 확인. 기존 `createCookingMaintenanceLocal` wrapper 필수. writer ON/OFF 불허 |

`assertClosedR2ContinuationOptions`, 기존 cooking/saved-nutrition PIN과 A/B, 일반 classifier allowlist, 보호 query/projection, auth/ACL/worker credential 설정은 바꾸지 않는다. 새 exact 검토서에 결속된 파일만 classifier support로 넘긴다. 새 feature를 추가했다는 이유로 일반 `--db-compatible` 쓰기를 열지 않는다.

위3개 기존 운영 모듈의 실제 분기 연결은 아직 하지 않았다. 별도 고정 검토서와 live/target/backup/native postimage를 담지 않은 상태로 운영 권위를 만들지 않기 위해 코드 후보와 분리했다.

## 필요한 검증

1. pure contract의 정상/위조 source·SQL·predecessor·metadata·OID·controls·receipt·unknown 회귀와 기존 exact238/app-successor 회귀.
2. 실제 CLI entry의 새 phase 정상/음성 선택, PIN null/변조/누락이 target I/O 전 거부됨, SQL0 앱 successor로239를 우회하지 못함, 이전235/238 동작 유지.
3. 기존 engine의 합성 adapter/journal로 snapshot/rollback/commit 불명확/reconcile·고정 OID intent·control 보존 확인. 새 worker wrapper에서만 apply/reconcile을 호출하는지 검사.
4. 이미 통과한 native DB238의 실제2함수 DDL/meal/권위10개에 운영 연결 adapter/engine 검증을 더한다. private data 없는 schema-only 복원 경로를 사용하며 fresh-replay214번째 실패는 그대로 보존한다.
5. fixed operator source 독립 검토→새 create-only 검토서와 현재 target/원238 receipt/source/build/plist/DB239 postimage 결속→정상 read-only plan. 실제 동작은 보호 엔진·개별 보안 심사를 거쳐 수행한다.

## 서비스 영향과 승인 경계

**현재 후보 작성/검사/PR 영향:** 운영 중지0, DB 연결0, 정책/설정 변경0. PIN은 인증키나 토큰이 아니라 정확한 운영 검토서 파일의 경로/SHA 결속이다. 새 키·토큰·DB grant·owner·R2 정책·worker 세대/만료를 바꿀 이유는 발견하지 못했다.

**별도 운영 권위를 게시하는 시점:** 새 DB239 검토서를 private create-only 위치에 기록하고 그 SHA/selector를 정식 도구에 연결하면, 기존 도구가 인정하지 않던 정확한239 변경을 수행할 수 있게 된다. 기존 DB238/R2 보호 완화가 아닌 새 릴리스 한정 권위다. 이 적용 경계를 부모에게 선행 보고하며, 현재는 수행하지 않았다. 기존08:25 사용자의 DB2함수/웹 전환 승인 외에 앱 인증·권한 확대 승인을 요구할 근거는 없다. 단, 이 새239 전용 연결을 기존 배포 승인에 포함하는지 범위 확인이 필요하다면 **이 한 항목으로 묶어 확인**하면 된다. 새 키/보안설정 변경이 추가로 필요해지면 그 정확한 동작을 먼저 보고한다.

**개별 동작 보호:** private 운영 artifact 작성, Docker/launchctl 서비스 제어, DB 적용, GitHub 쓰기는 실행 당시 샌드박스/도구 보안 심사를 따른다. 기존 승인이나 review 파일을 도구 인수에 삽입해 거부를 우회하지 않는다. 현재 이들 심사에서 거부된 동작은 없다. 최초 실패는 배포 source guard다.

**백업 창:** 기존 안전 절차로 enqueue fence86120317·drain→동일 gen50 worker plist 중지→gateway/auth/PostgREST/Storage(+존재하는 realtime)를 기존 cut controller로 일시 중지·DB+Storage 백업→같은 서비스/worker 복구·실제 인증/readiness→fence 해제. 이 동안 로그인/조회/저장/Storage 요청이 일시 실패할 수 있다. PR/build/복원 검증 동안 중지를 유지하지 않으며 시간 상한을 새로 보장하지 않는다. 이전77초 operation은 이번 중단 ETA가 아니다.

**DB 창:** 새로 짧은 fence/drain/동일 worker 중지·복구 창을 만들고 기존 transaction/lock/exported snapshot·전체DB/roles dump→원2함수+239원장→cache reload/reconcile을 수행한다. 키/권한/테이블 구조는 그대로다. 이후 웹 전환은 기존 launch agent와 health 절차를 쓴다. 이미 승인된 서비스 영향 밖의 변화가 관찰되면 중지·보고한다.

기존10/19 플랫폼 백업은 재인증했지만 DB232 시점이고24시간 기준도 만료할 수 있다. 새239용 현재 target 백업/readiness 및 실제 DDL 직전 snapshot을 별도로 확인해야 한다. 시간만 갱신하거나 과거 restore 증거를 새 결과로 재서명하지 않는다.

## GitHub와 배포 차단의 구분

- push와 draft PR1841 생성은 실제 성공했고 이 작업에 연결했다. 배포 가드가 GitHub 작업을 금지한 것은 아니다.
- 최초 PR 상태는 최신master와 문서1개 충돌이었다. 로컬 merge-tree로 확인하고 양쪽 진행 기록을 모두 보존해 통합했다. 제품/운영 source 충돌은 없었다. 원 사용자 저장소 dirty는 건드리지 않았다.
- merge는 아직 수행하지 않았다. draft 상태·최종 후보 검토/운영 연결 준비를 분리해서 관리한다. GitHub mergeability와 실제 head는 최신 PR 조회 JSON을 따른다.
- 운영 DB239/웹 전환은 아직 원 DB238 도구 guard에서 차단된 상태다. 위 후속 selector/engine 연결과 새 고정 운영 검토서 전에는 배포 가능으로 표시하지 않는다.

## 후속 실행 연결

위 inert 후보 기록 뒤 같은 승인 범위에서 세 운영 모듈의 좁은 연결을 구현했다. 현재 검증·새 리뷰/PIN·백업/릴리스 상태는 [릴리스 준비 기록](cooked-weight-db239-release-readiness-20261020.md)을 따른다. 과거의 미구현/미실행 표시는 해당 기록 시점의 상태다.
