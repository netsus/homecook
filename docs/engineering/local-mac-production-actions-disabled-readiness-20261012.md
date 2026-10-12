# GitHub Actions 비활성 상태의 production promotion 준비 진단

상태: **읽기 전용 진단 / 구현·승인·운영 반영 없음**

진단 기준 후보: `5fcb875edf4cea7de9da3dd6612b3ef0c8cc4f77`

정책 기준: [서버 Mac release promotion runbook](./local-mac-production-release-promotion.md)

이 문서는 GitHub Actions를 계속 비활성으로 둔 상태에서 정식 production release bundle을 승격할 수 있는지 확인한 기록이다. 배포 guard를 제거하거나 우회하는 근거가 아니며, 새 인증 키·서명 시스템·운영 설정을 만들지 않았다.

## 결론

- 현재 저장소 상태에서는 `pnpm release:production:promote`를 실행할 수 없다.
- 실행부와 반복 리허설 영수증 검증은 상당 부분 구현되어 있지만, `promote`는 증거와 무관하게 adapter 생성 전에 fail closed한다.
- 코드에 고정된 GitHub attestation 발급 workflow와 필수 Actions context를 현재 저장소가 제공하지 않으므로 기존 GitHub v3 경로도 충족할 수 없다.
- Actions 없이 전체 배포를 지원하려면 GitHub 증거를 빈 값이나 로컬 자기 선언으로 대체하는 것이 아니라, 별도의 서명된 offline approval authority와 evidence schema를 구현·검토해야 한다.

## 현재 차단 조건

`scripts/promote-local-mac-production-release.mjs`의 `assertProductionPromoteActivated(command)`는 `command === "promote"`이면 항상 예외를 발생시킨다. 이 검사는 인수 파싱, promotion adapter 생성, lock 획득, Docker·LaunchAgent·DB·runtime 접근 전에 실행된다.

따라서 현재 허용되는 범위는 다음과 같다.

- `plan`, `prepare`, `status`, `verify`: 각 명령의 기존 read-only/prepare 경계 안에서 사용 가능
- `promote`: 올바른 manifest·영수증·attestation을 제공해도 무조건 차단

빠른 배포를 위해 이 함수의 예외를 삭제하거나, 검증 대상 파일을 숨기거나, 누락된 증거를 성공으로 간주해서는 안 된다.

## 구현되어 있는 증거와 빠진 신뢰 계층

이미 구현된 항목:

- 서로 다른 resource ID와 port를 사용하는 두 개의 fresh rehearsal member receipt 검증
- SHA, tree, build, sealed bundle, toolchain, image, migration, canary 일치 검증
- 정확히 두 member로 결정적 repeatability receipt와 digest 생성
- receipt 만료·manifest·candidate·운영 inventory/classification exact binding
- `promotion_safe=true`, mutation count 0, findings/recovery plan 없음, coherent running 확인
- 이 검증들을 adapter 생성보다 먼저 수행하도록 한 promotion authority 경계

남은 항목:

- repeatability receipt를 독립 신뢰 주체가 승인했다는 서명 또는 attestation
- 승인자가 현재 release SHA/tree/sealed bundle과 receipt digest·만료를 정확히 승인했다는 암호학적 결속
- 유효한 활성화 증거를 검증한 경우에만 unconditional block을 통과시키는 versioned activation policy
- recovery 실행 경로와 단계별 실패 주입 검증

`scripts/local-mac-production-rehearsal.mjs`도 repeatability attestation, production unlock, recovery execution을 현재 범위 밖으로 명시한다. 따라서 로컬 digest만으로 정식 승인 증거가 완성됐다고 볼 수 없다.

## GitHub attestation 경로가 현재 성립하지 않는 이유

현재 승인 정책은 다음 일곱 Actions context의 정확한 전체 집합을 요구한다.

- build
- changes
- dependency-audit
- policy
- quality
- security-function-authorization
- security-smoke

promotion verifier는 signer workflow를 `.github/workflows/production-release-attestation.yml`로 고정해 검증한다. 그러나 현재 저장소의 workflow에는 이 파일이 없고 Actions도 비활성 상태이므로 workflow run, check suite, OIDC/attestation bundle을 발급할 수 없다.

GitHub verifier와 manifest binding 코드가 존재한다는 사실은 issuer가 존재한다는 뜻이 아니다. 필수 context를 빈 배열로 완화하거나 로컬 결과를 GitHub 결과로 표시하는 것은 fail-closed 정책을 손상한다.

## Actions 비활성 전용 경로의 최소 안전 설계 제안

아래는 후속 사용자 승인과 독립 code/security review가 필요한 제안이며 아직 구현하지 않았다.

1. `offline-operator-v1`처럼 GitHub v3와 구분되는 versioned approval schema를 만든다.
2. Ed25519 같은 검증 가능한 서명에 release SHA/tree, sealed bundle digest, repeatability receipt digest·만료, candidate component digest, production inventory/classification digest, target environment, 승인 시각·nonce, previous release를 결속한다.
3. 공개키 fingerprint는 코드나 별도 읽기 전용 trusted-root에 pin하고 개인키는 운영 Mac 밖의 두 번째 장치·hardware key·별도 승인자가 보관한다.
4. Actions context 대신 정확한 명령, 결과, toolchain/source tree/artifact digest와 독립 리뷰 결과를 담은 local evidence manifest를 만들고 같은 승인에 결속한다.
5. GitHub v3와 offline authority를 명시적으로 dispatch하는 verifier를 추가한다. unsigned local digest는 승인하지 않는다.
6. unconditional block은 삭제하지 않고, versioned activation policy와 기존 pre-mutation authority가 모두 통과할 때만 execution adapter 생성으로 진행한다.
7. recovery 실행과 pre-DB, SQL, post-DB/pre-pointer, post-pointer health failure를 disposable 환경에서 검증한다.

원격 `prod-*` tag를 계속 감사·불변 경계로 사용할 경우 현재 특정 GitHub App actor에 고정된 tag ruleset에 정확한 새 signer/promoter actor를 허용하는 별도 관리자 결정이 필요하다. 원격 tag를 authority에서 제외한다면 운영 Mac 밖의 append-only signed receipt archive가 대체 감사 경계로 필요하다.

## 보안·DB·운영 권한 영향

게이트 코드와 문서 구현 자체에는 DB schema 변경이 필요하지 않다. 그러나 실제 YouTube bridge release는 함수·trigger·기존 저장 결과 backfill을 포함하므로 다음은 별도 운영 승인을 유지한다.

- 실행 직전 대상 행 수 재확인
- full-local DB snapshot과 격리 restore 확인
- target migration checksum·ledger 확인과 단일 transaction 적용
- DB 적용 완료 뒤에만 웹 pointer 전환
- signing key/trusted-root 파일 권한, Docker/LaunchAgent, 운영 계정 권한
- protected remote tag actor를 바꿀 경우 GitHub ruleset 관리자 권한

같은 Mac·같은 사용자 계정이 approval signer와 release promoter를 모두 맡으면 역할 분리가 사라진다. 이를 허용하려면 낮아지는 assurance를 사용자가 명시적으로 수용해야 한다.

## 검증과 rollback 경계

활성화 구현 후 필요한 최소 검증:

- wrong key, tamper, expired receipt, replay, source substitution, 다른 environment binding 거부
- 격리된 두 rehearsal과 deterministic receipt 재현
- disposable full-bundle promotion과 단계별 실패 주입
- snapshot restore drill
- 관련 unit/property/integration 검사와 독립 code/security review
- 대상 UI 흐름, typecheck, build

rollback 원칙:

- DB 전 실패: 운영 mutation 없음
- SQL 실패: transaction rollback, runtime pointer 변경 없음
- DB commit 후 app 전환 전 실패: DB는 자동 복원하지 않고 호환되는 이전 app만 유지
- app 전환 후 실패: DB 하위 호환성이 증명된 경우에만 이전 immutable app/runtime pointer/LaunchAgent 복구
- DB 비호환: 파괴적 reset 대신 forward fix 또는 승인된 수동 recovery

## 남은 사용자 결정

- 두 번째 장치·hardware key·다른 승인자를 사용할지, 같은 Mac의 낮은 보증 수준을 수용할지
- protected remote tag를 감사 authority로 유지할지, off-Mac signed receipt archive로 대체할지
- Actions 비활성 전용 approval 구현과 독립 security review를 별도 작업으로 승인할지
- 이후 DB snapshot/backfill과 실제 운영 promotion을 각각 별도 승인할지

이 결정과 구현이 완료되기 전까지 `activation_blocked: true`가 최종 상태다.
