# Hybrid Supabase Mac production runtime

이 경로는 기존 Next production worktree, launchd, port `3100`과 독립적이다.
외부에 공개되는 포트는 loopback gateway 하나뿐이며 DB, PostgREST, Storage는
Docker internal network 안에만 둔다.

## 1. 설정과 비밀

```bash
cp infra/hybrid-supabase/.env.production.example \
  infra/hybrid-supabase/.env.production.local
chmod 600 infra/hybrid-supabase/.env.production.local
```

`.env.production.local`에는 비밀을 넣지 않는다. 기본 Keychain service는
`homecook-hybrid-production`이며 다음 account를 각각 별도 generic password로
저장한다.

- `AUTH_SUPABASE_PUBLISHABLE_KEY`
- `DATA_SUPABASE_PUBLISHABLE_KEY`
- `DATA_SUPABASE_SECRET_KEY`
- `HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1`
- `HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1`
- `HYBRID_COMBINED_JWKS`
- `HYBRID_POSTGRES_PASSWORD`
- `HYBRID_STORAGE_LEGACY_JWT_SECRET`
- backup account: `HOMECOOK_HYBRID_BACKUP_KEY_ID`에 적은 값

local Data의 publishable/service key는 임의 문자열이 아니다. 같은
`HYBRID_STORAGE_LEGACY_JWT_SECRET`으로 서명된 유효한 HS256 JWT이고 role이 각각
`anon`, `service_role`이어야 한다. `HYBRID_COMBINED_JWKS`에는 remote Auth 공개
검증키와 이 local HS256 키가 같이 있어야 한다. validator는 값 자체를 출력하지
않고 서명 관계, role, 시간 claim, 중복/placeholder를 검사한다. 모든 CLI 명령은
remote JWKS를 다시 fetch해 remote `kid/kty/alg/use/key material`을 combined
JWKS와 canonical 비교한다. 일치한 remote 공개키만 config 옆
`.remote-jwks.json`에 mode `0600`으로 atomic 교체한다. 네트워크 오류나 예고되지
않은 rotation은 기존 cache를 보존하고 fail closed하며 local oct key와 다른
secret은 cache에 기록하지 않는다.

`process-env`는 격리 rehearsal 전용이다. 설정에서 명시한 뒤 모든 명령에
`--allow-process-env-secrets`를 붙여야만 동작한다.

`HYBRID_DOCKER_PLATFORM`은 Docker engine의 native platform과 같아야 한다.
Apple Silicon은 `linux/arm64`, Intel Mac은 `linux/amd64`다. CLI는 전역
`DOCKER_DEFAULT_PLATFORM` 값을 신뢰하지 않는다. 아래 플랫폼별 manifest
digest를 그대로 설정하고 exact digest pull 뒤 실제 `RepoDigests`와 image
architecture를 모두 검사한다. gateway Dockerfile의 Node base도 같은 digest
authority를 사용한다. `HYBRID_POSTGRES_PASSWORD`는 connection URI에 안전한
`A-Z a-z 0-9 . _ ~ -` 문자만 사용한다.

| image config | `linux/arm64` digest | `linux/amd64` digest |
| --- | --- | --- |
| `HYBRID_POSTGRES_IMAGE` | `public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a` | `public.ecr.aws/supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b` |
| `HYBRID_POSTGREST_IMAGE` | `postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805` | `postgrest/postgrest@sha256:560895fc1f6cb78f36ae64682c85bfc923c73da2d3a473ae2f55755fd7991ad1` |
| `HYBRID_STORAGE_IMAGE` | `supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de` | `supabase/storage-api@sha256:6f706c1184d97b081446527bb62a3193d3d47ad0daafcf738fd5c3e5a62aed97` |
| `HYBRID_NODE_IMAGE` | `docker.io/library/node@sha256:74e144386aaec923ce092c3371b351d96c4f977a4ac3f58431fa9164b9399534` | `docker.io/library/node@sha256:aa83e8f13963f17f7f6bd497085112bf12ea6f20b4b826d9b33f2d99594325b6` |

## 2. 설치와 일상 명령

```bash
pnpm hybrid-production:validate
pnpm hybrid-production:install
pnpm hybrid-production:status
pnpm hybrid-production:stop
pnpm hybrid-production:start
pnpm hybrid-production:recover
pnpm hybrid-production:capacity
pnpm hybrid-production:network
pnpm hybrid-production:manifest
```

`install`은 clean named volume에서 Postgres 역할/스키마를 확인하고 repo의 전체
application migration과 Storage bootstrap을 적용한 뒤 hybrid authority 함수와
`auth.users=0` 불변식을 검증한다.
`recover`는 Postgres healthy → PostgREST/Storage healthy → gateway healthy
순서를 지키며 이미 정상인 경우에도 안전하게 재실행할 수 있다.
production gateway의 `/healthz`는 upstream 포트만 보지 않는다. local anon JWT와
attestation으로 `ingredients`의 0-row 안전 읽기까지 성공해야 healthy가 된다.
허용된 실제 익명 GET도 같은 local anon JWT와 apikey를 주입한다. remote user
bearer가 있으면 remote issuer/JWKS/liveness/binding을 검증한 뒤 그 bearer를
Authorization으로 전달하고 local anon key는 apikey로만 사용한다.

`status`는 필수 service state/health와 실제 gateway readiness를 함께 평가한다.
정상은 `PASS/READY`, 전체 정지는 `BLOCKED/STOPPED`, 부분 정지·unhealthy 또는
readiness 실패는 `BLOCKED/DEGRADED`이며 BLOCKED는 exit code `2`다.

`capacity`는 DB+Storage disk뿐 아니라 Postgres, PostgREST, Storage, gateway의
`docker stats`, cgroup `memory.current/events`, process high-water RSS, Docker
Desktop memory limit, Mac available RAM, encrypted swap free를 함께 출력한다.
현재 Docker Desktop kernel이 `memory.peak`를 제공하지 않으면 모든 process의
`VmHWM` 합을 보수적인 peak로 사용하고 `peakSource`에 이를 표시한다. 결과가
`BLOCKED`이면 설치 파일이나 named volume이 잘못됐다는 뜻은 아니지만 24시간
shadow와 cutover로 진행하면 안 된다.

`HOMECOOK_DATA_AUTHORITY=remote|local-shadow|local`을 설정할 수 있다. 이
runtime 설치 자체는 remote DB/Storage에 쓰지 않는다. `local-shadow`에서도
기존 계약대로 safe GET digest 비교만 local에서 하고 response/write authority는
remote에 남는다.

## 3. encrypted complete-v2 backup

개인 경로를 저장소에 적지 말고 절대 경로를 직접 전달한다.

```bash
pnpm hybrid-production:backup -- \
  --output /absolute/private/path/homecook-complete-v2.tar.gz.enc
```

결과 archive와 `.sha256`은 mode `0600`이다. archive는 AES-256-CBC,
PBKDF2 200000회로 암호화되며 DB dump, Storage payload,
DB/Storage/catalog manifest를
포함한다. backup key는 runtime secret과 다른 Keychain item이어야 한다.
일반 backup은 gateway를 자동 복구한다.
Storage manifest는 DB reference별 object ID/version/path/bytes/MIME와 named volume의 실제
파일 SHA-256을 연결하며, 누락·orphan·크기 불일치가 하나라도 있으면 중단한다.

## 4. destructive restore

restore는 대상 named volume을 지우므로 명시적 flag와 새 pre-restore backup
출력 경로 없이는 거부한다. 경로는 미리 존재하면 안 된다. restore가 gateway를
먼저 비공개로 만들고 현재 DB/Storage/catalog digest와 project/volume/timestamp에
결합된 encrypted backup을 직접 생성·복호화 재검증한 뒤에만 volume을 교체한다.
임의의 과거 archive를 prebackup으로 재사용할 수 없다.

```bash
pnpm hybrid-production:restore -- \
  --archive /absolute/private/path/source.tar.gz.enc \
  --destructive \
  --pre-restore-backup /absolute/private/path/target-before-restore.tar.gz.enc
```

실행 순서는 고정된다.

1. pre-data schema
2. hybrid compatibility/FK replacement
3. application data
4. post-data + archive ACL replay + validation

마지막 단계는 gateway가 아직 비공개인 동안 local `auth.users=0`,
application-owned `auth.users` residual 0, public table count/digest,
Storage count/bytes/MIME/hash/reference와 canonical catalog manifest가 source와
같은지 확인한다. catalog에는 private table count/hash(원문 비노출), role
attributes/membership, schema/relation/function owner+ACL, RLS/FORCE RLS/policy,
trigger, extension, guard schema/function, application object의 `pg_depend`
graph가 포함된다. section restore에서 빠지는 archive `ACL`/`DEFAULT ACL` entry도
별도 allowlist로 재생하고, schema dump에서 빠지는 pinned `pg_trgm` extension
member ACL도 extension selection으로 함께 보존한다. ACL은 `NULL`과 명시된
기본 owner privilege를 `acldefault` 기준의 같은 effective grant로 정규화한다.
restore마다 바뀌는 PostgreSQL 내부 TOAST/FK trigger OID는 소유
table/constraint에 결합한 이름으로만 정규화하고 dependency type과 개수는
그대로 해시한다. 모든 검증 성공 후에만 gateway를 ordered recovery로 공개한다.
어느 단계든 실패하면 gateway는 강제 정지/비공개 상태로 남는다.

## 5. 이 PR 밖의 수동 gate

Mac 실제 reboot, 24시간 `local-shadow`, Google/Naver/Kakao live OAuth,
Supabase dashboard 설정, Google Drive off-Mac upload/restore, final cutover는
이 runtime 자동화의 통과 주장에 포함되지 않는다. 독립 security/operations
review와 별도 승인 전에는 production/cutover write를 열지 않는다.

2026-07-30 진단에서 Apple Silicon Docker engine에 전역
`DOCKER_DEFAULT_PLATFORM=linux/amd64`가 주입되어 PostgREST가 QEMU로 실행된 것이
약 6.2~6.4GiB resident memory의 원인이었다. 동일한 공식 `v14.12`의 native
`linux/arm64` manifest와 `+RTS -N2`를 적용한 전체 `public,storage` schema
runtime은 signed readiness 뒤 120초에 약 31MiB였고 두 번의 restart 뒤 60초도
약 30~31MiB였다. 상세 증거는
`docs/workpacks/hybrid-auth-local-data-production/postgrest-memory-diagnosis-2026-07-30.md`
에 있다. 이는 24시간 shadow 통과를 뜻하지 않는다.
