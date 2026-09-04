# 광고 캠페인 일회성 production release 예외

- 상태: **canonical / one-time / expires**
- 승인된 release candidate: `4817b8b213b264485d75939ec764596727d1131c`
- 만료: `2026-09-15T15:00:00Z` 이후 사용 금지

이 문서는 2026-09-15 광고 캠페인을 위한 단 한 번의 수동 release-promoter 절차다. 장기 production release v3를 활성화하거나 완화하지 않으며, closed PR [#1505](https://github.com/netsus/homecook/pull/1505)의 별도 campaign command, manifest, workflow 또는 adapter를 되살리지 않는다. 새 framework, script, schema, workflow, tag 체계와 제품 변경을 만들지 않는다.

이 예외는 위 exact SHA에만 적용된다. 현재 조정 작업에 기록된 사용자 결정을 release 승인 근거로 사용하되, 작성 작업은 자기 변경을 승인할 수 없다. 독립 외부 검증이 끝날 때까지 `master`를 동결한다. 그 전에 `origin/master`가 움직이거나 candidate SHA/tree가 달라지면 즉시 중단하고 새 exact SHA에 대한 사용자 승인과 문서 갱신을 다시 받아야 한다.

## 변하지 않는 경계

- 실행자는 `release-promoter` 역할이어야 한다. 일반 작업과 이 문서 작성 작업은 server, production, DB, Docker, LaunchAgent, tag를 변경하지 않는다.
- 기존 [`local-mac-production-release-promotion.md`](./local-mac-production-release-promotion.md)의 v3 activation은 계속 `activation_blocked: true`다. 이 예외 통과를 v3 readiness, tag/attestation authority 또는 반복 가능한 일반 release 증거로 해석하지 않는다.
- app, full-local Supabase, YouTube worker는 하나의 bundle이며 모두 같은 candidate SHA에서 설치한다. 일부만 새 candidate로 남기는 mixed state는 성공이 아니다.
- Supabase Cloud, linked root, remote DB/credential은 사용하지 않는다. destructive DB reset, production volume 삭제, schema 변경은 금지한다.
- 만료 시각 이후에는 시작하지도 재개하지도 않는다. 이 문서를 다른 campaign, SHA, 환경 또는 후속 release에 복사·재사용하지 않는다.

## 시작 조건

release-promoter는 production mutation 전에 아래 항목을 한 기록에 남기고 서로 대조한다. 하나라도 불명확하면 중단한다.

- candidate SHA와 tree, 현재 `origin/master`, 사용자 승인 기록, 실행자 identity/role, UTC 시작 시각
- candidate SHA의 현재 required CI가 모두 완료·green이고 pending, rerun, failure, cancelled가 없다는 URL/ID 기반 증거
- 독립 검토자가 이 문서, exact candidate, campaign 기한과 외부 운영 준비 상태를 확인한 기록
- production 운영 checkout과 분리된 fresh clean detached server checkout
- 기존 app/full-local/YouTube worker 각각의 `running | absent`, 실제 경로·식별자·SHA와 read-only health 상태
- 각 component의 기존 상태로 돌아갈 **실행 가능한 exact rollback command**. 기존 상태가 `absent`면 candidate를 stop/uninstall하고 absent를 확인하는 exact command를 기록한다.

시작 조건을 기록한 뒤 candidate와 rollback 대상 bytes/config를 고정한다. 이후 source, lockfile, build output 또는 rollback command가 바뀌면 같은 시도를 계속하지 않는다.

## 일회성 실행 순서

아래 순서를 바꾸거나 성공 단계를 생략하지 않는다. 각 단계 직전 현재 UTC가 만료 전인지 다시 확인한다.

1. **install/build 1회** — fresh detached checkout에서 lockfile 고정 install을 한 번 실행하고 같은 checkout에서 build를 한 번만 만든다. 이후 rehearsal이나 production 설치를 위해 rebuild하지 않는다.
2. **격리 rehearsal 1회** — production과 겹치지 않는 unique namespace와 high port를 사용한다. production checkout, production port, LaunchAgent, Caddy, DB data/volume을 변경하지 않는다. candidate app과 worker synthetic path가 같은 SHA/build에서 동작하는지 확인한 뒤 격리 자원만 정리한다.
3. **production read-only snapshot** — app/full-local/worker의 `running | absent`, 실제 SHA/경로, Caddy route, port/listener, local DB health와 persistence 기준을 다시 읽어 기록한다. 시작 조건의 rollback 대상과 달라졌으면 중단한다.
4. **DB backup** — fresh encrypted production DB backup을 만들고 암호화 여부, nonempty artifact, checksum과 read-only verification 결과를 기록한다. production restore, reset, volume 삭제로 검증하지 않는다.
5. **최종 승인 고정** — 현재 조정 작업의 사용자 승인 결정, 독립 검토 결과, candidate SHA/tree, build checksum, rehearsal 결과, snapshot, backup checksum, exact rollback commands를 release-promoter가 한 번 대조한다. 작성자 self-approval은 금지한다.
6. **bundle 설치** — 기록된 순서와 명령으로 app, full-local, YouTube worker를 같은 candidate SHA/build에서 설치한다. 다른 commit, 별도 worker artifact 또는 새 build를 섞지 않는다.
7. **live 검증** — 아래 검증이 모두 성공한 뒤에만 release 성공을 선언한다.

## 필수 live 검증

- Caddy/HTTPS의 public root, `/beta`, `/privacy`가 올바른 hostname과 certificate로 응답한다.
- auth health가 정상이며 보호 경로의 인증 경계가 유지된다.
- landing submit이 성공하고 제출 결과가 full-local DB에 실제로 남는다.
- analytics canary가 exact campaign/variant로 한 번 수집되고 비밀정보나 허용되지 않은 PII를 포함하지 않는다.
- YouTube worker synthetic job이 enqueue부터 terminal success까지 완료되고 app과 같은 candidate SHA로 실행된다.
- app/full-local/worker의 최종 `running | absent`, SHA/경로와 health를 다시 기록하며 candidate 외 mixed state가 없다.

실제 paid-ad 유입을 열기 전에 위 결과와 외부 준비 항목(운영 privacy 정보, `/privacy`, Turnstile production 설정/hostname, origin/rate-limit, retention, sender domain, 자산 권리)을 독립 검토자가 확인해야 한다. lead 보호 조건이 하나라도 없으면 기존 fail-closed 동작을 유지한다.

## 실패와 rollback

install 이후 어느 단계든 실패하거나 timeout, drift, expiry가 발생하면 새 진행을 멈춘다.

1. candidate app/full-local/worker를 안전하게 stop한다.
2. 시작 전에 기록한 exact rollback commands로 세 component 전체를 이전 `running` 상태로 복구한다. 이전 상태가 `absent`였거나 안전한 복구가 입증되지 않으면 candidate를 제거한 safe stopped/absent 상태를 유지한다.
3. DB backup은 보존하고 destructive reset, volume 삭제 또는 즉흥적인 production restore를 하지 않는다.
4. 최종 component 상태, health, 실패 지점, 실행한 rollback command와 결과를 기록한다. 일부 candidate가 남아 있으면 성공으로 닫지 않는다.

## 종료와 후속 작업

성공 기록에는 candidate SHA/tree, CI, 승인, build/rehearsal/snapshot/backup, live 검증과 최종 bundle 상태를 포함한다. 실패 기록에는 같은 identity와 rollback 결과를 포함한다. 어느 쪽이든 이 예외의 사용 횟수는 소진된다.

`2026-09-15T15:00:00Z` 이후 이 문서는 역사 기록만 남으며 release authority가 아니다. 캠페인 종료 뒤 별도 승인된 docs-governance 작업에서 이 예외를 retired로 표시하고, PR #1505에서 드러난 범위 팽창을 반복하지 않는 장기 release pipeline 재설계와 정리를 수행한다.
