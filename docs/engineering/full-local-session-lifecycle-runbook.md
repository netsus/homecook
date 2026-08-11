# Full-local session lifecycle production canary runbook

이 문서는 session refresh hotfix의 `milestone-a-t65`, `milestone-a-24h`, `milestone-b-7d` 운영 확인 절차다. public API를 추가하지 않으며, production token·cookie·raw session ID·사용자 UUID·이메일은 결과, 파일, 표준 출력, 표준 오류에 남기지 않는다.

## 실행 전 조건

1. canary 대상 commit이 `origin/master`에 병합되고 배포되어야 한다.
2. `com.homecook.production` LaunchAgent의 working directory와 실행 script가 canary를 실행하는 exact implementation checkout을 가리켜야 한다. `baseline`만 기존 dirty live checkout을 허용한다.
3. operator는 production 로그인 및 최소 planner mutation 권한이 있는 전용 canary 계정을 준비한다. 실제 로그인·mutation 실행은 Manual Only다.
4. adapter 파일은 저장소 밖 canonical absolute path에 만들고 권한을 정확히 `0600`으로 둔다. 바로 위 parent directory도 canonical real directory이며 현재 실행 사용자 소유, 정확히 `0700`이어야 한다. 파일도 현재 사용자 소유여야 하며 symlink, 상대/alias path, 더 넓거나 더 좁은 권한은 거부된다.
5. incident baseline 날짜는 `2026-08-08`이다. 이후 `2026-08-09 KST` 재점검에서 운영 로그의 `ACCOUNT_SESSION_STALE` 누적값이 이미 `4`임을 확인했다. 따라서 canary의 `account_session_stale_count=0`은 전체 누적값이 아니라 **새 observability migration이 적용된 시점 이후 unexpected stale 0**을 뜻한다. 새 migration은 PII 없는 singleton 관찰 구간을 시작하며 재적용 시 카운터를 0으로 초기화한다. 원문 로그, ID, 경로는 evidence JSON에 복사하지 않는다.

## Adapter 경계

`FULL_LOCAL_SESSION_CANARY_ADAPTER`는 아래 method를 가진 `createProductionCanaryAdapter({ phase })`를 export한다. adapter 안에서만 cookie/token을 메모리에 보관하고 runner에는 opaque handle만 반환한다. adapter는 stdout/stderr/file log를 쓰지 않는다. runner는 adapter를 stdout/stderr가 폐기되는 격리 child process에서 실행하고 검증된 안전 JSON만 부모 process로 보낸다. child 환경은 `HOME`, `PATH`, `TMPDIR`, `NODE_ENV`, locale과 adapter path만 allowlist로 전달하며 `NODE_OPTIONS`, GitHub token, Supabase/app secret 등 부모의 ambient 환경은 전달하지 않는다.

| Method | 안전한 반환값 |
| --- | --- |
| `openSession()` | `{ session: <opaque>, bindingCreatedAt: <UTC ISO> }` (`bindingCreatedAt`은 호환용 key이며 실제 의미는 브라우저에서 관찰한 fresh login 완료 시각) |
| `readBindingExpiry(session)` | UTC ISO timestamp (호환용 method 이름이며 실제 의미는 브라우저 auth session의 관찰된 만료 시각) |
| `refreshSession(oldSession)` | 새 opaque session handle |
| `plannerRead(session)` | `PASS` |
| `plannerWrite(session)` | 임시 끼니를 추가하고 `{ status: "PASS", cleanupHandle: <opaque> }` 반환 |
| `plannerCleanup(session, handle)` | 방금 추가한 임시 끼니 삭제 성공 시 `PASS` |
| `pantryRead(session)` | `PASS` |
| `youtubeExtract(session, { url })` | exact `f0E0p1R26Vk` 성공 시 `PASS` |
| `logout(session)` | `PASS` |
| `plannerReadAfterLogout(session)` | old/new 각각 `BLOCKED` |
| `plannerWriteAfterLogout(session)` | old/new 각각 `BLOCKED` |
| `close()` | session/browser 자원 정리 |

관찰 카운터는 adapter가 읽지 않는다. 권한이 분리된 부모 process가 exact `select public.read_full_local_session_observation()::text`만 `supabase_admin`으로 실행하고, `{ counterScope: "SINCE_DEPLOY", observationStartedAt, accountSessionStaleCount, staleTokenMutationCount, firstStaleAt }` 5개 안전 필드만 child에 IPC로 두 번 전달한다. Docker Compose project/service, 단일 healthy container, Docker binary canonical path가 하나라도 다르면 fail closed한다. `staleTokenMutationCount=0`은 차단 시도 0이 아니라 **stale 상태에서 실제 반영된 mutation 0**을 뜻한다.

planner canary 끼니는 `plannerCleanup`으로 삭제된 뒤에만 planner write를 PASS로 판정한다. logout 뒤 old/new session의 read/write가 모두 차단되어야 한다. refresh 뒤 관찰된 auth session 만료 시각은 이전 값보다 커야 하며, refresh 직후 보호된 planner 조회도 성공해야 한다. DB binding 갱신 자체는 이 브라우저 관찰값 하나로 주장하지 않고 deterministic PostgreSQL gate와 보호 route 성공을 함께 증거로 사용한다.

시간 경계도 runner가 직접 검증한다. fresh login 완료 관찰 시각은 `observationStartedAt`과 같거나 그 뒤여야 하므로 배포 전에 로그인한 오래된 session은 거부한다. `milestone-a-t65`는 같은 ephemeral browser session을 실제 65분 유지한다. 이 phase의 worker 기본 제한은 100분, hard max는 120분이다. `milestone-a-24h`는 `observationStartedAt` 이후 최소 24시간, `milestone-b-7d`는 최소 7일이 지나지 않으면 즉시 실행해도 PASS할 수 없고 fail closed하며 두 phase의 제한은 20분이다.

## 실행

먼저 canonical deterministic refresh lifecycle raw gate를 실행한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle
```

evidence collector가 읽는 exact summary JSON은 별도 wrapper로 확인한다. wrapper는 위 canonical raw gate를 실행한 뒤 성공한 경우에만 마지막 한 줄 JSON을 출력한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle:json
```

먼저 repo-owned adapter를 저장소 밖의 새 wrapper에 설치한다. parent directory와 파일이 이미 있거나 권한/소유권이 다르면 덮어쓰지 않고 실패한다.

```sh
pnpm install:full-local-session-production-browser-adapter -- \
  --output /absolute/operator-0700/session-canary-adapter.mjs
```

운영 adapter 경로는 화면이나 shell history에 token을 넣지 않는 방식으로 설정한다. 값은 secret이 아니라 저장소 밖 `0600` adapter 파일의 경로다. `milestone-a-t65` 실행 시 headed ephemeral browser가 열리면 operator가 앱 로그인 버튼을 눌러 OAuth를 직접 완료한다. 기존 Chrome cookie나 저장된 token을 복사하지 않는다.

```sh
FULL_LOCAL_SESSION_CANARY_ADAPTER=/absolute/operator/path/session-canary-adapter.mjs \
  pnpm verify:full-local-session-production-canary -- --json --phase milestone-a-t65
```

동일 명령의 phase만 `milestone-a-24h`, `milestone-b-7d`로 바꿔 후속 관찰을 실행한다. 후속 phase의 현재 canary 성공은 T+65 성공을 대신하지 않는다. implementation root의 exact `milestone-a-t65.json`이 schema, phase, 같은 implementation SHA, `t65_canary=PASS`, 네 canary PASS를 모두 만족해야만 prior T+65 gate를 승계한다. 파일 누락, symlink/alias path, schema 오류는 fail closed한다. 성공 stdout은 compact JSON 한 줄뿐이다. 실패 stderr는 원인을 redaction한 고정 문구만 내고 non-zero로 종료한다.

`milestone-b-7d`는 Stage 5 session policy가 병합된 뒤에만 실행할 수 있다. Stage 5 전에는 `verify:full-local-gotrue-session-policy` package script가 의도적으로 없으므로 evidence collector가 `gotrue_policy_gate=FAIL`로 fail closed하는 것이 정상이다. 이 closeout에서 해당 미래 script를 임시 추가하거나 `milestone-b-7d` 완료를 주장하지 않는다.

## Evidence capture 연결

canary JSON은 `scripts/capture-full-local-session-lifecycle-evidence.mjs`가 exact key와 implementation SHA를 다시 검증한다. post-deploy phase는 LaunchAgent provenance가 현재 implementation checkout과 일치하지 않으면 evidence를 쓰기 전에 fail closed한다. 결과 JSON에는 checkout path나 LaunchAgent raw output을 추가하지 않는다.

`security_function_gate`는 `pnpm verify:full-local-session-security-contracts`로 session 관련 authorization manifest의 정적 계약만 검증한다. 실제 session PostgreSQL/Docker 동작은 별도 `refresh_lifecycle_gate`, `postgres_integration`, `docker_refresh_smoke`가 담당한다. broad `verify:security-functions`는 Supabase CLI가 제공하는 외부 extension 함수 버전까지 비교하므로 이 evidence gate에 대신 사용하지 않는다.

```sh
node scripts/capture-full-local-session-lifecycle-evidence.mjs milestone-a-t65 \
  --live-root /absolute/exact-merged-deploy-worktree \
  --output docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/milestone-a-t65.json
```

실패 시 canary 확대를 중단하고 session hotfix 계획의 forward-fix 절차를 따른다. DB만 또는 env만 단독으로 되돌리지 않는다.

## 기능 canary 실패를 세션 장애와 구분하기

planner 또는 YouTube canary가 실패해도 같은 관찰 구간의 `ACCOUNT_SESSION_STALE` delta와 `staleTokenMutationCount`가 모두 `0`이면, 세션 수명주기 장애로 단정하지 않는다. 이 경우 token·cookie·사용자 식별자를 출력하지 않은 채 PostgreSQL의 오류 종류와 대상 relation만 확인해 기능별 RLS 또는 request transaction 권한을 먼저 진단한다.

- 읽기 RPC가 `POST`를 사용하더라도 PostgreSQL transaction이 read-only이면 verifier는 잠금 조회(`FOR SHARE`)를 실행하면 안 된다.
- YouTube 추출 worker는 `youtube-extraction` internal scope의 exact table/method allowlist 안에서만 cache, event, session, candidate를 기록한다.
- migration과 앱은 함께 forward-fix하고, 적용 뒤 exact migration head·LaunchAgent implementation SHA·기능 canary·stale delta 0을 다시 확인한다.
