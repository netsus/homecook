# R2 Stage4 클라이언트 보조 구현 인계

공유 브랜치: `feature/fe-marketing-demand-validation-round2`. 시작 HEAD `7312a0cc9cfe1f500d896eb806e4d533a4f068b9`. 이 보조 작업은 커밋/푸시/Stage 승인/운영 변경을 실행하지 않았다.

## 소유 파일

- `lib/marketing/round2-client.ts`: React에 의존하지 않는 상태·POST 직렬화·복원 controller.
- `lib/marketing/round2-client-storage.ts`: 비PII draft/outbox IndexedDB 경계.
- `lib/marketing/round2-session.ts`: 기존 v1/bootstrap store 유지. 같은 readwrite transaction에서 bootstrap pending + activity outbox 합계 50 검사, 만료 marker 저장 시 activity 데이터도 제거.
- `tests/marketing-round2-client.test.ts`, `tests/marketing-round2-client-storage.test.ts`.

## UI 인터페이스

`createRound2Client(options)`와 `Round2Client`, `Round2ClientOptions`, `Round2ClientState`, `Round2SurveyDraft` 타입을 export한다. options는 topic/pageContext/attribution/preview/leadReady, 테스트용 선택 입력만 받는다. public API 필드·상태·endpoint를 추가하지 않았다.

상태: snapshot(null은 미확인), connection(idle/connecting/ready/error/restart_required/campaign_ended), busy, error(code/message/fields/retryAt), draft, leadForm(email/consent), tokenReady, challengeEpoch, storageBlocked, preview. UI가 getState/subscribe를 사용하며 현재 완료 화면은 해당 Promise 성공 및 snapshot 완료 상태로 연결한다.

메서드: connect, openActivity, returnToMenu, completeExample, saveSurveyDraft, submitSurvey, setLeadForm(partial), setTurnstileToken(string|null), submitLead, retry, restart, dispose. 비동기 액션은 boolean 결과다. 화면 열기/메뉴 복귀는 UI에서 즉시 수행하고 관측 요청 완료를 기다려 화면을 막지 않는다. visibilitychange에서 visible이면 connect를 호출한다. connect는 lead를 자동 재전송하지 않는다.

## 보장과 구현 선택

- 동일 topic의 모든 POST는 탭 안 큐와 지원 브라우저 Web Locks로 직렬화한다. 15초 네트워크 제한 후 결과 불명 안내와 같은 event 재시도를 제공한다.
- 더 낮은 revision 및 과거 consent generation이 새 상태를 덮지 못한다. 다른 참여 ID 응답은 거부한다. 완료 요청은 해당 activity=completed와 lead receipt 확인 후에만 성공한다.
- bootstrap 장애 중 열었던 세 활동은 개인 정보 없는 로컬 의도로 기억하고, 연결 복구 뒤 start부터 확인한다. bootstrap 전에 고른 답변은 연결 성공 후 IndexedDB에 저장한다.
- IndexedDB bootstrap 확인/읽기/활동 쓰기 장애 시 기존 cookie_resume을 먼저 성공시켜야 메모리 활동을 진행한다. 기존 쿠키 없는 신규 참여의 메모리 fallback을 만들지 않았다.
- 이메일/동의/토큰은 메모리 전용이다. 토큰은 제출 호출 즉시 UI에서 소모되고, 재시도 payload에는 새 토큰 또는 명시적 영수증 재조회만 사용한다. 저장소 parser는 bootstrap/lead/추가 PII 필드를 거부한다.
- 동의 generation 변경은 체크/토큰/이전 lead attempt를 무효화한다. 409 stale generation 재시도는 새 bootstrap만 수행한 뒤 새 명시 동의를 요구한다. 다른 탭에서 먼저 완료한 설문 409는 bootstrap 완료 상태로 복원한다.
- 참여 410은 key/draft/outbox/로컬 완료를 지우고 명시 restart만 허용한다. campaign 종료는 restart와 분리한다.
- IDB에는 주제별 자료와 UUID별 draft를 보관한다. sessionStorage에는 `mumeok-r2:tab-id` UUID 하나만 저장한다. 복제 탭의 sessionStorage 복사 때문에 기존 draft를 덮지 않도록 Web Locks 소유권을 사용하고 dispose 때 해제한다.
- preview는 실제 브라우저 hostname의 exact loopback 확인, memory-only, preview@example.com 고정, storage/fetch/provider 호출 0이다. 실화면의 비저장 표시와 provider 표시/리셋 연결은 root UI 소유다.

## 검증

최종 실행: `R2_CLIENT_BROWSER=1 corepack pnpm exec vitest run tests/marketing-round2-client.test.ts tests/marketing-round2-client-storage.test.ts tests/marketing-round2-session.test.ts` → 3개 파일, **53 테스트 PASS, skip 0**. 원문 `final-green.log`.

`legacy-browser-storage.log`: 기존 `verify:marketing-round2:browser-storage` 실제 HTTPS 3443 Chromium 회귀 exit 0. 해당 서버 종료 후 r2_real_ui_smoke에 포트를 반환했다. public POST/external request/production access/server DB access 모두 0.

실제 Chromium 새 browser lane은 임의 loopback 포트에서 IDB를 사용한다. 두 탭의 bootstrap pending 1 + activity 49 상한, 51번째 거부, reload draft, 만료 삭제, bootstrap 확인 quota 실패 후 cookie_resume, 복제 탭 draft 분리, bootstrap 전에 선택한 답변 보존을 확인한다. DB/API/provider를 실제 운영 환경으로 검증한 것은 아니다.

단위 lane은 두 topic 각각 3개 단독 및 6개 순서, POST 순서, 낮은 revision/다른 참여 ID, 401/409/410/429, 불명 결과와 명시 retry, generation, preview 부작용 0, 완료 snapshot, bounded timeout을 확인한다.

RED→GREEN 원문: `cap-browser-{red,green}.log`, `recovery-{red,green}.log`, `completion-{red,green}.log`, `uncertain-copy-{red,green}.log`, `quota-resume-{red,green}.log`, `cloned-tab-{red,green}.log`, `deferred-start-{red,green}.log`, `early-draft-red.log` + `final-green.log`.

초기 `red.log`는 구현 모듈 부재, `red-behavior.log`는 scaffold 상태의 16 실패/1 통과이며 일부 미구현 메서드 TypeError를 포함한다. 이를 전부 정상 assertion RED로 부풀리지 않는다. 별도 추가한 두 topic 18개 순서/단독 시나리오는 첫 실행부터 GREEN인 coverage다.

최종 owned eslint 및 전체 tsc 결과는 `lint.log`, `typecheck.log`를 따른다. root가 다른 파일을 계속 구현 중이므로 이후 exact-head 전체 gate와 독립 Stage 검토는 root 소유다.

## 한계

실기기/실제 provider/실메일/운영 activation/DB 변경은 수행하지 않았다. Web Locks를 제공하지 않는 브라우저에서는 탭 안 직렬화와 IDB 원자성은 유지하지만 탭 사이 POST 직렬화 및 복제 탭 UUID 소유권 보장은 동일하지 않다. 모바일 실제 UI 및 전체 DB 통합은 root와 별도 smoke 작업의 증거를 함께 검토해야 한다.

## 독립 보조 검토 P2 수정: 지연된 만료 응답의 새 참여 삭제 방지

`expire()`에서 기존 matching-key 만료 transaction 이후 호출하던 무조건 activity 삭제를 제거했다. 기존 helper가 같은 transaction에서 key 소유권 확인과 activity 삭제를 이미 수행하며, 다른 탭의 새 key가 있으면 false로 종료한다. 별도 삭제는 이 보호를 우회하므로 중복 호출을 없앴다. 현재 탭의 만료 안내·메모리 정리는 그대로 유지한다.

실제 Chromium 두 탭에서 A의 menu_return 응답을 보류 → B가 A의 key를 만료시키고 명시 restart → B의 새 참여 draft/outbox 저장 → A에 지연된 410 전달 순서로 재현했다. 수정 전 새 record가 null이 되어 실패(`stale-expiry-red.log`), 수정 후 새 key/draft/outbox가 전부 동일하게 보존된다(`stale-expiry-green.log`). 코드 수정은 controller 1개와 소유 browser 테스트 1개뿐이다. 관련 lint/typecheck는 `stale-expiry-lint.log`, `stale-expiry-typecheck.log`를 따른다.

## 추가 P2 수정: 이전 탭의 쓰기·공유 쿠키 사용 경계

기존 activity record의 participation_id가 요청자의 id와 다르면 새 record로 교체하지 않고 기존 `BOOTSTRAP_CONFLICT`로 transaction을 중단한다. 정상 명시 재시작은 이전 matching-key 만료 transaction이 record를 제거하므로 null에서만 새 record를 생성한다.

record가 아직 없는 새 참여 구간도 보호한다. controller가 확보한 bootstrap_key를 activity 쓰기의 같은 IndexedDB transaction에서 비교하며, lead를 포함한 실제 POST 직전에도 현재 key를 확인한다. key가 바뀌었으면 이전 입력을 새 공유 쿠키에 붙여 보내지 않는다. 재연결도 기존 snapshot/key를 다른 key로 자동 교체하지 않는다.

저장소 차단 탭은 key 변경을 읽을 수 없으므로 mutation 직전 `cookie_resume`으로 현재 참여를 확인한다. 다른 pid면 이전 payload를 전송하지 않는다. 이 추가 HTTP 왕복은 저장소 차단 경로에 한정하며 정상 IndexedDB 경로는 로컬 검사만 추가한다. guard는 bootstrap에는 실행하지 않아 POST 재귀를 만들지 않는다. 쿠키 확인 중 generation이 바뀌면 이전 lead payload도 전송하지 않고 새 동의를 요구한다.

실제 두 탭 회귀는 B의 새 key/draft/outbox가 있는 상태에서 A의 이전 pid draft/enqueue를 시도해 둘 다 거부·보존됨을 확인한다. 이어 B가 다시 key만 교체하고 record=null인 구간에서 A의 이전 lead와 draft를 시도해 실제 POST 0, record=null 보존을 확인한다. 단위 회귀는 저장소 차단 상태의 공유 쿠키 pid 변경 및 dispatch 직전 generation 변경을 확인한다.

증거: `stale-writes-red.log`, `changed-key-red.log`, `stale-writes-final-green.log`(**3개 파일 55 PASS, skip 0**), `dispatch-generation-{red,green}.log`, `stale-writes-lint.log`, `stale-writes-typecheck.log`. 저장소 차단 경로의 의도된 cookie_resume 왕복 증가에 맞춰 기존 요청 순서 기대값을 갱신했으며 정상 경로 요청 수는 늘리지 않았다.

run6 실제 UI smoke 담당자에게 최종 제품 소스 3개 해시를 전달했다:

- round2-client.ts: `e6555b6657b2435d31d6ac92765b938b948cc06c9d3041770f56ec4011125362`
- round2-client-storage.ts: `39476ebc6a575f507aaff05d84e85f5d055864b667e7d83cb1f4b441f97c6bcc`
- round2-session.ts: `b0dc08faae1c78d586881a2db2c8820c93994084db014c251ec38a8dc4092c2e`
