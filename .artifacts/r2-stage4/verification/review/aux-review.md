# R2 Stage 4 보조 코드 검토

작성: native read-only helper `/root/r2_review` · 2026-09-11
최신 판정(아래 재검토 반영): **기존 P2 3건 수정 확인, 이 보조 검토 범위의 미해결 발견 0건**. 최초 검토에서는 수정 필요 3건(P2)을 보고했다. 구현자 보조 검토이며 독립 Stage 5/디자인 authority/Stage 6 승인 또는 merge-ready 판정이 아니다.

## 검토 기준과 범위

- `.agents/skills/code-review-and-quality/SKILL.md`, 제공된 AGENTS.md, CSoT의 r2 위임 기준, `docs/marketing-demand-validation-r2-contract.md` §2~6, 해당 workpack acceptance.
- 아래 해시 목록의 프론트 client/storage/session, 화면/위젯, SSR page/path/header/provider 경계를 검토했다. 구현 중인 dirty worktree다. 기준 HEAD는 `7312a0cc9cfe1f500d896eb806e4d533a4f068b9`이고 HEAD 자체가 검토한 프론트 변경을 담고 있지는 않다.
- 코드 수정·commit·운영 탐색·DB 작업은 하지 않았다. 동시 수정 이후의 수정 완료 여부는 이 보고서가 보증하지 않는다.

## 수정 필요

### R2FE-AUX-001 · P2 · 늦은 제출 응답이 사용자의 이후 화면 이동을 덮어씀

위치: `components/marketing/round2/round2-view.tsx:195` (`finishExample`), `:199` (`retry`), `:205` (`surveyNext`), `:218` (`leadSubmit`).

예시 마지막 장면에서 완료를 누르고 응답 대기 중 헤더의 `메뉴로` 또는 알림 버튼을 누른다. 현재 이동 버튼은 사용 가능하다. 요청이 성공하면 이전 handler가 현재 화면을 확인하지 않고 `setScreen("example_done")`를 실행하여 사용자를 뒤로 돌린다. 설문·신청·오류 재시도도 같은 형태다. 계약의 원 활동 오류 표시와 자유 이동/자동 복귀 없음에 어긋난다.

권장 수정: navigate·popstate·화면 교체에 대해 이동 세대를 기록하고, await 전후 세대/활동이 일치할 때만 화면을 바꾼다. 완료 snapshot은 정상 수용하여 메뉴 배지는 보존한다. 지연 Promise를 두고 제출 → 메뉴/다른 활동 이동 → 성공 응답 순서를 회귀로 고정한다.

추가 관측: retry는 성공한 요청이 단순 bootstrap/start인지 완료인지 구분하지 않고 `_done` screen을 지정한다. 현재 isDone이 서버 completed를 확인하므로 거짓 성공 문구는 막지만 data-screen-id와 실제 내용이 달라진다. 완료 확인 여부를 포함한 동일 수정에서 정리하는 것이 적절하다.

### R2FE-AUX-002 · P2 · stale 만료 정리가 새 참여의 draft/outbox를 무조건 삭제함

위치: `lib/marketing/round2-client.ts:125` ~ `:128`; 연관 방어 `lib/marketing/round2-session.ts:165`의 `markRound2ParticipationExpired`.

다른 탭에서 명시적 재시작으로 bootstrap key와 활동 저장소를 교체한 뒤 오래된 key를 가진 client가 만료 정리를 하면, shared helper는 key 불일치에서 false를 반환하여 새 참여를 보호한다. 그러나 FE expire는 결과를 무시하고 곧바로 `clearRound2ClientRecord(topic)`를 호출한다. 이 함수에는 참여/key 조건이 없어 새 참여의 미제출 설문과 대기 이벤트가 삭제된다. 또한 두 별도 transaction 사이에서도 다른 탭의 재시작이 끼어들 수 있다.

권장 수정: key/participation 일치를 검사하는 같은 IDB transaction 안에서만 해당 활동 레코드를 삭제한다. 현재 session helper의 restart marker write는 같은 transaction에서 activity도 삭제하므로 중복된 무조건 clear 경로를 없애는 방안을 검토한다. 오래된 key의 정리와 새로운 key의 draft/outbox 보존을 실제 IDB 두 탭 회귀로 확인한다. 이 보고서에서는 해당 경합을 런타임 재현하지 않았으며 제어 흐름의 정적 결함으로 보고한다.

### R2FE-AUX-003 · P2 · Turnstile script 실패 뒤 명시 재시도 UI가 없음

위치: `components/marketing/round2/round2-turnstile.tsx:21`, `:31`, `:90`; `components/marketing/round2/round2-view.tsx:304` ~ `:310`.

일시 네트워크 오류로 보안 확인 script가 error를 발생시키면 loader는 캐시를 비워 재로드할 수 있도록 준비한다. 화면은 challengeError 문구만 표시하며 resetKey를 바꾸는 보안 확인 재시도 버튼이 없다. state.error는 설정되지 않으므로 공통 복구 버튼도 나타나지 않는다. 신청 버튼을 다시 눌러도 tokenReady 검사에서 종료한다. 사용자가 동의 해제/재체크 또는 폼을 나갔다 들어오라는 숨은 복구 동작을 알아야 한다.

권장 수정: 보안 확인 오류에 명시 재시도 버튼을 제공하고 토큰을 비운 상태로 widget/script를 재생성한다. 기존 widget 테스트는 resetKey를 테스트 코드가 직접 바꾼 경우만 검증하므로, 실제 버튼 클릭으로 script 재로드 후 토큰 복원이 되는 화면 테스트가 필요하다.

## 확인한 구현 경계

- SSR 초기 state snapshot=null과 메뉴 CTA를 유지한다. 연결 실패 중 예시/질문 열기를 전역 overlay로 막지 않는다.
- client 큐와 topic별 Web Locks가 POST를 직렬화하며 snapshot에서 낮은 revision의 완료 롤백을 막는다.
- lead form과 token은 client 메모리이고 persistent outbox는 parser로 bootstrap/lead/PII 필드를 거부한다. 제출 token은 즉시 state에서 제거한다.
- consent generation 상승/오류 시 동의·token·pending lead attempt를 초기화한다.
- preview client는 exact loopback에서만 활성화되고 메모리 fixture/preview@example.com을 사용한다. widget은 preview에 마운트되지 않는다.
- session/activity 동일 IDB transaction의 pending 합계 50 검사를 양방향 enqueue 코드에서 확인했다.
- routes는 exact topic과 server context를 결합하고 R2 전용 no-store/no-referrer header 설정 및 encoded alias guard가 있다. 실제 production 응답 header는 이 보조 검토에서 재측정하지 않았다.

## 실행한 검증과 한계

`corepack pnpm exec vitest run tests/marketing-round2-client.test.ts tests/marketing-round2-client-storage.test.ts tests/marketing-round2-view.test.tsx tests/marketing-round2-landing.test.tsx tests/marketing-round2-page.test.ts tests/marketing-round2-page-route.test.tsx tests/marketing-round2-path-guard.test.ts tests/marketing-round2-widget.test.tsx tests/marketing-round2-provider-boundary.test.tsx`

결과: **9 files passed, 102 tests passed, 1 skipped (103 total)**, 2.51초. 실제 IDB opt-in 시험은 `R2_CLIENT_BROWSER=1` 없이 실행하여 skip되었으므로 실제 두 탭 검증으로 계산하지 않는다. 위 3개 발견은 기존 suite가 포착하지 않는 경로이며 각 수정에 추가 회귀가 필요하다.

이 보조 검토는 전체 lint/typecheck/build/verify:frontend, 실제 DB UI 통합, 실제 provider/실기기, 시각 authority, 운영 activation을 실행하거나 승인하지 않았다. 다른 담당의 증거를 별도로 합쳐야 한다.

## 보고서 작성 시 파일 SHA-256

- `components/marketing/round2/round2-landing.tsx`: `0966cd96a7438124b0e1d631a25f71eddec55b975b0d9548f60e011af89d2ca8`
- `components/marketing/round2/round2-view.tsx`: `3f978656a4f830eb2d4bd031194303c26e9a4e983363742483c48667788b762c`
- `components/marketing/round2/round2-turnstile.tsx`: `08c30af9f5d5ae74f825c604bd054223ea5c2d849a3b68e161f7f341cd5d566b`
- `components/marketing/round2/round2.module.css`: `61e93e03d2fe4ac7b29ed9ad54ae5a13ce47f4bd02aa456ab721a84a04793086`
- `lib/marketing/round2-client.ts`: `582de75e05e548abbb39dc3813b099845f8aec5baa18e641da013bf395e8d714`
- `lib/marketing/round2-client-storage.ts`: `489ee46dbf3207c1d94614e6d196944167c2a50c898063eb75c3a5d56745242f`
- `lib/marketing/round2-session.ts`: `3b292c750436846436ebf063a9bc8e2e5ca68ee173e5685d1a9dd841d0e685f4`
- `lib/server/marketing-round2-page.ts`: `c0c5e11f93efb99df44c2226f5f10f539b9bbda7907127c1a2a4207aa6ad6c41`
- `app/beta/r2/[topic]/page.tsx`: `fbd1e7dd7fcbdeab5b272fe2e8b56dc73c0478b4cd19ff89c06017cbd9e17424`
- `middleware.ts`: `ab4409afe19e9eb1259cc18db00afe7c904f5a8c5aff58b79eb57ce8b41beb0d`
- `next.config.ts`: `bce9c140832112e84de0fa3c09db8ee2a32223e061a1468fe4bcf0f6f5bb9f50`
- `components/auth/provider-memory-sync.tsx`: `7ca17539c49586944c82df52c1f16edaee596e571552c4d1737e083c259a02ee`


## 후속 보조 재검토 · 2026-09-11 11:15 실행

구현자와 별도 native helper가 수정 코드와 최초 RED→GREEN 로그를 다시 읽고 범위 내 테스트를 직접 실행했다. **R2FE-AUX-001/002/003 모두 수정 확인**. 이것은 이전 세 발견의 기술적 해결 확인이며 독립 Stage 5/authority/Stage 6 승인 또는 전체 제품 무결함 판정이 아니다. 진행 중인 real-UI runner는 이번 재검토 범위에서 제외했다.

| 발견 | 재검토 결과 | 직접 확인한 근거 |
| --- | --- | --- |
| R2FE-AUX-001 | 해결 확인 | `round2-view.tsx`의 navigate/popstate에서 navigationGeneration 증가, 완료·설문·신청·재시도 handler의 await 전후 동일 generation 검사. retry는 getState의 실제 completed 상태도 검사한다. 지연 완료 후 메뉴 보존 회귀가 실행되어 통과했다. |
| R2FE-AUX-002 | 해결 확인 | client expire의 무조건 clearRound2ClientRecord 호출이 삭제되고 matching-key session transaction 하나가 활동 삭제까지 소유한다. 실제 Chromium 두 탭에서 새 key/draft/outbox가 stale 410 후에도 동일하게 보존되는 회귀를 직접 재실행했다. |
| R2FE-AUX-003 | 해결 확인 | challengeError의 `보안 확인 다시 시도` 버튼이 token을 비우고 local reset 세대를 올린다. 화면 버튼으로 실패 script를 재생성하는 회귀와 widget reset/토큰 처리 회귀를 실행하여 통과했다. 실제 Cloudflare provider 성공을 검증한 것은 아니다. |

최초 실패와 수정 통과 로그를 각각 읽었다:

- `.omx/artifacts/r2-stage4/ui/navigation-race-red.log`, `navigation-race-green.log`
- `.omx/artifacts/r2-stage4/ui/challenge-retry-red.log`, `challenge-retry-green.log`
- `.omx/artifacts/r2-stage4/client/stale-expiry-red.log`, `stale-expiry-green.log`

직접 재실행:

`R2_CLIENT_BROWSER=1 corepack pnpm exec vitest run tests/marketing-round2-client.test.ts tests/marketing-round2-client-storage.test.ts tests/marketing-round2-view.test.tsx tests/marketing-round2-landing.test.tsx tests/marketing-round2-widget.test.tsx`

결과: **5 files passed, 60 tests passed, skip 0**, 7.19초. 원문 `.omx/artifacts/r2-stage4/review/aux-recheck.log`. 실제 브라우저는 새 임의 loopback 포트에서 IDB 시험만 수행했으며 DB/API/provider는 fixture다. 운영/기존 3443 프로세스를 건드리지 않았다.

추가 짧은 검토:

- SSR 메뉴는 initial snapshot=null을 useSyncExternalStore의 server snapshot으로 제공하고 client.connect는 effect에서만 호출한다. 이 범위에서 SSR 메뉴를 막는 추가 결함은 발견하지 못했다.
- StrictMode의 effect setup→cleanup→setup에서 lifecycle generation이 바뀌어 첫 cleanup의 microtask dispose를 건너뛰고, 실제 unmount에서만 dispose하는 구조를 정적으로 확인했다. 이 재검토에 별도 StrictMode runtime 시험을 추가하지는 않았다.
- popstate listener 정리, 화면 복원, navigation generation 증가 및 landing의 bootstrap 재연결 listener를 확인했다. 기존 Back 테스트는 합성 PopStateEvent이며 실제 브라우저 전체 history traversal 검증을 대체하지 않는다. 이 짧은 추가 검토에서 수정 요구는 더 발견하지 못했다.

재검토 시 파일 및 증거 SHA-256(최초 해시와 구별):

- `components/marketing/round2/round2-view.tsx`: `bfcc863c15f5737972c993a00ccef40c116a52b805bc285d003381baae753775`
- `components/marketing/round2/round2-landing.tsx`: `0966cd96a7438124b0e1d631a25f71eddec55b975b0d9548f60e011af89d2ca8`
- `components/marketing/round2/round2-turnstile.tsx`: `08c30af9f5d5ae74f825c604bd054223ea5c2d849a3b68e161f7f341cd5d566b`
- `lib/marketing/round2-client.ts`: `65f894000993c9a2e0b6c2b4f01aa8c74193161ae2741016c8a927719ca804f4`
- `lib/marketing/round2-session.ts`: `3b292c750436846436ebf063a9bc8e2e5ca68ee173e5685d1a9dd841d0e685f4`
- `tests/marketing-round2-view.test.tsx`: `52fc99ceda5e85a4b603920a19e34759d0c877480390e8d95d172c5c54da35b0`
- `tests/marketing-round2-client-storage.test.ts`: `4416379440a5c16c36b497bc4921f385626d4fd4882a2830e43c327b13fee502`
- `.omx/artifacts/r2-stage4/review/aux-recheck.log`: `1ec8af28b07776d538ff74669255404e68b4a2bd5a1fd51cd37e7f8c677ee2c9`


## 최종 증분 보조 재검토 · 저장소 소유권 및 일반 앱 복귀

대상은 조정자/구현자가 추가한 기존 파일 안의 소유권 보강, ProviderMemorySync 경로 의존성 및 Round2Landing lifecycle 저장 방식이다. real-UI runner, Docker/DB/실제 provider, 배포는 범위 밖이다. 코드 수정 없이 읽기와 테스트만 실행했다. **이 증분 범위에서 추가 수정 요구를 발견하지 못했다.** 기존 세 발견의 해결 확인은 유지한다. 독립 Stage 승인 또는 전체 PR 승인으로 해석하지 않는다.

### 소유권 확인

- `round2-client.ts`의 activityOptions가 client가 보유한 bootstrap key를 저장소 호출에 전달한다. `round2-client-storage.ts`는 같은 readwrite transaction 안에서 현재 bootstrap key/status/expiry를 확인하고, 다른 참여 ID의 레코드를 `BOOTSTRAP_CONFLICT`로 거부한다. 소유권 오류를 quota/저장소 장애로 오인해 memory fallback으로 진행하지 않고 상위로 전달한다.
- activity/lead 전송 전 shared key를 확인한다. 다른 key는 요청을 보내기 전에 거부한다. 실제 IndexedDB를 쓸 수 없는 분기만 cookie_resume으로 현재 참여를 재확인하며, accept의 다른 participation ID 거부로 이전 폼 payload 전송을 막는다.
- cookie_resume 중 generation이 바뀌면 동의/토큰을 해제하고, 이미 구성된 lead request도 현재 consent_generation과 다시 비교하여 dispatch 전에 거부한다. 새 공개 요청 필드를 추가하지 않는다.
- 실제 Chromium 두 탭의 old PID draft/enqueue 거부, 새 레코드 보존, 아직 활동 레코드가 없는 새 key에서도 stale client lead/draft 및 POST 0을 확인하는 시험을 직접 실행했다. 이는 실제 IDB+fixture 응답 시험이며 실제 서버 쿠키/DB 통합 결과는 아니다. Web Locks 미지원 브라우저의 모든 cross-tab 전송 경합까지 보장하는 증거로 확대하지 않는다.

읽은 RED/GREEN 증거: `client/stale-writes-red.log`, `client/changed-key-red.log`, `client/dispatch-generation-red.log`, `client/stale-writes-final-green.log`, `client/dispatch-generation-green.log` (모두 `.omx/artifacts/r2-stage4/` 아래). RED는 단순 모듈 부재가 아닌 stale write 허용, cookie-only 전송 발생, stale generation 전송의 assertion 실패다.

### ProviderMemorySync / lifecycle

- usePathname을 R2 여부 boolean으로 변환하고 effect dependency를 해당 boolean으로 제한했다. R2 → 일반 앱에서 동기화가 실행되고, 일반 앱 → 일반 앱 이동에서는 반복하지 않으며, R2 복귀 시 이전 비동기 callback의 mounted guard를 해제한다.
- 실제 provider/network 대신 mock getSession 호출 횟수로 이 경계를 확인했다. `ui/provider-navigation-red.log`에서 R2 이탈 후 0회 실패, `ui/provider-navigation-green.log`에서 관련 11개 테스트 통과 기록을 읽었다.
- Round2Landing의 stable useState object generation은 기존 ref와 같은 lifetime을 가진다. effect setup/cleanup의 generation 비교와 listener 제거 의미를 유지한다. StrictMode 전용 runtime 시험은 새로 추가하지 않았다.

직접 실행:

`R2_CLIENT_BROWSER=1 corepack pnpm exec vitest run tests/marketing-round2-client.test.ts tests/marketing-round2-client-storage.test.ts tests/marketing-round2-session.test.ts tests/marketing-round2-provider-boundary.test.tsx tests/marketing-round2-landing.test.tsx tests/marketing-round2-view.test.tsx`

결과:

Test Files  6 passed (6)
Tests  71 passed (71)
Duration  9.02s (transform 3.17s, setup 635ms, import 9.13s, tests 10.01s, environment 7.34s)

원문: `.omx/artifacts/r2-stage4/review/aux-ownership-provider-recheck.log`. 임의 loopback 포트의 격리된 브라우저 저장소 시험이며 기존 3443/운영 프로세스 조작은 없다.

최종 증분 재검토 파일 SHA-256:

- `lib/marketing/round2-client.ts`: `e6555b6657b2435d31d6ac92765b938b948cc06c9d3041770f56ec4011125362`
- `lib/marketing/round2-client-storage.ts`: `39476ebc6a575f507aaff05d84e85f5d055864b667e7d83cb1f4b441f97c6bcc`
- `lib/marketing/round2-session.ts`: `b0dc08faae1c78d586881a2db2c8820c93994084db014c251ec38a8dc4092c2e`
- `components/auth/provider-memory-sync.tsx`: `913753e51826b32b1c45b1e0dd7350a184a7f09c96df6a64fa06a24e4ff72c6b`
- `components/marketing/round2/round2-landing.tsx`: `914a743cbb123280051f4df07a8e96316a92f611cfe483ab5eb03df4ac6f8992`
- `components/marketing/round2/round2-view.tsx`: `bfcc863c15f5737972c993a00ccef40c116a52b805bc285d003381baae753775`
- `tests/marketing-round2-client.test.ts`: `181da35dcb5ca019de207e86349674ba72cb9e22400daf274e11755ec734ef38`
- `tests/marketing-round2-client-storage.test.ts`: `c6f05ef93885ad77496fa92451f30c98e1ad0729420acc9a7ea42af53b9cd065`
- `tests/marketing-round2-provider-boundary.test.tsx`: `93ffcf4dd41db144aa64d3d0c9001848a8cf7c2cb60f3e887d6757bb6cc59a62`
- `.omx/artifacts/r2-stage4/review/aux-ownership-provider-recheck.log`: `ef30faedb035b4d4fe021f1a65c3666ad2acf58879b24d1090c7d0ba9ada7163`
