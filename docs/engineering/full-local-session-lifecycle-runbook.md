# Full-local session lifecycle production canary runbook

이 문서는 session refresh hotfix의 `milestone-a-t65`, `milestone-a-24h`, `milestone-b-7d` 운영 확인 절차다. public API를 추가하지 않으며, production token·cookie·raw session ID·사용자 UUID·이메일은 결과, 파일, 표준 출력, 표준 오류에 남기지 않는다.

## 실행 전 조건

1. canary 대상 commit이 `origin/master`에 병합되고 배포되어야 한다.
2. `com.homecook.production` LaunchAgent의 working directory와 실행 script가 canary를 실행하는 exact implementation checkout을 가리켜야 한다. `baseline`만 기존 dirty live checkout을 허용한다.
3. operator는 production 로그인 및 최소 planner mutation 권한이 있는 전용 canary 계정을 준비한다. 실제 로그인·mutation 실행은 Manual Only다.
4. adapter 파일은 저장소 밖 canonical absolute path에 만들고 권한을 정확히 `0600`으로 둔다. 바로 위 parent directory도 canonical real directory이며 현재 실행 사용자 소유, 정확히 `0700`이어야 한다. 파일도 현재 사용자 소유여야 하며 symlink, 상대/alias path, 더 넓거나 더 좁은 권한은 거부된다.
5. incident baseline 날짜는 `2026-08-08`이다. 이후 `2026-08-09 KST` 재점검에서 운영 로그의 `ACCOUNT_SESSION_STALE` 누적값이 이미 `4`임을 확인했다. 따라서 canary의 `account_session_stale_count=0`은 전체 누적값이 아니라 **배포 시작 이후 delta 0**을 뜻한다. 배포 시각 직전 누적값은 별도 안전한 숫자로만 기록하고 원문 로그, ID, 경로는 evidence JSON에 복사하지 않는다.

## Adapter 경계

`FULL_LOCAL_SESSION_CANARY_ADAPTER`는 아래 method를 가진 `createProductionCanaryAdapter({ phase })`를 export한다. adapter 안에서만 cookie/token을 메모리에 보관하고 runner에는 opaque handle만 반환한다. adapter는 stdout/stderr/file log를 쓰지 않는다. runner는 adapter를 stdout/stderr가 폐기되는 격리 child process에서 실행하고 검증된 안전 JSON만 부모 process로 보낸다. child 환경은 `HOME`, `PATH`, `TMPDIR`, `NODE_ENV`, locale과 adapter path만 allowlist로 전달하며 `NODE_OPTIONS`, GitHub token, Supabase/app secret 등 부모의 ambient 환경은 전달하지 않는다.

| Method | 안전한 반환값 |
| --- | --- |
| `openSession()` | `{ session: <opaque>, bindingCreatedAt: <UTC ISO> }` |
| `readBindingExpiry(session)` | UTC ISO timestamp |
| `refreshSession(oldSession)` | 새 opaque session handle |
| `plannerRead(session)` | `PASS` |
| `plannerWrite(session)` | `{ status: "PASS", cleanupHandle: <opaque> }` |
| `plannerCleanup(session, handle)` | `PASS` |
| `pantryRead(session)` | `PASS` |
| `youtubeExtract(session, { url })` | exact `f0E0p1R26Vk` 성공 시 `PASS` |
| `logout(session)` | `PASS` |
| `plannerReadAfterLogout(session)` | old/new 각각 `BLOCKED` |
| `plannerWriteAfterLogout(session)` | old/new 각각 `BLOCKED` |
| `readObservationCounters()` | `{ counterScope: "SINCE_DEPLOY", observationStartedAt: <UTC ISO>, accountSessionStaleCount: 0, staleTokenMutationCount: 0, firstStaleAt: null }` |
| `close()` | session/browser 자원 정리 |

planner canary row는 `plannerCleanup` 성공 후에만 planner write를 PASS로 판정한다. logout 뒤 old/new session의 read/write가 모두 차단되어야 한다. refresh 뒤 binding expiry는 이전 값보다 커야 한다.

시간 경계도 runner가 직접 검증한다. session binding은 `observationStartedAt`과 같거나 그 뒤에 만들어져야 하므로 배포 전에 로그인한 오래된 session은 거부한다. `milestone-a-t65`는 `bindingCreatedAt` 이후 최소 65분, `milestone-a-24h`는 `observationStartedAt` 이후 최소 24시간, `milestone-b-7d`는 최소 7일이 지나지 않으면 즉시 실행해도 PASS할 수 없고 fail closed한다. adapter worker의 기본 제한 시간은 20분이며, 무응답이면 강제 종료하고 redaction된 실패만 반환한다.

## 실행

먼저 canonical deterministic refresh lifecycle raw gate를 실행한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle
```

evidence collector가 읽는 exact summary JSON은 별도 wrapper로 확인한다. wrapper는 위 canonical raw gate를 실행한 뒤 성공한 경우에만 마지막 한 줄 JSON을 출력한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle:json
```

운영 adapter 경로는 화면이나 shell history에 token을 넣지 않는 방식으로 설정한다. 값은 secret이 아니라 저장소 밖 `0600` adapter 파일의 경로다.

```sh
FULL_LOCAL_SESSION_CANARY_ADAPTER=/absolute/operator/path/session-canary-adapter.mjs \
  pnpm verify:full-local-session-production-canary -- --json --phase milestone-a-t65
```

동일 명령의 phase만 `milestone-a-24h`, `milestone-b-7d`로 바꿔 후속 관찰을 실행한다. 후속 phase의 현재 canary 성공은 T+65 성공을 대신하지 않는다. implementation root의 exact `milestone-a-t65.json`이 schema, phase, 같은 implementation SHA, `t65_canary=PASS`, 네 canary PASS를 모두 만족해야만 prior T+65 gate를 승계한다. 파일 누락, symlink/alias path, schema 오류는 fail closed한다. 성공 stdout은 compact JSON 한 줄뿐이다. 실패 stderr는 원인을 redaction한 고정 문구만 내고 non-zero로 종료한다.

`milestone-b-7d`는 Stage 5 session policy가 병합된 뒤에만 실행할 수 있다. Stage 5 전에는 `verify:full-local-gotrue-session-policy` package script가 의도적으로 없으므로 evidence collector가 `gotrue_policy_gate=FAIL`로 fail closed하는 것이 정상이다. 이 closeout에서 해당 미래 script를 임시 추가하거나 `milestone-b-7d` 완료를 주장하지 않는다.

## Evidence capture 연결

canary JSON은 `scripts/capture-full-local-session-lifecycle-evidence.mjs`가 exact key와 implementation SHA를 다시 검증한다. post-deploy phase는 LaunchAgent provenance가 현재 implementation checkout과 일치하지 않으면 evidence를 쓰기 전에 fail closed한다. 결과 JSON에는 checkout path나 LaunchAgent raw output을 추가하지 않는다.

```sh
node scripts/capture-full-local-session-lifecycle-evidence.mjs milestone-a-t65 \
  --live-root /Users/cwj/01_vibe_coding/homecook-full-local-restore \
  --output docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle/milestone-a-t65.json
```

실패 시 canary 확대를 중단하고 session hotfix 계획의 forward-fix 절차를 따른다. DB만 또는 env만 단독으로 되돌리지 않는다.
