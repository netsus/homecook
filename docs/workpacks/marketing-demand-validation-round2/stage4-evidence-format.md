# R2 Stage4 authority 증거 형식 매핑

변경 분류: docs-governance 형식 호환. 기준: `origin/master`의 `7312a0cc9cfe1f500d896eb806e4d533a4f068b9`.
공식 [r2.1 계약](../../marketing-demand-validation-r2-contract.md) §2~4·9~10, [README](README.md)의 Design Authority, [acceptance](acceptance.md), [16화면 매핑](../../../ui/designs/R2_SCREEN_MAPPING.md), [authority SOP](../../engineering/product-design-authority.md)를 그대로 유지한다.

## 변경 이유와 경계

`scripts/lib/validate-authority-evidence-presence.mjs` 전체를 확인했다. 이 검증기는 `stage4_evidence_requirements`의 안전한 repo-relative `.json`을 비시각 증거 참조로, 그 밖의 지원 토큰을 시각 참조 이름의 matcher로 해석한다. 기존 서술문6개는 경로/토큰으로 해석돼 실제 의도를 표현하지 못한다.

배열은 아래 여섯 JSON 경로로만 바꾸고, 원문6개와 각 의미는 이 문서에 정확히 보존한다. `mobile-default`/`mobile-narrow` 토큰만 남기면 trace·복원·200%·환경·독립 역할을 잃으므로 선택하지 않았다. 지원되지 않는 fragment/절대경로/markdown 문서 경로를 배열에 넣지 않는다. authority_required, required_screens, authority_report_paths, reviewer 권한, validator, 제품 계약은 변경하지 않는다.

중요한 한계: 현재 검증기는 JSON 내용이나 관찰의 진실성을 파싱·검증하지 않는다. regular repo-local 파일 존재, authority report의 `> evidence:` 참조, 존재하는 runtime snapshot과의 참조 일치를 검사한다. 따라서 `{}`, 체크리스트 복사, 원문 요구만 넣은 JSON, 가짜 pass는 **실제 검증 증거가 아니다**. 형식 검사 GREEN과 아래 의미 충족·독립 reviewer 판단은 별개다. 이 변경은 실제 FE 증거 파일이나 authority 보고서를 생성하지 않는다.

## 원문6개: 순서·문자열 그대로 보존

아래는 기존 배열의 정확한 값이다. 문장이나 적용 범위를 대체하거나 축약하지 않는다.

```json
[
  "Follow ui/designs/R2_SCREEN_MAPPING.md for R2_RECORDING_* and R2_HOMEFLOW_* variants, eight generator docs and eight R2_*-critique.md inputs.",
  "Capture actual implemented routes in both topics and all eight screens; include 320x568, 390x844, 393x852 and desktop.",
  "Retain browser traces, request/response assertions and screenshots for solo activities, all six orders, reload, two tabs, two topics and completed-state preservation.",
  "Retain keyboard, focus, safe-area, scroll, reduced-motion, text enlargement and loading/error/empty/read-only evidence.",
  "Keep preview mock, isolated integration, actual provider and physical-device evidence separately identified.",
  "Use distinct Codex task IDs for Stage 4 author, Stage 5 reviewer, final product-design-authority and Stage 6 reviewer; static boards are not runtime authority."
]
```

## 원문과 기계 참조의 1:1 대응

아래 경로는 저장소 root 기준이다. 현재 파일이 있다는 주장이나 테스트 완료 표시가 아니라 FE 증거 생산자의 인수 경로다.

| 원문 | stage4_evidence_requirements의 exact 참조 | 실제로 담아야 할 관찰 |
| --- | --- | --- |
| 1 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-screen-coverage.json` | 16 canonical 화면별 실제 구현 관찰과 route/topic, generator8개·critic8개 대응, 실행·캡처 근거 |
| 2 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-viewport-coverage.json` | 양 topic의16화면 × 320×568 / 390×844 / 393×852 / 실제 desktop viewport의 캡처 매핑과 관찰 |
| 3 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-flow-traces.json` | 각 topic의 단독3활동·완료6순서, reload/두 탭/두 topic/완료 보존 실행의 trace·request/response assertion·스크린샷 |
| 4 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-accessibility-observations.json` | keyboard/focus/safe-area/scroll/reduced-motion/**200% 글자 확대**/loading/error/empty/read-only의 실제 관찰 및 원래 범위의 캡처·측정 |
| 5 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-environment-provenance.json` | preview mock / isolated integration / actual provider / physical-device를 분리한 실제 실행·미실행·한계와 증거 출처 |
| 6 | `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-review-independence.json` | 실제 Stage4 작성/Stage5 검토/final authority/Stage6 검토 task·시점·대상 SHA·보고서의 provenance와 역할 독립성. 미실행 단계는 그대로 표시 |

## FE가 생산할 JSON의 공통 기록

아래는 증거 파일의 기록 항목이며 공개 API/DB 필드나 새 제품 계약이 아니다. 기존 관찰 로그를 이 항목으로 정리할 수 있지만 실제 실행 없이 내용을 채우면 안 된다.

- `requirement_id`: 위 원문 순서 1~6, `source_requirement`: 해당 정확한 원문 문자열.
- `subject_head_sha`: 해당 관찰·검토의 실제 대상 FE exact head. 증거 파일 자체가 포함될 미래 commit SHA를 미리 만들어 넣지 않는다. 이후 PR head와 다르면 실제 source/compiled-tree 비교와 reviewer 근거로 연결한다. `producer_task_id`: 이 증거를 정리한 실제 작성 task.
- `source_runs`: 실제 실행별 run ID, 실행 명령(비밀 제거), 시각, 실행 환경 분류, 실제 캡처 source SHA, 종료 결과, 원본 artifact refs. 캡처 SHA와 검토 head가 다르면 코드/compiled-tree parity 등 실제 비교 근거를 연결하며 같은 head라고 바꾸어 쓰지 않는다.
- `observations`: 실제 관찰 행. 각 행은 아래 개별 내용과 관련된 실행·원본 참조를 포함하고, 해당 test/관찰의 expected/observed/result를 구분한다. `not_run` 행은 관찰 성공 행으로 세지 않는다.
- `not_run`, `limitations`: 원래 단계에서 아직 실행하지 않은 범위·차단 사유·후속 소유자/기존 gate를 숨기지 않는다. 모두 pending인 목록만으로 실제 FE coverage를 충족했다고 하지 않는다.
- 모든 파일 참조는 존재하는 원본에 연결한다. 스크린샷·trace ZIP·sanitized assertion JSON·review 보고서의 참조와 해당 파일의 SHA256 등 provenance를 남긴다. JSON manifest를 만든다는 이유로 trace/스크린샷 자체를 생략하지 않는다.
- 실제 개인 이메일·token·cookie·page context·bootstrap key·IP·secret 원문을 증거에 넣지 않는다. 기존 계약의 redaction·테스트 fixture 정책을 유지한다.

### 1. 화면 coverage

`observations`는 `R2_RECORDING_`와 `R2_HOMEFLOW_` 각각 MENU / EXAMPLE / EXAMPLE_DONE / SURVEY / SURVEY_DONE / LEAD / LEAD_DONE / RECOVERY, 총16 ID를 누락 없이 식별한다. 각 행에 topic, 실제 route, 화면의 도달/상태 관찰, 공유 generator·critic 경로와 해당 부분, 실제 캡처/실행을 연결한다. `R2_SCREEN_MAPPING.md`를 복사한 요구 목록만으로는 충족하지 않는다. 8개 공유 파일 수를16개 실제 화면 관찰 수로 오인하지 않는다.

### 2. 네 viewport coverage

각16 ID의320×568·390×844·393×852·desktop을 구분한다. desktop은 실제 width/height를 기록하고 `desktop`이라는 문자열만 넣지 않는다. 각 셀의 실제 캡처와 환경·source SHA·도달 상태를 연결한다. 하나의 모바일 이미지/정적 Stage1 도면을 다른 크기/화면까지 대표하는 증거로 쓰지 않는다. 기존 README의 initial/scroll/CTA 및 관련 상태 관찰 범위는 유지한다.

### 3. 흐름·저장·복원

각 topic의 example / survey / lead 단독 완료3가지와 `example→survey→lead`, `example→lead→survey`, `survey→example→lead`, `survey→lead→example`, `lead→example→survey`, `lead→survey→example` 완료6순서를 각각 식별한다. 시작 순서 목록만으로 완료 순서 검증을 대체하지 않는다.

reload, 두 탭, 두 topic, 다른 활동/메뉴 이동과 확인된 완료 보존을 실제 실행 결과로 연결한다. 원래 acceptance의 cookie_resume·저장소 실패·410 명시 재시작·낮은 revision·재제출 방지·오류 복구 조건을 이 형식 변경으로 빼지 않는다. 각 행에는 trace와 실제 request/response assertion(예상 결과와 관측값), 스크린샷 원본 참조가 있어야 한다. mock으로 얻은 결과는 mock이라고 표기하고 실제 저장/복원 증거로 확대하지 않는다.

### 4. 접근성·상태 관찰

기존 README/acceptance에서 정한16화면·viewport 및 적용 상태 범위를 그대로 따른다. keyboard와 focus는 구분하고, 실제 입력창이 없어 소프트 키보드가 해당하지 않는 화면은 이유를 기록한다. 이 경우에도 focus·Tab 순서·읽기 순서 검증을 면제하지 않는다. safe-area, 자연스러운 세로 scroll/CTA 접근, reduced-motion, 200% 글자 확대의 조건과 관측을 명시한다.

loading / error / empty / read-only 각각 원본 관찰과 연결한다. 200%를 단순 viewport 축소, 스크린샷 확대나 deviceScaleFactor만 바꾼 것으로 대체하지 않는다. 실제 적용 방법과 관측값을 기록한다. 정적 설계 좌표와 실제 브라우저 측정을 구분한다. 해당 없음/미실행/실패는 통과로 바꾸지 않는다. 새로운 UI 상태나 검증 면제는 추가하지 않는다.

### 5. 환경의 분리

네 분류 `preview-mock`, `isolated-integration`, `actual-provider`, `physical-device`를 명시적으로 구분한다. 실제 수행한 분류에는 실제 run·대상/격리 provenance·산출물·한계를, 미수행 분류에는 `not_run`과 기존 Manual Only/후속 gate를 기록한다. preview/isolated 결과를 실제 provider나 물리 기기 결과로 합치지 않는다.

이 형식 수정은 실제 provider·운영 DB·광고·배포 실행을 요구하거나 허가하지 않는다. 외부/운영 항목은 기존 acceptance와 운영 승인 순서를 유지한다. 미실행을 정직하게 기록하는 것이 전체 검증 완료나 기존 gate 면제를 뜻하지 않는다.

### 6. 독립 역할의 근거

Stage4 작성자, Stage5 검토자, final product-design-authority, Stage6 검토자를 각각 식별하고, 배정/실행된 task ID들은 서로 달라야 한다. 실제 역할·검토 대상 SHA·실제 보고서/조정자 인계 근거를 연결한다. 동일 작업의 subagent는 독립 Stage task로 세지 않는다.

아직 배정/실행하지 않은 final authority 또는 Stage6는 task ID/실행 결과를 발명하지 않고 null 및 pending/not_run, 다음 소유 단계로 표시한다. 이는 해당 단계의 독립성 요구를 해제하거나 지금 그 단계를 완료했다는 뜻이 아니다. 실제 배정·검토 시 서로 다른 task ID와 증거를 채우고 해당 gate에서 확인한다. 미래 검토를 Stage4에서 먼저 수행하도록 순서를 바꾸지 않는다. 정적 Stage1 보드는 runtime authority로 사용하지 않는다.

## authority report와 runtime 연결

FE 생산자는 위 exact 경로6개를 실제 기록으로 생성한다. reviewer는 자신의8개 authority report를 직접 수정하되 기존 이미지 증거를 유지한다. 모든 report의 `> evidence:` 블록에서 추출되는 참조의 합집합에 위6개 JSON이 포함되어야 한다. 각 report는 자신의 실제 시각 근거도 가져야 하며 JSON만으로 visual evidence 요구를 대체할 수 없다.

지원되는 표기 예시는 아래와 같다. 이는 서식 설명이며 해당 파일의 존재/관찰 완료 주장이 아니다.

```markdown
> evidence:
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-screen-coverage.json`
```

나머지5개도 각각 동일한 exact 경로로 참조한다. 실제 runtime snapshot이 존재하고 authority_required라면 담당 소유자가 `design_authority.evidence_artifact_refs`에 이6개 JSON을 포함하고 실제 report refs와 동기화한다. runtime의 report paths도 automation의 기존8개 paths와 일치시킨다. 이 문서 작성 작업은 runtime/보고서/승인 상태를 직접 수정하지 않는다.

검증기는 repo root 밖 경로, symlink 및 symlink parent를 JSON 증거로 인정하지 않는다. `.json#fragment`, 임의 절대경로, raw markdown 링크를 기계 배열 값으로 쓰지 않는다. 문서나 정적 요구 목록 파일을 `.json`으로 이름만 바꾸어 넣지 않는다.

## 형식 검증과 실제 FE 인수 경계

strict 검증은 `BRANCH_NAME=feature/fe-marketing-demand-validation-round2`, `PR_IS_DRAFT=false`로 수행한다. 별도 `/tmp` fixture에서 수정 전6문장 RED, 수정 후 실제 regular JSON fixture와 올바른 evidence block으로 GREEN을 확인할 수 있다. fixture의 모든 산출은 테스트 전용이며 제품 screenshot·흐름·승인 증거로 제출하지 않는다.

실제 FE는 이 PR과 별도로 JSON6개를 실제 run으로 생산하고, reviewer의 블록 표기 수정 및 해당 runtime sync 후 strict validator를 다시 실행해야 한다. 실제 증거가 없거나 의미가 미충족이면 pending/failure를 유지한다. 이 문서나 fixture GREEN으로 현재 FE authority 승인/Ready/merge를 선언하지 않는다.

## 이번 형식 수정에서 실행한 확인

- FE exact head `783ae392c648ed43d481e2166c6f42f0cc0a7912`를 확인하고 실제 FE tree에 대해 위 strict 환경의 검증 함수를 읽기 전용으로 호출했다. 오류14개 중 기존6문장 관련6개를 재현했다. 나머지8개 report 표기 오류는 별도 reviewer 소유이며 이 작업에서 수정하지 않았다.
- 원문6개는 기준 commit의 배열과 JSON decode 후 문자 단위로 동일함을 비교했다. 새6경로는 순서대로1:1 대응하며 automation의 다른 필드는 모두 동일하다.
- `/tmp`의 테스트 전용 파일로11개 형식 사례의 기대 결과를 확인했다. 원문6개 RED6, 새 경로지만 파일 없음 RED6, regular JSON+보고서 참조 GREEN0, 보고서 참조 누락 RED1, symlink RED1, 경로 이탈 RED1, runtime 동기화 GREEN0, runtime 필수 참조 누락 RED1, runtime 보고서 경로 불일치 RED1, 정상 fixture 복구 GREEN0, 빈 JSON도 내용 검사 없이 통과하는 기존 한계 확인이다.
- fixture JSON과1픽셀 이미지는 파일 참조 검사용 합성 데이터이며 실제 브라우저 관찰·provider 결과·독립 authority 보고서가 아니다. 제품 증거 경로에 빈 JSON이나 합성 fixture를 추가하지 않았다.
- PREVIEW/브라우저/DB/실제 provider/광고/배포 실행0. 의미 충족은 FE의 실제 원본 증거와 독립 reviewer가 후속 확인해야 한다.
