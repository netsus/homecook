# Product Superseding Draft Policy Post-Isolation Independent Rereview

- PR: `#1324` — `fix(workflow): preserve product gates for clean successor history`
- independent rereviewer task: `019fea50-4b36-74b1-ad8c-1e2ec77937b9`
- coordinator source task: `019fe028-be31-76f2-a5a7-986000a93374`
- reviewed base: `b2bfd818dc26f2f2539d3f88128b16759b91656d`
- reviewed base tree: `2d7335c44a6fab3c01544549d2ff7207af2832c9`
- reviewed input head: `a365caa6f7fe8af17c555f01cb301ee0462110f2`
- reviewed input tree: `10fd39d6b185d5e2860c8c4cc0f3a82879587f88`
- actor policy: author, repair task, prior reviewers와 다른 fresh independent final code rereviewer; GPT-5.6-Sol/high; Claude 사용 없음

## Verdict

`APPROVE`

Required unresolved findings: `0`.

- Critical: `0`
- Important: `0`
- Suggestion: `0`

코드와 회귀 테스트 기준으로 과거 `I-001`~`I-004` 및 Suggestion은 모두 해결되었다. 다만 reviewed input head의 GitGuardian `neutral`은 green이 아니므로 이 head의 check inventory를 merge proof로 사용하지 않는다. 이 보고서 publication successor head에서 새로 시작된 모든 check가 `success` 또는 정책상 의도된 `skipped`로 terminal인 경우에만 이 APPROVE를 최종 merge-supervisor proof로 사용한다.

## Finding Closure

### I-001 — closed

- `docs/omo-closeout-<slice>`는 숫자 시작 여부가 아니라 `git-policy.mjs`의 public lowercase hyphenated slug grammar를 사용한다.
- `docs/omo-closeout-wave1-port-discovery-detail`은 `omo-closeout / wave1-port-discovery-detail`로 해석되고 canonical Wave1 branch와 같은 non-empty gate 결과를 낸다.

### I-002 — closed

- canonical `feature/be-*`와 `feature/fe-*`는 기존 kind/slice를 유지한다.
- exact single trailing `-superseding-draft`만 canonical kind/slice로 투영된다.
- 독립 probe에서 empty `be|fe`, double hyphen, uppercase, underscore, nested path, extra suffix, repeated suffix 8종이 모두 throw로 fail-closed했다.
- `menu-superseding-notes`, `supersedingly-simple`, 일반 `-superseding`/`-superseding-ready` slug는 recovery로 오분류되지 않는다.
- `fix/*`는 product kind/slice를 얻지 못한다.

### I-003 — closed

- workpack, closeout strict mode, exploratory QA, authority, real-smoke, Wave1, OMO GitHub work-item inference, PR Ready/current-vs-future consumer가 canonical/successor parity 회귀 테스트로 잠겼다.
- OMO `createPullRequest()`는 backend successor head에서도 canonical `.workflow-v2/work-items/<slice>.json`을 참조한다.
- backend successor는 canonical backend와 같은 non-Draft Ready 및 real-smoke gate를 받는다.

### I-004 — closed

- `tests/real-smoke-presence.test.ts`의 canonical/successor missing-evidence fixture는 `PR_BODY`, `PR_BODY_FILE`, `GITHUB_EVENT_PATH`, `SOURCE_PR_BODY` 네 source의 원값을 snapshot한 뒤 삭제한다.
- callback이 정상 종료하거나 assertion/validator가 예외를 던져도 `finally`에서 각 원값을 정확히 복원한다. 원래 unset이던 key는 다시 삭제하고, 값이 있던 key는 원값을 재설정한다.
- production `readPullRequestBody()` precedence와 validator runtime은 변경하지 않았다.
- 실제 PR #1324의 valid body를 외부 `PR_BODY`로 주입한 `tests/real-smoke-presence.test.ts` focused run이 `9/9` green이었다.

### Prior Suggestion — closed

- `package.json`의 `test:product-superseding-draft-policy:focused`가 관련 consumer 10파일을 한 명령으로 고정하며 exact input head에서 `175/175` 통과했다.

## Canonical Product Gate And Bypass Review

- canonical과 successor는 동일한 workpack resolution, closeout strictness, exploratory QA, authority, real-smoke, Wave1, OMO GitHub, PR Ready gate를 받는다.
- arbitrary `-draft`는 canonical workpack을 빌리지 못한다.
- base 대비 commit validator, `.github/workflows/policy.yml`, required gate semantics의 완화가 없다.
- allowlist, skip env, head-only commit range, PR body/label product override가 추가되지 않았다.
- public slug authority는 `git-policy.mjs`, recovery 의미는 `product-branch-context.mjs`, consumer routing은 `validator-shared.mjs`로 분리돼 있다.

## #1321 Authority Integration Preservation

- PR `#1321` merged baseline은 reviewed base `b2bfd818dc26f2f2539d3f88128b16759b91656d`다.
- `scripts/lib/validate-authority-evidence-presence.mjs` blob은 base와 reviewed head가 동일하다: `95666b20ce3296afeb0e46fcaef048f63c6b12a2`.
- `tests/authority-evidence-presence.test.ts` blob도 동일하다: `ff68e4432877311025154d8dd459b068b64efcc5`.
- authority + product parser 직접 회귀는 `2 files / 53 tests` green이었다.
- #1321의 mixed evidence semantics를 우회하거나 재정의하는 변경은 없다.

## Five-Axis Review

- Correctness: exact recovery suffix만 canonical product context를 얻고 malformed refs는 fail-closed한다. 모든 지정 consumer parity와 I-004 ambient isolation을 직접 재검증했다.
- Readability & simplicity: shared slug/parser 경계가 작고 명시적이며 consumer별 중복 regex를 줄였다.
- Architecture: branch grammar, product recovery semantics, consumer resolution의 책임이 분리되어 있다.
- Security: 입력 검증은 강화됐고 body/label/env 우회, secret/auth/API/DB surface 추가는 없다.
- Performance: 짧은 branch string에 대한 선형 regex/string 검사뿐이며 application runtime, UI bundle, network path 영향은 없다.

## Independent Verification

- `pnpm install --frozen-lockfile` — pass; dependency/lockfile 변경 없음.
- dedicated regression: `3 files / 54 tests` pass.
- focused package script: `10 files / 175 tests` pass.
- external valid `PR_BODY` injected real-smoke focused run: `1 file / 9 tests` pass.
- backend Ready/current-vs-future: `1 file / 5 tests` pass.
- #1321 authority + product parser: `2 files / 53 tests` pass.
- public branch policy direct run: `1 file / 21 tests` pass.
- malformed/canonical/successor/fix independent branch probe: pass.
- full Vitest: `536 files passed, 28 skipped / 5,715 tests passed, 372 skipped`.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm build` — pass; 78 static pages generated and production build completed.
- changed `.mjs` files `node --check` — pass.
- `git diff --check base..input-head` — pass.
- `pnpm validate:branch` — pass.
- `pnpm validate:commits` — `Commit messages OK (8)` for full base..input-head range.
- PR body, workpack, workflow-v2, source-of-truth sync, OMO bookkeeping, closeout sync, exploratory QA, authority evidence, real-smoke, Wave1 validators — pass in PR context.

## Scope, Commit Range, And PR Body

- base 대비 변경은 governance docs, shared parser/consumer, regression tests, focused package script, 독립 review evidence에 한정된다.
- dependency 추가/제거와 `pnpm-lock.yaml` 변경은 없다.
- base..input-head 8 commits는 Conventional Commits subject와 Lore context/trailers를 갖고 full range validator를 통과했다.
- PR body는 required sections, change type, scope, docs/security/performance/design N/A 근거, recovery tuple, test plan, actual verification, merge gate를 포함하고 validator를 통과했다.
- 제품 #11 구현, PR #1323, Ready 상태, merge, Discord, production/staging/remote data는 이 리뷰의 변경·실행 범위가 아니다.

## Reviewed Input-Head Checks

reviewed input head `a365caa6f7fe8af17c555f01cb301ee0462110f2`의 raw check-runs는 `18/18` terminal이었다.

- success: `15`
- intentional skipped: `2` — `lighthouse`, `full-regression`
- neutral: `1` — `GitGuardian Security Checks` check-run `93368049501`, completed `2026-08-10T06:21:10Z`; 일부 resource가 없어 검사를 완료하지 못했으며 secret finding은 보고되지 않음
- pending / running / failure / cancelled: `0 / 0 / 0 / 0`
- legacy commit status contexts: `0`

GitGuardian `neutral`은 green이 아니다. 따라서 reviewed input head는 final merge proof가 아니며 publication successor의 fresh all-started-check inventory가 필요하다.

## Publication Boundary And Remaining Risk

- 이 task는 이 report 한 파일만 additive commit/push한다.
- implementation/test repair, Ready 전환, merge, PR #1323, Discord, production mutation을 수행하지 않는다.
- report content에 report 자체 commit SHA를 self-reference할 수 없으므로 publication successor의 exact head/tree와 terminal raw check aggregation은 최종 task handoff가 기록한다.
- remaining code risk: 없음.
- remaining operational gate: publication successor head에서 새로 시작된 모든 check가 terminal `success` 또는 정책상 의도된 `skipped`인지 확인. `neutral`, pending, running, failure, cancelled, rerun이 하나라도 있으면 이 APPROVE를 merge 근거로 사용하지 않는다.

## Next Handoff

merge supervisor는 publication successor exact tuple과 current-head raw check inventory를 다시 대조한 뒤에만 Draft 해제 또는 merge 판단을 수행한다. 이 reviewer는 Draft 해제와 merge를 수행하지 않는다.
