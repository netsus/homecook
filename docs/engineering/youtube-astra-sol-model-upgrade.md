# YouTube 영상 추출 모델 교체

2026-09-15 사용자 승인. `i031-astra-sol-v1`은 기존 i031의 영상 수집, 네 가지 소스,
프레임 선택, macOS OCR, 프롬프트와 단일 레시피 흐름을 보존한 새 모델 계약이다.
과거 i031 평가 결과와 동일한 모델 또는 동일한 품질 검증을 의미하지 않는다.

| 항목 | 현재 계약 |
| --- | --- |
| final | `gpt-6-astra` |
| selector / segment | `gpt-5.6-sol` |
| CLI | `0.154.0-alpha.6.2` |
| execution signature | `4f0d0b8a61d667397afa6ba8` |
| pipeline identity | `53336c769f5ccab9814fa4de688c35a6300693cf801267ac0f9311736782959f` |
| policy version | `2` |
| policy snapshot digest | `f25c71ad4192cf61931355054cf3dd1d73d8726846442c2f3dfb2a11b5548390` |

Pipeline identity는 worker EXACT 객체(CLI 포함)의 정렬된 canonical JSON SHA-256이다.
clientVersion은 `codex-vision-keyframes-client-v20-structured-final`이다.
실제 영상 검증에서 final의 잘못된 JSON을 확인해 기존 레시피 필드 그대로
CLI `--output-schema`로 final 출력 형식을 강제한다. 임의 JSON 보정이나 추가 모델 호출은 없다.
모델은 worker 옵션으로 명시하며 실험 클라이언트 기본값과 과거 평가 fixture는 유지한다.
API shape, `i031_codex_vision` mode, DB schema-v2와 catalog fingerprint는 유지한다.
모델은 정책 옵션의 키가 아니므로 `youtube_extraction_policy_options_valid` 수정은 없다.

## 운영 인계

두 모델의 짧은 `codex exec` 호출은 설치된 앱 CLI에서 성공했다.
PATH의 CLI 0.142.5는 두 모델 모두 최신 CLI 필요 오류로 실패했다.
운영 적용과 실제 앱 추출 검증은 담당 리더가 수행한다. 짧은 모델 호출은 영상 품질 검증이 아니다.

1. exact full-local 대상과 백업을 확인하고 enqueue를 중단한 뒤 큐와 permit을 비운다.
2. `20260915130000_youtube_astra_sol_pipeline.sql`을 한 transaction으로 적용한다.
   enqueue와 같은 advisory key `86120317`을 exclusive로 먼저 잠근다.
   직접 psql 적용은 `--single-transaction -v ON_ERROR_STOP=1`을 사용한다.
   ledger 기록이 있으면 같은 transaction 안에 포함하며 SQL 파일별 autocommit은 금지한다.
   정책 변경은 enqueue를 비활성화하며 credential, 기존 작업과 결과는 변경하지 않는다.
3. artifact builder의 과거 기본값을 사용하지 말고 `--policy-version 2`,
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
