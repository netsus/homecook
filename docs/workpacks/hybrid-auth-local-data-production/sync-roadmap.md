# docs/sync/CURRENT_SOURCE_OF_TRUTH.md

삽입/수정 문안

```md
## Official Files
- `docs/요구사항기준선-v1.7.26.md`
- `docs/화면정의서-v1.5.30.md`
- `docs/유저flow맵-v1.3.28.md`
- `docs/db설계-v1.3.27.md`
- `docs/api문서-v1.2.30.md`

## Hybrid Remote Auth / Local Data Production Contract-Evolution `2026-07-30`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.26 | remote Supabase Auth만 Google/Naver/Kakao OAuth/session authority로 유지하고 local self-hosted DB/Storage를 application data authority로 전환한다. PostgREST combined JWKS+`PGRST_JWT_AUD`+pre-request guard, Storage loopback claim-verifying gateway, session-liveness HMAC binding, private identity mirror 최소화, remote control-plane writable 예외, account-generation legacy 유지, no service-role user client, no env-only rollback을 잠근다 |
| 화면정의서 v1.5.30 | 신규 화면 없이 기존 LOGIN/callback/SETTINGS/MYPAGE/ACCOUNT_QUARANTINE 상태 연결을 유지하고 local Data/Storage 내부 정보와 secret 노출을 금지한다. maintenance 중 Homecook linking UI만 차단하고 remote freeze는 주장하지 않으며 browser direct Storage 0을 명시한다 |
| 유저 Flow맵 v1.3.28 | remote OAuth → callback → private mirror → local Data/Storage RLS, remote/local barrier attempt, callback drain/reconcile, restore order, first-write rollback floor 흐름을 추가한다 |
| DB v1.3.27 | private `remote_auth_identity_epochs` mirror를 PII 없는 epoch evidence로 제한하고 `auth.users` 직접 의존 replacement matrix, remote control-plane table/function 예외, local `auth.users=0`, semantic restore gate를 정의한다 |
| API v1.2.30 | 신규 public endpoint/field/status/error 없이 기존 102개 endpoint runtime authority만 remote Auth + local Data/Storage로 분리한다. exact claim guard, session-liveness binding, 기존 409/503 error mapping, user/public/admin/internal inventory, service role 0 static gate를 명시한다 |

> 사용자는 2026-07-30에 원격 Supabase는 Google/Naver/Kakao Auth만 유지하고, application DB와 Storage는 현재 Mac의 self-hosted Supabase로 이전하는 Stage -1 contract-evolution 작성을 승인했다. 독립 GPT 리뷰를 반영해 exact claim enforcement, session-liveness HMAC binding, 기존 public error mapping, remote control-plane barrier, `auth.users` replacement matrix, service-role 0 gate, semantic restore, off-Mac backup/rollback evidence를 계약에 추가했다. 이 계약은 기존 RLS/소유권/account-generation 세대 보호를 약화하지 않는다. local DB/Storage는 loopback-only이며 remote Auth만 인터넷 연결을 유지한다. 첫 local user write 뒤 단순 env rollback은 금지된다. implementation, DB write, provider 설정 변경은 후속 workpack gate 전 금지다.
```

# docs/workpacks/README.md

삽입 위치 1: Revision Notes 최상단

```md
- `v2` hybrid remote Auth / local Data production contract-evolution (2026-07-30 KST, UTC+09:00)
  - 사용자는 Claude 없이 별도 Codex Stage -1 문서 작성으로 remote Supabase Auth + Mac self-hosted Supabase DB/Storage production 전환 계약을 승인했다.
  - 공식 문서 기준은 요구사항 v1.7.26, 화면 v1.5.30, 유저flow v1.3.28, DB v1.3.27, API v1.2.30이다.
  - 신규 workpack `hybrid-auth-local-data-production`은 implementation 전 official 5/SOT/workpack/acceptance/automation을 먼저 잠그며, public API shape 변경 없음, account-generation legacy 유지, PostgREST exact pre-request guard, Storage loopback claim-verifying gateway, private remote identity mirror 최소화, remote control-plane barrier, service-role 0 inventory/static gate, semantic restore, no env-only rollback after first local write를 release blocker로 둔다.
```

삽입 위치 2: Operating Rules

```md
- `hybrid-auth-local-data-production`도 2026-07-30 전역 GPT-only 규칙을 그대로 따른다. Stage 1 작성과 독립 architecture/security 검토는 서로 다른 Codex task ID로 실행됐으며, 이후 구현·검토 작업도 역할별 새 Codex 작업으로 분리한다.
```

삽입 위치 3: Slice Order 표의 account-session-generation-foundation 뒤 또는 successor foundation 인접 위치

```md
| `hybrid-auth-local-data-production` | planned | remote Supabase Auth는 Google/Naver/Kakao OAuth/session authority로 유지하고 application DB/Storage를 Mac self-hosted Supabase로 이전한다. remote ES256 JWKS local verification, private identity mirror, account-generation legacy 유지, loopback-only, first-write rollback floor를 먼저 잠근다 |
```
