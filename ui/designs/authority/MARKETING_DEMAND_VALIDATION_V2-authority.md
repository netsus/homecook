# MARKETING_DEMAND_VALIDATION_V2 authority precheck

> reviewer mode: Stage 4 implementer self-audit for evidence assembly only
> independent approval: required from separate Stage 5 / final-authority task
> screen: `MARKETING_DEMAND_VALIDATION_V2`
> source prototype: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
> evidence:
> - `ui/designs/evidence/marketing-demand-validation-v2/hero-a-b-c-d-default-320-390-desktop.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/quiz-q1-q4-320-390.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/four-results-390.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/experience-1-5-390.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/planner-homecook-393x852.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/planner-homecook-tomorrow-preview-393-320.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/packaged-food-and-planner-complete-393x852.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/planner-complete-tomorrow-preview-393-320.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/beta-form-keyboard-error-success-390.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/reduced-motion-and-visible-focus.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/turnstile-fail-closed-result-preserved.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/bundle-excludes-device-frame-selector-runtime.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/design-qa.md`
> - `ui/designs/evidence/marketing-demand-validation-v2/comparisons/hero-source-vs-port.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/comparisons/result-source-vs-port.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/comparisons/planner-homecook-source-vs-port.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/comparisons/beta-source-vs-port.png`
> - `ui/designs/evidence/marketing-demand-validation-v2/stage4-capture-manifest.json`

## Verdict

`hold`

이 문서는 독립 Stage 5 / final-authority reviewer가 읽을 evidence precheck다. 구현자는 자기 변경을 승인하지 않으므로 최종 verdict는 별도 task가 다시 내려야 한다.

## Scorecard

| 항목 | 점수 | 메모 |
| --- | --- | --- |
| mobile UX | 4/5 | 320/390/393/desktop evidence와 full funnel capture가 있고, app-owned 단일 세로 흐름과 CTA 위계가 유지된다. |
| interaction clarity | 4/5 | Hero→Q1..Q4→result→experience→planner→beta→done 흐름과 back/retry/disabled affordance가 자동화로 고정됐다. |
| visual hierarchy | 4/5 | 밝은 blue CTA, short result copy, TomorrowPreview 배치, planner summary 4종이 최신 prototype 방향과 일치한다. |
| color/material fit | 4/5 | `#00A1FF` 계열 app tokens, packaged-food label, result/share metadata, final mascots가 latest approved source를 따른다. |
| familiar app pattern fit | 4/5 | `/beta`를 isolated public surface로 유지하고 device frame/runtime을 배포에서 제외했다. |

## Findings

### Blocker

없음. Stage 4 evidence 기준에서 page-level horizontal overflow, device-frame leak, share query leakage, TomorrowPreview 위치 오류는 재현되지 않았다.

### Major

없음.

### Minor

- source/implementation comparison score는 `93/100`, threshold `90`을 통과했다. 이 수치는 independent Stage 5/final authority 승인을 대신하지 않으며 `.omx/state/marketing-demand-validation-v2/ralph-progress.json`과 scoped design-QA에 근거한다.

## What Was Checked

- Hero A/B/C/D/default와 `utm_content → ad_variant → default` 우선순위
- exact `q1..q4`, no `q5`, Q3-only four-result mapping
- result deep-link read-only preview와 opaque `/beta?result=<key>` metadata
- five-step experience fixture values `600→520`, `1200→1180`, `320g`, `487 kcal / 31g / 39g / 22g`
- planner_homecook / planner_complete TomorrowPreview 위치와 read-only `+`
- beta form validation, duplicate-safe single submit, done screen
- reduced-motion focus capture와 isolated `/beta` shell without device frame / selector / mobile runtime

## Remaining Manual Risks

- 실제 YouTube 썸네일 공개 권리 또는 replacement asset 확인
- 제품 이미지 사용 권리와 `제품 예시` / non-affiliation 표현 확인
- production Turnstile secret/hostname/action, canonical `/privacy`, allowed origin, edge rate-limit, retention, sender domain
- 실제 iOS Safari / paid-ads execution approval

## Next Review Handoff

- separate Stage 5 reviewer는 이 report의 `> evidence:` block과 `docs/workpacks/marketing-demand-validation-v2/acceptance.md`의 `review=5` 항목을 current head에서 다시 대조한다.
- final authority reviewer는 개별 capture, four source-vs-port comparisons, scoped `design-qa.md`, `stage4-capture-manifest.json`을 읽고 blocker/major/minor를 current head 기준으로 다시 계산한다.
