# R2 Stage 2 백엔드 인수 기록

작성 task: `01a08d06-6589-72f0-ab20-2da7a6b91e08` · 역할: backend-implementer. 독립 Stage 3 승인이나 배포 승인이 아니다.

기준 커밋은 Stage 1 merge `fa7848924442df2790592b14875ccb6148e0c6ba`다. 공식 계약 #1551과 Stage 1 #1550의 독립 검토·병합 evidence를 조정 작업에서 전달받았다. README의 과거 Draft/pending 설명은 작성 당시 기록이다. 이 작업은 새 API·저장·검증·owned checklist와 Draft PR을 소유하며 화면과 운영 배포를 소유하지 않는다.

## 구현 경계

- `POST /api/v1/marketing/round2`: exact 입력·출력, 페이지 문맥/쿠키 서명, 현재 gate/동의 generation/rate, inspect → 필요한 Siteverify → control lease → 단일 apply RPC.
- `lib/marketing-round2.ts`: 여섯 action의 공용 타입·파서·오류. `lib/marketing/round2-survey.ts`: 공식 두 주제 네 문항과 동의 문구. API에 새 필드를 추가하지 않았다.
- `lib/server/marketing-round2-context.ts`: pathname/topic, allowlisted UTM, page context/쿠키. `lib/marketing/round2-session.ts`: 화면 없는 IndexedDB bootstrap capability 관리.
- `createMarketingRound2InternalClient().execute(command)`만 SDK RPC를 노출한다. 임의 table/RPC를 받지 않는다. 신규 3테이블의 직접 권한은 service_role에도 없다.
- 단일 host의 owner-only rate/control 파일과 별도 lease를 사용한다. 결과 불명 apply의 lease는 같은 event commit 확인 또는 승인된 복구까지 남는다. 파일 변경과 DB가 하나의 transaction이라는 의미는 아니다.
- `/beta`, v2 public API·table·cookie·retention·선형 dashboard 로직은 변경하지 않았다. 기존 보안 inventory에는 새 r2 route/factory/RPC만 명시적으로 등록했다.

## 재현 명령과 증거

패키지 매니저는 `corepack pnpm` 10.32.1이다. ambient pnpm 11을 쓰지 않는다. 스크립트 안의 pnpm도 동일 버전이어야 한다.

| 명령 | 검증 범위 |
| --- | --- |
| `corepack pnpm test:marketing-round2` | 요청·서명·쿠키·공용 설문·rate/control·handler·provider·registry·IDB 순수 계약 |
| `corepack pnpm verify:marketing-round2:isolated` | 새 task 전용 PostgreSQL/PostgREST replay, 실제 SDK, 제약·원자성·동시성·삭제·권한·실제 timeout·privacy 및 HTTPS 통합 |
| `corepack pnpm verify:marketing-round2:browser-storage` | 실제 HTTPS localhost:3443 Chromium 두 탭의 IndexedDB 원자성·확인/복원·quota/50개 상한 |
| `corepack pnpm verify:security-functions:isolated` | 기존 전체 보안 함수 gate에 r2 함수 9개 포함, 기존 v2 migration fixture 및 Data API negative |
| `corepack pnpm verify:backend` | lint, typecheck, 전체 product tests, build, 기존 security E2E |

두 HTTPS runner는 3443 포트를 사용하므로 직렬 실행한다. 점유한 프로세스를 종료하거나 기존 listener를 재사용하지 않는다. HTTP 통합은 실제 TLS → backend handler → 실제 file storage/SDK/DB이며 Next 앱 전체 서버·Stage 4 화면 검증은 아니다. `tests/marketing-round2-http.integration.test.ts`는 일반 단위 실행에서 건너뛰며, 필수 isolated runner는 실제 통합 테스트의 통과 수·실패 0·건너뜀 0을 별도로 검사한다. DB는 mock으로 대체하지 않고 Turnstile provider만 가짜 fixture를 사용한다.

RED→GREEN와 최초 GREEN 추가 coverage는 구분한다. 요청/서명·storage·runtime·provider·HTTP 상태 처리의 실패 테스트를 먼저 실행했다. SQL 부재와 cookie_resume attribution·삭제 쿠키의 실제 DB 실패도 먼저 재현했다. 전체 HTTP/DB 연결 smoke는 처음 연결한 실행부터 GREEN이며 이를 별도 RED 증거로 부풀리지 않는다.

실행 원문과 JSON은 작성 task worktree의 `.omx/artifacts/r2-stage2/`에 보관한다. 주요 파일은 `protocol-evidence.md`, `storage-evidence.md`, `handler-apply-red.log`, `handler-review-{red,green}.log`, `provider-service-{red,green}.log`, `runtime-generation-{red,green}.txt`, `sql-export-final.log`, `http-integration.json`, `session-browser-green.txt`, `verify-backend.log`, `security-isolated-final.log`다. 최종 결과/정확한 head/CI는 PR `Actual Verification`과 Stage 2 result를 따른다. 실행하지 않은 검증을 PASS로 기록하지 않는다.

검증 날짜는 계약의 캠페인 기간 안이어야 한다. 기간이 지난 뒤 검증/활성화를 위해 계약 날짜를 임의 연장하지 않는다.

## Stage 4 인계

1. 실제 `/beta/r2/recording`, `/beta/r2/homeflow` 페이지를 만들고 서버 exact pathname으로 topic을 정한다. trailing slash는 canonical로 이동, 다른 경로/disabled는 404다. GET에서 DB를 읽지 않고 context를 발행하며 private/no-store와 no-referrer를 적용한다. 이 Stage 2는 제품 페이지를 만들지 않았다.
2. `prepareRound2Bootstrap`의 key 결과만 create_or_resume/resume에 사용한다. IndexedDB transaction이 완료되기 전 POST하지 않는다. 성공 응답 후 `confirmRound2Bootstrap`; 저장소 실패는 cookie_resume로만 복원한다. 새 참여의 메모리 fallback은 없다.
3. `buildRound2BootstrapRequest`는 context의 의미 attribution이 준비값과 같은지 검사한다. 갱신이 필요하면 `round2BootstrapContextUrl`로 같은 allowlisted 의미의 GET을 요청한다. 다른 URL의 의미는 새 event ID로 보내되 key는 유지한다.
4. 참여 만료 410 후 `markRound2ParticipationExpired`와 활동 draft/outbox 정리를 연결한다. 사용자 클릭에서만 `restartRound2Bootstrap`을 호출한다. API가 삭제한 topic cookie 외 다른 쿠키를 건드리지 않는다.
5. 화면별 loading/empty/error/read-only/unauthorized, 완료 revision 단조 적용, 전체 활동 POST 직렬 큐, 모든 화면의 preview 비저장 표시는 Stage 4 책임이다. bootstrap pending과 활동 outbox의 **합계 50개**를 지킨다. 이메일/동의/token은 탭 메모리만 사용하고 자동 배경 재전송하지 않는다.
6. `ROUND2_SURVEYS`와 `ROUND2_LEAD_COPY`를 사용하고 현재 privacy 문서 링크를 연결한다. 예시 완료는 명시 버튼, lead 완료는 서버 영수증 수신 뒤에만 표시한다. 실제 발송/이메일 소유 확인이라고 표현하지 않는다.

## 비활성 배포·운영 인수 조건

운영 변경 수행은 **0**이다. 아래는 권한자가 별도 승인된 경로에서 수행할 인수 조건이며 이 문서를 읽었다는 사실이 운영 실행 승인은 아니다.

기본 `MUMEOK_ROUND2_ENABLED=false`, `MUMEOK_ROUND2_LEADS_ENABLED=false`를 유지한다. 기존 v2 flag를 공유하지 않는다. 전용 7개 HMAC key는 독립 CSPRNG 32bytes 이상을 canonical hex/base64url로 공급하고 실제 값은 문서·브라우저·로그에 넣지 않는다. runtime은 약한 key·동일 key·기존 마케팅 key 재사용을 거부한다. 실제 Siteverify는 [공식 endpoint](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)에서 hostname/action/age와 event idempotency를 검증한다. 실제 provider·개인정보/동의 공개·운영자 승인 evidence는 별도 Manual Only다.

production private readiness 파일은 실행 release SHA, 현재 consent_generation, origin/hostname, key fingerprint, 검증 파일 경로와 실제 SHA256에 묶인다. `MUMEOK_ROUND2_RELEASE_SHA`와 저장소 HEAD가 일치해야 한다. readiness schema의 정확한 필드는 `marketing-round2-runtime.ts`와 테스트 fixture를 따른다. proxy의 loopback binding·직접 접근 차단·CF header 덮어쓰기 검증 파일이 모두 있어야 단일 `cf-connecting-ip`를 신뢰한다. 임의 X-Forwarded-For fallback은 없다. 실제 이 경계 검증 전에는 503이다. lead는 추가로 실제 Turnstile, DB migration/권한, privacy/동의, 보관 runbook, 운영자 승인 파일이 필요하다. 단일 Boolean이나 임의 해시 문자열로 이를 대체하지 않는다.

isolated profile은 `NODE_ENV=test`, exact `https://localhost:3443`, 별도 loopback DB와 task 전용 `r2-*` 파일 namespace/identity를 요구한다. production readiness와 섞지 않는다. 테스트는 운영 project `homecook-full-local-isolated`나 volume `homecook-full-local-postgres`를 선택하지 않는다.

### 파일 초기화·장애 복구

collector를 중지한 승인 runbook에서만 저장소 밖 0700 local directory, 0600 regular file로 초기화한다. 초기 state는 `{"version":1,"counters":{}}`, control은 `{"version":1,"collection_enabled":false,"lead_enabled":false,"consent_generation":1}`이다. 심볼릭 링크·다른 owner·네트워크 FS는 허용하지 않는다. collector는 파일 부재를 초기화로 처리하지 않는다.

모든 control writer는 같은 `CONTROL_PATH + '.lock'` lease를 취득해 `writeControl`로 atomic replace한다. generation 감소를 금지한다. crash/orphan은 시간만 보고 탈취하지 않는다. dispatch 중지·모든 collector drain·r2 DB transaction 0이 확인되고 불명 결과가 해소된 경우에만 해당 owner lease의 승인 복구를 수행한다. 확인 불가하면 수집을 닫아 둔다. rate state 분실 복구는 collector 중지와 최소 1시간 수집 중지 뒤에만 한다.

rate counter는 요청 시 만료분을 제거한다. 무요청·collector 중단 중에도 raw IP 대신 저장한 가명 counter가 24시간 넘게 남지 않도록 별도 운영 정리 책임과 실행 evidence를 인수해야 한다. 라이브 counter를 임의 삭제해 제한을 우회하지 않는다.

### 철회·보관 종료

검증된 본인 철회는 기존 privacy 절차로 접수한다. 같은 control lease에서 lead_enabled=false → 모든 collector 신규 lead 거부와 drain(최대 30초, 확인 불가 시 닫힘 유지) → DB transaction 0 → 같은 lease에서 generation 증가와 새 승인 자료 → `hashtextextended('marketing-round2-email:' || hex_email_key,0)` 동일 advisory lock을 얻는 삭제 transaction → 모든 주제의 matching lead에 연결된 parent를 삭제해 event/lead cascade → 잔여 matching row 0/commit 확인 → 승인 gate 복원 순서다. 원문·digest·해당 export도 함께 삭제한다. 일부 대표 lead만 지우고 repeat digest를 남기지 않는다. legacy 삭제는 별도 기존 권한 경계다.

수집 종료에는 새 읽기/쓰기를 차단한다. 보관 종료 `2026-11-30T15:00:00Z` 이후에는 승인 purge로 24시간 안에 parent와 자식·export를 제거한다. 자동 DB reset/restore/DROP은 하지 않는다. 보관된 legacy와 r2 union은 같은 시점의 snapshot으로만 집계하고 `new_observed`를 역사상 최초 사람 수라고 부르지 않는다. legacy 동시 writer·삭제 뒤 재유입의 한계를 유지한다.

배포 인수물에는 exact candidate SHA, 새 SQL SHA256, pinned isolated replay/직전 v2 호환·권한 negative evidence, 실제 full-local target identity·immutable backup freshness, disabled 설정, 책임자·중단 절차가 필요하다. 문제 시 수집 flag off와 호환 앱 복원으로 대응하며 수집 데이터를 자동 삭제하지 않는다.

## 확정한 격리 DB 검증

- CLI `2.110.0`, 생성 project `hcg_66841_a01099`, 실제 SQL 검증 344개·HTTPS 6개 통과, 실패/건너뜀 0. 생성 자원 정리 완료.
- 새 SQL SHA256 `1a783932ef81041414828e336b1f8c9a75666db44180583add72a4f326324ff8`. 전체 migration bundle SHA256 `6e04722b44718c0f3e62579dd5617370b68a4a813d3164c816952079b009d3c8`.
- 모든 6순서와 각 단독 활동은 두 주제 각각 실행했다. 파일 export 수명은 승인 runbook 절차의 fixture 검증이며 운영 exporter/자동 purge를 구현·실행했다는 뜻이 아니다.
- 보관 종료일의 실제 달력상 운영 실행, 실제 provider·모바일 화면·운영 승인·배포는 별도 인수 범위다.
