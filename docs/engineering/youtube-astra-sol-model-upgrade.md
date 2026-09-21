# YouTube 영상 추출 모델 계약

2026-09-18 사용자가 실제 배포본을 기준으로 master를 맞추도록 요청했다.
실행 중인 웹, 별도 worker artifact와 full-local DB의 읽기 전용 조회가 모두
아래 `i031-sol-v1` 계약을 사용함을 확인했다. 이전 Luna/Sol medium 전환 계획은
현재 실행 상태가 아니므로 이 문서의 기준으로 사용하지 않는다.

| 항목 | 현재 계약 |
| --- | --- |
| final | `gpt-5.6-sol`, effort `low` |
| selector / segment | `gpt-5.6-sol`, effort `low` |
| CLI | `0.154.0-alpha.6.2` |
| execution signature | `143d3570f6a3c1cbf7680851` |
| pipeline identity | `5e80ffc32ab63ec1e4b015222692597e18bbce8520271a7130689dd138ff808c` |
| policy version | `2` |
| policy snapshot digest | `5418cbb09d1ae090becd4e33a7c5c449ca2769e85443b9e8dca82f103a82fa17` |

Pipeline identity는 worker EXACT 객체(CLI 포함)의 정렬된 canonical JSON SHA-256이다.
clientVersion은 `codex-vision-keyframes-client-v20-structured-final`이다.
영상 수집, 네 가지 소스, 프레임 선택, macOS OCR, 프롬프트와 단일 레시피 흐름을 유지한다.
CLI `--output-schema`로 final 출력 형식을 강제하며 임의 JSON 보정이나 추가 모델 호출은 없다.
API shape, `i031_codex_vision` mode와 DB schema-v2는 유지한다.
2026-09-22 재료 검색 RPC 변경의 catalog 기준은
[추출 접수 복구 기록](youtube-catalog-repair-20260922.md)에 따라 갱신한다.
모델은 pipeline identity에, 두 effort는 result-affecting policy options에 포함한다.

## 배포 상태 확인

- 웹 commit: `5c140caea3ce1d0ad7a22fae29bf19e1b3a18f08`.
- 웹 build ID: `prelaunch-5c140caea3ce-aWoOaT`. loopback에서 반환된 build manifest가 실행 checkout의 파일과 일치한다.
- worker release: `b2531f6b-sol-v1`. artifact의 pipeline identity와 policy version이 웹과 일치한다.
- full-local `private.youtube_extraction_current_policy`: version 2, 위 pipeline identity, `enabled=true`, effort `low/low`.
- `homecook_deploy.migrations`에 `20260915180000` 기록이 없다. 해당 Luna/Sol SQL은 [미적용 계획 원문](archive/20260915180000_youtube_luna_sol_medium_pipeline.sql)으로 이동해 보존한다. 활성 migration에 포함하거나 자동 적용하지 않는다.
- 이번 동기화는 Git 코드와 문서만 정리하며 운영 DB·worker·웹을 변경하지 않는다.

모델을 다시 바꿀 때는 exact full-local 대상과 백업을 확인하고 큐·permit을 비운 뒤,
새 정책·artifact·앱 descriptor·credential을 함께 전환해야 한다. 과거 SQL을 그대로
재활성화하지 말고 당시 DB 정책과 credential generation을 다시 확인한다.
`deploy:dev`의 worker 제한과 정식 installer의 release authority 검사는 유지한다.
DB reset, 이전 generation 복원, 기존 artifact hash만 덮어쓰는 복구는 하지 않는다.

## 이전 검증 기록

2026-09-15 `qIR8fZC9cBs`에서 Sol selector는 성공했다. Astra final은 일반 출력에서
잘못된 JSON을 반환했고 structured final은 300초를 초과했다. 같은 선택 프레임과
프롬프트로 Sol structured final을 실행해 유효한 레시피 1개, 재료 15개, 단계 11개를
확인했다. 이 기록은 9월 18일 전체 앱 접수·저장 재검증을 의미하지 않는다.
