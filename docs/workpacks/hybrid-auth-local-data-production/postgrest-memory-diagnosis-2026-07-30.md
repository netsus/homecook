# PostgREST production memory diagnosis — 2026-07-30

## 결론

약 6.2~6.4GiB resident memory는 Docker VM 전체 RSS를 PostgREST로 잘못 읽은
값이 아니었다. `docker stats`와 container PID namespace의 `/proc/1/status`가
모두 실제 PostgREST container process의 큰 RSS를 확인했다. 원인은 Apple
Silicon Docker engine에서 전역 `DOCKER_DEFAULT_PLATFORM=linux/amd64` 때문에
공식 `v14.12`의 amd64 manifest가 QEMU로 실행된 것이었다.

버전, RLS, exposed schema를 바꾸지 않았다. 동일한 공식 `v14.12` tag의 native
arm64 manifest를 강제 pull하고 image architecture를 fail-closed로 검사하며,
지원되는 GHC RTS 인자 `+RTS -N2 -RTS`를 실제 command에 적용했다. 그 결과 전체
`public,storage` schema cache와 signed readiness 후 PostgREST steady memory는
약 30~31MiB였다.

## 비정상 실행 증거

- host: macOS arm64
- Docker engine: `linux/aarch64`
- 당시 전역 설정: `DOCKER_DEFAULT_PLATFORM=linux/amd64`
- cached image: `postgrest/postgrest:v14.12`, `linux/amd64`,
  image ID `sha256:f4cf0696ca63f31ea41adfe8f49fd2977ea8708a6153c218180713d64669586d`
- `docker stats --no-stream`: `6.205GiB / 7.653GiB`, PIDs `20`
- `docker inspect .State`: `OOMKilled=false`, `ExitCode=0`, restart count `0`
- `docker inspect .Path/.Args`: `/bin/postgrest`, `[]`
- PID 1: `VmRSS=6490168kB`, `VmHWM=6757764kB`,
  `RssAnon=6489368kB`, threads `20`
- `/proc/1/cmdline`:
  `/usr/bin/qemu-x86_64 /bin/postgrest /bin/postgrest`
- PostgREST child process 없음. 표시된 PIDs는 GHC thread였다.
- amd64/QEMU 상태에서 `+RTS -N2 -RTS`를 inspect와 cmdline으로 확인한 비교
  실행도 약 `6.42GiB`였으므로 RTS core 수가 근본 원인은 아니었다.

당시 메모리 압박으로 진단 sidecar가 exit `137`이 되어 cgroup file을 끝까지
읽지 못했다. 따라서 이전 실행의 peak는 `/proc/1/status` `VmHWM`과
`docker stats`로 기록했으며, 존재하지 않는 cgroup peak 값을 꾸며내지 않았다.

## 공식 multi-architecture image 확인

모든 production 고정 image tag에서 arm64 manifest를 확인했다.

| image | index digest | native image ID |
| --- | --- | --- |
| `postgrest/postgrest:v14.12` | `sha256:54000f24847d01a2c2302e0041cf0618b875c57fb48507d743cfa9aaa50bf43c` | `sha256:16302c7c0445f430f7b959fbd80e4147dcacbbdf5676207250d45a38d0d2a7c1` |
| `supabase/storage-api:v1.60.4` | `sha256:c8eb9858eafec891a97c27125470aaad54703c3f4eb4d55ca7f1bf6c6411febf` | `sha256:376da95bdc6a0de41d740100687c195701b37efec8299d724f4024f2ae69649d` |
| `public.ecr.aws/supabase/postgres:17.6.1.136` | `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00` | `sha256:c5ac0bc3cd8d4896da4a75d2d8ed5a2c0c2bd11ef3cb023f1159d673025f168a` |

## native PostgREST 실행 증거

- `postgrest --version`: `PostgREST 14.12`
- `docker inspect .Path/.Args`:
  `"postgrest" ["+RTS","-N2","-RTS"]`
- `/proc/1/cmdline`: `postgrest +RTS -N2 -RTS`
- PID 1만 PostgREST process이며 별도 child process 없음
- 120초 시점:
  - `docker stats`: `30.88MiB / 7.653GiB`, PIDs/threads `9`
  - cgroup `memory.current`: `33,357,824` bytes
  - cgroup `memory.events`: `low=0 high=0 max=0 oom=0 oom_kill=0`
  - `/proc/1/status`: `VmRSS=69,756kB`, `VmHWM=69,756kB`,
    `RssAnon=30,940kB`, `RssFile=38,816kB`, threads `9`
  - `docker inspect`: `OOMKilled=false`, `ExitCode=0`

이 Docker Desktop kernel의 cgroup v2에는 `memory.peak` file이 없다. 운영
`capacity` 명령은 이를 명시하고 `proc-vmhwm-sum`을 보수적인 peak source로
사용한다.

## schema cache와 요청 분리 비교

동일한 native image, 동일한 Postgres cluster에서 비교했다.

| case | schema objects (relations/functions/columns) | start | ready | 60s | 120s |
| --- | ---: | ---: | ---: | ---: | ---: |
| migration 전 빈 DB `public` | 0/0/0 | 21.30MiB | 21.48MiB | 21.61MiB | 미측정 |
| 최소 `hybrid_memory_control` | 1/0/2 | 23.42MiB | 23.50MiB | 27.61MiB | 27.70MiB |
| production `public,storage` after 119 migrations | 94/199/1512 | 26.46MiB | 26.54MiB | 28.96MiB | 30.88MiB |

production 세부 schema count는 `public=84/182/1396`,
`storage=10/17/116`이다. readiness 전후에는 유의미한 급증이 없었다.
gateway의 local anon JWT + HMAC attestation signed readiness 전후는
`26.55MiB → 26.92MiB`였다. remote JWKS URL은 gateway가 처리하며 PostgREST는
remote URL을 호출할 network/env 경로가 없다. combined JWKS의 공개 검증키로
local signature verification만 수행한다.

## 반복 restart

| run | ready latency | ready memory | 60s memory | OOMKilled/ExitCode |
| --- | ---: | ---: | ---: | --- |
| restart 1 | 712ms | 28.74MiB | 31.30MiB | `false/0` |
| restart 2 | 778ms | 28.30MiB | 30.09MiB | `false/0` |

## 전체 runtime capacity snapshot

전체 119 migrations와 gateway signed readiness가 끝난 격리 runtime:

| service | cgroup current | conservative peak | OOM events |
| --- | ---: | ---: | ---: |
| Postgres | 164,978,688 B | 280,743,936 B | 0 |
| PostgREST | 118,116,352 B | 149,483,520 B | 0 |
| Storage | 156,725,248 B | 342,396,928 B | 0 |
| gateway | 27,385,856 B | 134,590,464 B | 0 |

- service total current: `467,206,144` bytes
- conservative peak total: `907,214,848` bytes
- Docker Desktop memory: `8,217,026,560` bytes, gate pass
- Mac available RAM: `8,536,358,912` bytes, gate pass
- encrypted swap: total `7,516,192,768`, free `650,840,637` bytes
- required swap headroom: `907,214,848` bytes, gate **blocked**
- disk: data `17,665,171` bytes, free `109,424,275,456` bytes,
  required `85,899,345,920` bytes, gate pass

PostgREST OOM blocker는 native platform 강제로 해결됐지만 이 Mac의 현재 swap
headroom은 production capacity gate를 통과하지 못한다. 따라서 24시간 shadow와
cutover는 금지 상태다. 기존 production port `3100`, launchd, production env는
이 진단에서 변경하지 않았다.
