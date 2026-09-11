# Stage 4 retained evidence

이 폴더와 `ui/designs/evidence/marketing-demand-validation-round2/stage4/`는 저장소에 보존한 검증 근거다. `manifest.json`의 상대 경로와 SHA256을 기준으로 읽는다. 원문 안의 `.omx`·임시 작업 공간·이전 Stage 절대 경로는 당시 실행 출처를 설명하며 단독 canonical proof가 아니다.

- `verify-frontend-pr-final.log`: 마지막 UI 수정 후 정식 PR 빠른 gate 전체 exit0. 전체제품7827/환경skip516,3기기 core65/11/15 PASS.
- `real-ui/result.json`: 원형 Next/API/새DB24조건. `real-ui-recovery-after/result.json`: 마지막 수정 후 실제오류2조건·단일재시도·입력보존·중복0.
- `final-production-preview/result.json`: code c00fa23f의단독production build·복사tree680파일동일·31PASS·68실제캡처.
- `baseline/`, `baseline-visual/`: exactbase에서도실패한기존화면의원문/이미지. PASS/N/A면제가아니다. 전체실패/첫타이밍실패와재실행을각log로구분한다.
- `stage3-input/`: 선행독립Stage3사본과서버/공용계약/SQL9파일의동일성. Stage4에서기존396SQL assertion을다시실행했다고주장하지않는다. 변경된session helper는Stage4에서별도로재검증했다.
- `ui/`·`client/`·`review/`: RED→GREEN·보조리뷰. 독립Stage5/authority/Stage6승인은아니다.
- 실제탐색과eval: `.artifacts/qa/marketing-demand-validation-round2/stage4-20260911/`. 보고서평가99는coverage품질평가이며디자인점수가아니다.

보존된 log/text는 ANSI 표시 제어와 줄끝 공백만 정리했다. `log-normalization.json`은 원본 hash와 보존 hash를 구분하며 원본은 `.omx/artifacts/r2-stage4/`에 유지한다. 이미지와 JSON 실행 결과를 성공으로 고치거나 baseline을 갱신하지 않았다.

실제provider/실기기/운영activation/배포·DB적용·메일·광고는 실행하지 않았다. Stage4는 Draft 인계까지이며 독립승인과모든currenthead검사를통과한Ready/merge를자기선언하지않는다.
