# v85 후속 전환: 원 승인 보존과 새 키 결속

2026-10-17 작업 기록이다. 실제 v85/gen50 전환 완료 기록은 아니다. 원 전환 계약은 [고정49→50 전환](youtube-v85-controlled-cutover-20261017.md), 웹 복구는 [웹 전용 복구](youtube-v85-web-only-recovery-20261017.md)를 따른다.

## 확인한 보존 불일치

원 `plan.json`은 작업42개를 관찰했다. 후속 읽기 전용 관찰에서는43개이며, 원래42개 전체 행의 SHA256은 원 계획과 정확히 같았다. 추가1개는 계획 이후 생성된 성공 작업이며 기존 두 검증 영상과 다르다. 일반·인증 데이터를 포함하는 두 집계 지문도 달라졌다. 원 시점의 행별 원본이 없어 변경 컬럼·주체·이유를 확정할 수 없다. 이를 정상 변화라고 분류하지 않는다. 스키마·DB232 ledger·카탈로그·권한·제어·worker49의 비교 대상은 그대로였다.

기존 원 계획 파일과 `approved-plan-sha256` Keychain anchor는 수정하지 않는다. 별도 `continuation-plan.json`에는 원 계획 전체와 원 파일/정규화 SHA256, 정확한 현재43개 자료 지문, 원42개 지문, 미확정 변화 분류, 검토할 도구/웹 SHA, 새 Round2 키 fence 결속을 넣는다. 별도 create-only `approved-continuation-sha256` anchor가 있어야 실행한다. 승인 이후의 추가 변화는 새로 중단 사유가 되며 자동으로 기준을 갱신하지 않는다. 운영 자료 복원·삭제·수정으로 차이를 해소하지 않는다.

## 최소 변경 경계

평가된 worker release `1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa`, artifact38개, snapshot과 descriptor, C04/v74/V2 권위는 유지한다. 후속 source delta는 나열된 운영 도구·검사·문서만 허용하며 제품 코드와 artifact는 원 평가 바이트와 같아야 한다. `package.json`은 공개 원문 전후 SHA를 결속하고 복구/회전 명령 별칭4개 이외의 의존성·build hook 변경을 거절한다.

새8개 키와 deny-old fence, Round2/C05/lead OFF를 유지한다. 모든 공식 웹 state publication은 기존 rotation marker를 정확히 계승하며 삭제·교체를 거절한다. 과거 candidate SHA는 당시 회전 증거로 보존하고 새 웹 plist SHA로 덮어쓰지 않는다. 키 값·토큰·개인 행은 문서나 명령 출력에 넣지 않는다.

## 실행과 재확인

`prepare-continuation <정확한 도구 SHA> <새 /tmp 폴더>`는 clean commit과 원 승인에 결속된 읽기 전용 현황 및 검토 파일만 준비한다. 실제 승인·발급·설치는 하지 않는다. 검토 파일의 정확한 SHA와 미확정 자료 유지 경고를 사용자가 확인한다. `approve-plan`, `apply`, `resume`는 사용자 Mac Terminal의 세 TTY와 직접 입력 `V85-GEN50`을 요구한다. agent가 PTY로 대신 실행하지 않는다.

worker50은 기존 role/scope/issuer/audience를 유지하며 만료는 `2026-10-22T14:27:30Z`로 고정한다. manager는 기존 ES256 키로 최대300초이며 권한을 추가하지 않는다. 등록 후49는 무효가 되므로 동일50 전진 복구만 허용한다. 웹과 worker 사이 짧은 추출 접수503 가능성은 기존 계약대로다.

일반 `reconcile`과 이미 완료된 상태의 재확인·재개는 파일/Keychain 쓰기 없이 기존 증거를 확인한다. 누락 발급/등록 증거의 복구는 사용자가 실행하는 미완료 `resume`에 한정한다. activation seal이 없거나 다르면 자동 작성하지 않는다. 초기 전환은 승인43개와 전체 자료 지문을 엄격히 보존한다. 완료 후 새 실제 검증 작업은 원 승인43개의 전체 행을 보존하는지 별도로 확인해 허용한다.

개별 명령·DB transaction과 단계 사이에 총600초의 협력적 실행 예산을 적용한다. 실패 시 소유한50의 차단/확인만 별도60초 예산으로 수행한다. 이는 모든 동기 작업을 강제로 중단하는 절대 wall-clock 보장이 아니다. 불확실 결과는 읽기 전용 대조 후 같은50으로만 진행한다.

## 검증과 남은 조건

관련 Vitest292개·Node17개·Python23개, 격리 PostgreSQL17 CAS7개·typecheck·변경 lint·Anti Slop 신규0을 확인했다. 독립 코드 검토에서 추가 필수 차단은 발견하지 못했다. 실제 adapter closure를 메모리 파일/DB 관찰 fixture에 연결해 완료 상태의 `reconcile`, `resumePreflight`, `verifyActivated`가 쓰기0임을 확인했다. 누락 증거는 기본 재확인에서 복구하지 않고, 명시한 복구 경로에서만 등록 receipt를 만든다. 이 검사는 운영 인증·설치·실제 영상 처리 성공을 대신하지 않는다.

Next production build도 exit0이며 기존 lint 경고4개가 있다. 실제 전환 전 정확한 승인 파일 작성·사용자 확인/실행이 남는다. 이후 실제 웹/worker50 readiness, DB232·원 자료·새 키 fence·OFF 상태, 승인된 최소1개 영상의 접수→추출→저장 흐름을 확인해야 한다. 원42개 보존 증명은 일반·인증 자료 변화 원인을 해명한 것이 아니다.
