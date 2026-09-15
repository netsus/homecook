# YouTube 영상 추출 모델 계약

2026-09-15 사용자 승인. `i031-luna-sol-v1`은 기존 i031의 영상 수집, 네 가지 소스,
프레임 선택, macOS OCR, 프롬프트와 단일 레시피 흐름을 보존한 새 모델 계약이다.
기존 `i031-sol-v1`보다 추출 품질이 낮아졌다는 사용자 관찰에 따라 selector와 final의
reasoning effort를 `medium`으로 올리고, selector/segment는 비용 효율적인 Luna로 분리한다.
과거 i031 평가 결과와 동일한 품질 검증을 의미하지 않는다.

| 항목 | 현재 계약 |
| --- | --- |
| final | `gpt-5.6-sol`, effort `medium` |
| selector / segment | `gpt-5.6-luna`, effort `medium` |
| CLI | `0.154.0-alpha.6.2` |
| execution signature | `97aa6be34ed97d4b955045af` |
| pipeline identity | `1cc9db22bff1be9fd3d7f8f829e661d5e53905013781e7179b9490a6cc247d5a` |
| policy version | `3` |
| policy snapshot digest | `2ecd8f2bfa21f4817c63e87a687b03aaf4be129a21ceb4c4e14d3557af4753b9` |

Pipeline identity는 worker EXACT 객체(CLI 포함)의 정렬된 canonical JSON SHA-256이다.
clientVersion은 `codex-vision-keyframes-client-v20-structured-final`이다.
실제 영상 검증에서 final의 잘못된 JSON을 확인해 기존 레시피 필드 그대로
CLI `--output-schema`로 final 출력 형식을 강제한다. 임의 JSON 보정이나 추가 모델 호출은 없다.
모델은 worker 옵션으로 명시하며 실험 클라이언트 기본값과 과거 평가 fixture는 유지한다.
API shape, `i031_codex_vision` mode, DB schema-v2와 catalog fingerprint는 유지한다.
모델은 pipeline identity에, 두 effort는 result-affecting policy options에 포함한다.
기존 options validator가 effort를 string으로 검증하므로 schema 수정은 없고 정책 row만 회전한다.

## 운영 인계

Sol과 Luna는 공식 OpenAI 모델 문서에서 이미지 입력과 effort `medium`을 지원한다.
두 모델의 짧은 `codex exec` 호출과 실제 영상 품질 검증은 운영 적용 전 확인 대상이다.
PATH의 CLI 0.142.5는 두 모델 모두 최신 CLI 필요 오류로 실패했다.
운영 적용과 실제 앱 추출 검증은 담당 리더가 수행한다. 짧은 모델 호출은 영상 품질 검증이 아니다.

실제 `qIR8fZC9cBs`에서 Sol selector는 성공했다. Astra final은 일반 출력에서 잘못된
JSON을 반환했고 structured final은 300초를 초과했다. 같은 선택 프레임과 프롬프트를
보존해 Sol structured final로 실행한 결과 유효한 JSON의 레시피 1개, 재료 15개,
단계 11개를 확인했다. 따라서 현재 final도 Sol이며 전체 앱 접수·저장 검증은 별도다.

1. exact full-local 대상과 백업을 확인하고 enqueue를 중단한 뒤 큐와 permit을 비운다.
2. 기존 policy version 2 적용을 확인한 뒤 `20260915180000_youtube_luna_sol_medium_pipeline.sql`을 한 transaction으로 적용한다.
   enqueue와 같은 advisory key `86120317`을 exclusive로 먼저 잠근다.
   직접 psql 적용은 `--single-transaction -v ON_ERROR_STOP=1`을 사용한다.
   ledger 기록이 있으면 같은 transaction 안에 포함하며 SQL 파일별 autocommit은 금지한다.
   정책 변경은 enqueue를 비활성화하며 credential, 기존 작업과 결과는 변경하지 않는다.
3. artifact builder에 `--policy-version 3`,
   `--pipeline-identity`, `--allowed-snapshot-digest`에 위 값을 명시한다.
4. 새 generation의 제한된 JWT를 발급하고 DB credential 회전 RPC 결과 `rotated=true`를 확인한다.
   현재 40세대이면 41세대이며 적용 직전에 다시 읽는다.
5. 같은 release의 앱 descriptor, worker artifact와 credential을 연결한다.
   provider 파일의 `YOUTUBE_I031_CODEX_BIN`은 검증된 CLI 버전을 가리켜야 한다.
6. 새 정책 snapshot과 preflight를 확인하고 준비가 끝나면 정책을 활성화한다.
   사용자 세션으로 readiness, 실제 앱의 영상 접수, 처리 완료와 결과를 확인한다.

`deploy:dev`의 worker 제한과 정식 installer의 release authority 검사는 유지한다.
DB reset, 이전 generation 복원, 기존 artifact hash만 덮어쓰는 복구는 하지 않는다.
모델 변경 전후의 fingerprint가 달라 기존 결과를 새 모델 결과로 재사용하지 않는다.
