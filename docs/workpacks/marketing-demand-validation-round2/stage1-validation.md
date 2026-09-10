# Stage 1 재잠금 검증 기록

날짜: 2026-09-11 KST. 작성 task: `01a08c92-ec13-78a2-8071-681afe60527b`.
범위: 문서·JSON·workflow/checklist·정적 디자인. 독립 internal1.5 승인, Stage1 merge, 제품 구현 완료가 아니다.

## 입력·이력

- 승인 계약: [r2.1](../../marketing-demand-validation-r2-contract.md) @ `7f00e62c13572b5b2c0d54c997fe628f7a56567e`.
- 별도 계약 reviewer의 exact head: `24093c94ebf53676050353088f173ef7f6315445`, reviewer task `01a08c9d-2cf5-75c0-b409-b3a6ab2d265a`, 계약 unresolved required0.
- 기존 설계 보존 추가 commit: `8ebc243fb62f4a9afe2ea0dc97b9f0adf0ef39ac`.
- 선행 계약 반영 merge commit: `b9601841618697e329ea4e21f61cfdb7973cb810`; 부모에 위 보존 commit과 승인 계약 merge가 함께 있다. force-push/amend/rebase/reset을 사용하지 않았다.
- 아래 검증은 그 위의 재잠금 working tree에서 실행했다. 이 보고서와 함께 담기는 추가 commit의 exact head는 PR #1550 본문/조정자 인계에 기록한다. 보고서에 자기 commit SHA를 미리 만들어 넣지 않는다.

## 실행 결과

모든 명령은 저장소 root에서 실행한다. 명령이 package.json 또는 실제 파일에 존재하는 것을 확인했고 출력을 읽었다.

| 실제 명령 | 결과·의미 |
| --- | --- |
| `pnpm branch:start -- --slice marketing-demand-validation-round2 --role docs` | 동일 docs branch intent 재확인 |
| `pnpm branch:status` | checkout/recorded intent 일치, reassert 불필요 |
| `pnpm typecheck` | exit0, TypeScript 검사 통과. R2 제품 동작 검증은 아님 |
| `pnpm validate:source-of-truth-sync` | source-of-truth sync validation passed |
| `pnpm validate:workflow-v2` | workflow-v2 validation passed |
| `node scripts/validate-automation-spec.mjs --slice marketing-demand-validation-round2` | automation-spec validation passed |
| `pnpm validate:closeout-sync -- --slice marketing-demand-validation-round2` | closeout sync validation passed |
| `pnpm validate:authority-evidence-presence` | authority evidence presence validation passed. 현재 docs 단계의 구조 검사이며 runtime authority 승인 아님 |
| `pnpm validate:exploratory-qa-evidence` | exploratory QA evidence validation passed. 실제 탐색 QA 실행 아님 |
| `pnpm validate:omo-bookkeeping` | passed. 현재 validator의 숫자 접두사 대상 범위 때문에 r2 직접 검증으로 과장하지 않음 |
| `node docs/workpacks/marketing-demand-validation-round2/stage1-static-check.mjs` | 7개 범주 pass, failures0. 승인 Git object·공식5종 위임/JSON·계약/5상태·automation/자가승인 없음·16ID·상대 링크/공백·실제 evaluateDocGate 포함 |
| `node ui/designs/evidence/marketing-demand-validation-round2/R2_check-designs.cjs` | designChecks1070, relativeLinks260, actualFiles38, failures0. 정적 선언/파일 검사이며 runtime 검증 아님 |
| `pnpm validate:pr /tmp/homecook-r2-pr1550-body.md` | PR body sections OK. 게시할 본문 파일 검사 |
| `pnpm validate:branch` | docs/marketing-demand-validation-round2 허용 |
| `pnpm validate:commits` | 검사 시 최근20개 Conventional Commit 메시지 통과. 추가 commit 후 PR 범위는 `BASE_REF=origin/master pnpm validate:commits`로 다시 검사 |
| `git diff --check` | whitespace 오류 없음 |

증거용 도구 lint: `pnpm exec eslint docs/workpacks/marketing-demand-validation-round2/stage1-static-check.mjs ui/designs/evidence/marketing-demand-validation-round2/R2_render-static-boards.cjs ui/designs/evidence/marketing-demand-validation-round2/R2_sync-design-docs.cjs`는 exit0, 출력 오류/경고0이다. 초기 static checker의 console 경고1개는 stdout으로 변경한 뒤 해소했다. 디자인 작성 보조는 `R2_check-designs.cjs`까지 포함해 lint 통과를 기록했다.

문서 검사 결과는 [검사 코드](stage1-static-check.mjs)로 재현한다. 디자인 검사·직접 열어 본 11개 최종 PNG·SHA256·한계는 [디자인 검사 기록](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_visual-inspection-r21.json)에서 확인한다.

## 실패 확인과 수정

- 기존 PR template-check: [실패 job](https://github.com/netsus/homecook/actions/runs/34515436233/job/102999544256)의 실제 로그에서 `PR body is missing required sections`와 Summary/Workpack/Test Plan/QA 등 필수 헤더 누락을 확인했다. 템플릿 전체 필수 섹션을 새 본문에 넣고 PR validator로 통과시켰다.
- 초기 doc gate: 과거 README/acceptance 섹션·stage/scope metadata와 디자인의 primary CTA/scroll containment 누락을 발견했다. 새 문서의 review5 항목은 Stage4 frontend 소유로 맞추고 각 설계에 실제 기준을 명시했다. 이후 evaluateDocGate를 포함한 static check는 pass다.
- `pnpm validate:workpack -- --slice marketing-demand-validation-round2`는 **현재 Stage1 미병합 때문에 origin/master 선행 workpack을 찾지 못해 exit1**이다. 이 명령의 구현을 읽어 후속 feature/be·fe의 병합 선행 검사임을 확인했다. Stage1 로컬 내용 gate로 잘못 보고하거나 validator를 완화하지 않았다. docs branch의 인자 없는 실행은 no-op exit0이며 내용 검증으로 세지 않는다.
- 초기 정적 보드의 흰 글자 대비·WebP 미표시·완료 버튼 위계·미승인 카피·예시 결과 부재를 보완했다. 최종 화면별 보조 판단은 [설계 인계](../../../ui/designs/R2_DESIGN_HANDOFF.md)와 [mapping](../../../ui/designs/R2_SCREEN_MAPPING.md)의 critic 링크를 따른다.

## 시각·권한 한계

두 topic의8상태·네 문항·세 예시 장면·완료 보존을 정적 PNG/SVG11보드로 제공한다. 최종 메뉴 세 번째 선택지 하단은390폭512px/320폭508px, 지정 최소 터치44px, ink/blue 계산대비5.54:1이다. 도면은 전체 내용을 보여주도록 높이가 늘어나며 844px viewport screenshot이 아니다.

generator는11개 PNG를 직접 확인했다. 작성 리더도 recording390·homeflow설문320·양topic예시320 등 대표 보드를 직접 확인했다. 보조 critic은 각 report에 실제 본 범위를 기록한다. 이 증거는 실제 font/scroll/200%/키보드/focus/screen-reader/서버 저장·복원/보안 위젯 동작을 증명하지 않는다.

운영 코드·DB·migration 실행·배포·광고·메일·Discord를 수행하지 않았다. 실제 Supabase/RPC/retention/provider 테스트는 Stage2/4의 미완료 acceptance다. 외부 운영/권리/실기기만 Manual Only로 분리했다. 정적 디자인의 작성·보조 검토와 별도 Stage1 승인 및 runtime authority를 구분한다.

## 인계

기존 [Draft PR #1550](https://github.com/netsus/homecook/pull/1550)을 갱신한다. 작성 작업은 push 후 exact head의 시작된 CI를 확인·보고하고 merge하지 않는다. 현재 Stage1의 독립 internal1.5 reviewer가 이 재잠금 head를 검토한 뒤, 조정자가 merge 및 Stage1 완료 여부를 결정한다.

## 최종 보조 검토 범위

r2.1 동기화 후 design-critic 보조가 8개 화면을 모두 green/필수 미해결0으로 기록했다. 대표 PNG6개 직접 확인 범위이며, generator의11개 직접 확인과 구분한다. EXAMPLE 구체 결과 major는 닫혔다. 경미한 픽셀 차이와 실제 브라우저/키보드/모션/접근성은 Stage4 acceptance에 남긴다. 독립 docs gate/merge는 이 작성 작업의 권한이 아니다.

최종 패키지 명령은 조정자가 지정한 `corepack pnpm`(packageManager의10.32.1)을 사용한다. 앞 표의 plain pnpm 실행 이력은 그대로 보존하고, 최종 고정 버전 재실행 결과를 PR에 함께 보고한다.

## 고정 버전 최종 재검증

`corepack pnpm --version`은 **10.32.1**이다. 이 실행기로 typecheck, 증거용 도구4개 eslint, workflow-v2, source-of-truth-sync, closeout-sync, 게시용 PR body validation을 재실행해 모두 exit0을 확인했다. automation-spec Node 검사, Stage1 7범주 정적 검사, 디자인1070/링크260/실재파일38 검사도 재실행하여 실패0이었다. lint 경고도 없었다.

JSON 비교로 `.workflow-v2/status.json`의 r2 외 데이터가 `b9601841`과 같음을 확인했다. working diff는 지정한 workpack/index/workflow/R2 design·critic·evidence 경로뿐이며 `git diff --check`가 통과했다. 사용자 root 대시보드나 사용자 삭제 파일을 staging하지 않는다.

## PR 본문 갱신 전후 CI 기록

재잠금 commit `8c8d0ff270e2423d0a7e7555f5f824c818284322`를 push할 때 synchronize 이벤트가 이전의 불완전한 PR 본문을 캡처했다. run `34524991954`의 template-check는 필수 섹션 누락으로 실패했다. 본문 갱신 후 edited 이벤트 run `34525078231`의 같은 검사는 성공했다. `.github/workflows/pr-governance.yml`이 이벤트 시점의 `github.event.pull_request.body`를 검사함을 확인했다.

8c8d0ff2의 rollup에는 성공과 이전 실패가 함께 남았다. 이를 현재 head 전체 통과라고 보고하지 않고 이 검증 기록을 추가 commit하여, 이미 게시된 완전한 본문으로 새 head의 checks가 시작되게 한다. 이전 실패와 수정 경위는 이 기록 및 GitHub run에 보존한다. 최종 head/전체 check 결과는 PR 본문과 조정자 인계에서 보고한다.
