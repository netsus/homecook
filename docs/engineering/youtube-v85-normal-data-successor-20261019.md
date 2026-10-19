# v85 원인 미확정 일반 데이터의 정확한 별도 승계 준비

사용자는 10월18일 웹 복구 뒤 일반 데이터 변경의 테이블·컬럼·주체를 입증하지 못한 한계를 받아들이고, 현재 정확한 데이터를 보존하는 별도 전환 준비를 승인했다. 원인을 정상 조회수나 인증 갱신으로 분류하지 않는다. 이번 결정은 실제 자격 발급 확인이나 OS 사용자 확인을 제거하지 않는다.

## 현재 관측과 한계

10월19일06:14:53/06:17:02 UTC 수집에서 일반 데이터41개 테이블 건수·지문은 10월18일 보존 자료와 같다. 전체 보호 관측에서 일반 데이터와 그 합성 지문 외 추가 차이0, 별도 auth/marketing/YouTube10개 테이블 차이0다. 웹15/DVzl4n, 실제39019/39025, worker49750/gen49, DB232, 추출43개/원42개, 시작8키와 R2 OFF, 원 승인3개가 유지됐다. 로컬·공개 로그인HTTP200이다. 이들은 관측 시점의 사실이며 이후 변화까지 보증하지 않는다.

- 원 d397 normal SHA: `17d6d3792943b8648abc4e0150d13af53835061a94aa4e0828d4d7e00fa1bbde`
- 명시적으로 받아들이는 정확한 현재 normal SHA: `8cc1d4eec34783f0fdecc60c4b9a4d62d52fc02acb0f70a8958737c1b203503b`
- 현재41개 table/count/hash 배열 SHA: `4e7aaeb21489b86b67edee4bb10cb8637b1420af135be522ebfe779cc7766d80`
- d397 원본 파일 SHA: `d3979df6deca56efa906655fef86d29b1ec96e9e473f69625486e6a40594212e`

당시41개 개별 지문·행 원본은 없어 변경 테이블/컬럼/주체는 미확정이다. 공개 레시피 상세 GET은 view_count를 바꾸는 코드 경로가 있지만 실제 원인이라는 요청 증거는 없다. 기록된 홈·로그인·개인정보·manifest smoke 후 전체 DB 검사는 성공했다. 조사한 DB232 유지보수 백업은10월15일이며 이번 차이를 분리할 수 없다. 원본 백업을 읽거나 복원하지 않았다.

## 원 승인 보존과 정확한 네 번째 결속

원 plan(b887), continuation(cf5), d397 파일과 각각의 독립 Keychain anchor는 그대로 읽고 검증한다. 새 `normal-data-successor-plan-20261019.json`과 고정 계정 `approved-normal-data-successor-20261019-sha256`만 create-only로 추가하는 경로다. 기존 service/원 계정/activation 계정은 바꾸지 않는다. 준비/check는 이 파일이나 anchor를 운영 디렉터리에 게시하지 않는다.

dataSuccessor를 뺀 현재 캡슐에서 허용하는 차이는 `before.normalDataSha256`, `before.full.normalDataSha256`, `before.full.preservedRowsSha256`, `continuation.dataDeltas` 네 곳뿐이다. 원 d397 canonical SHA와 옛 normal/preserved SHA를 고정해 정확한 전임자를 재구성하고, 기존 original/continuation/auth validator 및 실제 원3파일과 대조한다. 다른 필드 변경이나 재귀 data successor는 거부한다. 큰 전임 계획을 다시 중첩하지 않아 기존524288바이트 읽기 한도를 유지한다.

현재41개 table/count/hash는 같은 READ ONLY repeatable-read snapshot에서 기존 DB232의 전체 컬럼 chunk SQL로 수집한다. PostgreSQL JSONB 배열의 동일 합성으로 normal SHA를 확인하고, 원 d397의 auth10 및 동일 ledger와 합성해 full preserved SHA도 검증한다. 이41개 배열과 집계는 위 고정값만 허용한다. 이후 변화는 전체 preimage 검사에서 다시 중단하며 자동 재기준화·보호 컬럼 제외는 없다.

도구는 원 d69 checkout을 변경하지 않는다. 별도 tool base `9e6c5c8163fac47816477a3733d61bda37b269b9`의 자손에서 승인/관측/검사/문서에 한정한 완전한 파일별 전후 SHA와 clean toolRef를 캡슐에 결속한다. 웹 target15와 평가된 worker1be5/artifact38은 그대로다. historical rotation 검증은 data→d397→cf5로 풀어 원 capsule을 유지한다.

## 실행 경계와 중단 처리

`prepare-data-successor TARGET NEW_TMP_DIR`는 정확한 d397/원3anchor, gen50 미발급, 현재41/auth10/전체 DB, 기존49 launcher/PID, 이미 전환된 웹15 state/plist/PID/실제 시작8키/OFF, 봉인 candidate를 확인하고 임시 검토 캡슐만 만든다. `check-data-successor PLAN SHA`는 같은 승인 전 조건을 읽기 전용으로 다시 확인한다.

새 승인 게시와 실제 apply/resume에는 기존 실제 macOS Terminal의 `V85-GEN50` 입력을 각각 요구한다. OS Keychain 승인이 필요하면 사용자가 직접 처리한다. 자동 입력·가짜 PTY·승인 우회는 없다. 새 권한 승인은 운영 디렉터리에 create-only publication marker→정확한 파일→네 번째 anchor 순서다. 중간 실패, 파일/marker/anchor 누락, anchor만 남은 상태 또는 OS 읽기 거부는 중단한다. 이전 승인 반환 직전에도 게시 흔적을 다시 검사한다. 부분 게시를 확인한 뒤 같은 검토 캡슐의 실제 사용자 승인으로만 보완할 수 있다.

worker는 extraction-only gen50, manager는 같은 발급자/대상/정확 scope에서 최대300초이며 원 만료 `2026-10-22T14:27:30Z`를 연장하지 않는다. 등록49→50은49를 무효화한다. 실패 시 기존 reconciliation 후 확인된 동일50만 처리하고51/재발급/49 복귀는 하지 않는다. 데이터 복원·DB/권한 변경·C05/R2 활성화·요리 배포·새 모델 호출은 이번 준비에 없다.

다음 필수 단계는 검토 완료 캡슐의 실제 사용자 Terminal 승인 후 같은 toolRef에서 apply하는 것이다. 준비 완료는 네 번째 승인·발급·worker 전환 성공을 뜻하지 않는다.

검증: 관련 Vitest6개 suite200개, 회전 bridge Node31개, 타입·변경 파일 lint·diff 검사가 통과했다. 독립 보안 재검토에서 지적된 부분 게시 fallback race 및 잔존 네 번째 anchor의 모든 이전 반환 경로를 보완했고, 추가 필수 blocker는 없다. 실제 준비/check 결과는 정확한 toolRef·캡슐SHA와 함께 보고하며 승인·발급 완료와 구분한다.
