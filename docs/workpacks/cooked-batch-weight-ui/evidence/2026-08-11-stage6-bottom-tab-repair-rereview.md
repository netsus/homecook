# cooked-batch-weight-ui — fresh independent Stage 6 bottom-tab repair rereview

> 검토 역할: fresh independent Stage 6 repair rereviewer
> 검토 task ID: `019fed15-5be6-7070-bcbb-7fcc8b51046a`
> 검토일: 2026-08-11
> PR: #1323, OPEN / Draft / `full-ci` / CLEAN / MERGEABLE
> reviewed exact publication head: `cbddeb6d2f1dd56b6c1f96d62eed1e03be3b8393`
> reviewed exact publication tree: `afbc04f20d554c1c9a0615be7cf401435493af0d`
> exact base: `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`
> reviewed PR body SHA-256: `444167382d491e64b0ff5615527636d9a8396f254463c0c61d3e57fa15023752`
> reviewed inventory: 64 changed files / 20 commits

## Verdict

**APPROVE**

- P0: **0**
- P1: **0**
- P2: **0**
- unresolved required findings: **0**
- HOLD 조건: **없음**

새 4파일 제품·테스트·보고서 repair와 별도 PNG 9장 + manifest 1개 evidence successor는 요구된 모바일 동작을 고치며 기존 승인 계보와 계약 경계를 보존한다. 이 판정은 위 exact publication tuple만 대상으로 한다. 이 보고서를 싣는 successor publication head를 스스로 재검토하지 않으며, product design authority를 대체하거나 Ready 전환, merge, 전체 lifecycle 완료 또는 activation을 승인하지 않는다.

## 독립성, actor 및 lineage

- repair author task: `019fecd2-1318-7870-b1a5-8b7397047599`
  - commit: `f5ae86896a0f35258015fce68d958e3d6d13a8fb`
  - tree: `725ddf3b92c45a2d2c45b43c4592c72ebc2daec0`
  - parent: `13f60890a4bcd81d1927cfe96637d8bad9070a4f`
- separate evidence task: `019fecee-01d2-7f60-991b-39c8e34fd3bc`
  - source commit: `db18c0f064b127f597b024dc047390cd10f4d783`
  - evidence tree: `afbc04f20d554c1c9a0615be7cf401435493af0d`
  - generator implementation head/tree: `a44b3df8e16117af02ca56e398d6656f50683964` / `725ddf3b92c45a2d2c45b43c4592c72ebc2daec0`
  - `a44b3df8...`와 author commit `f5ae8689...`는 같은 tree이며 scoped four-file diff도 0이다.
- integration task: `019fecf7-0ffb-70d2-b15f-3175a14894bc`
  - integrated publication commit: `cbddeb6d2f1dd56b6c1f96d62eed1e03be3b8393`
  - parent: `f5ae86896a0f35258015fce68d958e3d6d13a8fb`
  - integrated tree: `afbc04f20d554c1c9a0615be7cf401435493af0d`
- this rereviewer is not the author, evidence generator, integration author, Stage 4/5/final authority actor, Ready actor, merge actor, or lifecycle authority.
- prior Stage 4, Stage 5, final authority, Stage 6, Ready-repair, policy/Linux visual, fixture repair 및 closeout 승인 계보는 보존했다. 이번 검토는 그 계보를 다시 발행하거나 대체하지 않고 새 bottom-tab repair/evidence successor만 독립적으로 판정했다.

## Exact repair inventory와 계약 보존

Author repair `13f60890... → f5ae8689...`는 정확히 다음 4파일이다.

1. `app/leftovers/page.tsx`
2. `components/leftovers/leftovers-screen.tsx`
3. `tests/e2e/slice-16-leftovers.spec.ts`
4. `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-11-mobile-ios-small-bottom-tab-overlap-repair.md`

Evidence successor `f5ae8689... → cbddeb6d...`는 아래 표의 PNG 9장과 `manifest.json` 1개뿐이다. 이 두 구간에는 route handler, migration, RPC, server helper, API 문서, screen registry, auth, public type 또는 dependency 파일 변경이 없다. `package.json` SHA-256 `41a758136aa63738b3423774281a787233c41317f7a398bdf5b2ea349590c755`와 `pnpm-lock.yaml` SHA-256 `f30af919f9a0ac06fc9d7597a93070f16464f4488d56d9cf1e879780f123ff67`는 repair 전후가 동일하다.

- API/status/error/action/screen/auth 계약: **unchanged**
- #9 meal-log backend ownership: **preserved**
- #12 consumed-amount UI ownership: **not preclaimed**; 신규 consumed/meal-log CTA 없음
- dependency: **none added/removed/changed**
- legacy LEFTOVERS와 cooked-batch projection: 별도 section과 별도 action eligibility 유지
- read-only/ownership/unauthorized 경계: 완화 없음

## 제품·상호작용 재검토

### 단일 route bottom tab과 overflow

- `/leftovers`는 `AppShell bottomTabsMode="hidden"`으로 shared tab을 제거하고 route-owned `Wave1MobileBottomTab` 한 개만 렌더링한다.
- mobile content는 `100dvh`, 64px tab, `--space-5`, safe-area를 반영한 bounded scroll region을 사용한다. 실제 E2E는 `[data-slot="bottom-tab-container"]` count를 정확히 1로 단언한다.
- 320px·390px에서 legacy `[플래너에 추가]`, `[다먹음]`은 44px 이상이며 tab 상단에서 최소 16px 떨어진다.
- 테스트는 action center와 bottom interior point의 `document.elementFromPoint`가 실제 target 또는 그 자식인지 확인한다. 보이는 척하는 force click, pointer-through, timeout 또는 assertion skip은 없다.
- 클릭 뒤 exact `/api/v1/leftovers/*/eat`와 `/api/v1/planner?...` request log가 각각 정확히 1회 증가한 뒤 UI 결과를 검사한다. 즉 hit testing과 request issuance를 함께 증명한다.
- 320/390/1440 horizontal overflow runtime assertion은 모두 0이며, 원본 캡처에서도 잘린 card·sheet·CTA 또는 중복 navigation을 발견하지 않았다.

### familiar sheet, CTA와 상태 계약

- COOK_MODE와 LEFTOVERS는 기존 `AppBottomSheet`의 내부 scroll, fixed footer, safe-area, pending dismiss lock, focus restore 패턴을 유지한다.
- ready/loading/empty/error/read-only/unauthorized/pending/replay 상태 경계가 automation spec과 component/E2E tests에 남아 있다.
- known은 권위 있는 finished/remaining grams와 조정·버림만, missing은 delayed weight/unweighed close만, unrecoverable은 gram restore/reversal 없이 close만 노출한다.
- legacy-null은 missing 또는 depleted로 변환되지 않는 read-only 기록으로 남는다.
- depleted는 weighted/unweighed 6개 reason을 text로 구분하고 일반 gram/reopen/consume CTA를 노출하지 않는다. exact current closure cancel만 허용하고 generic reopen은 없다.
- 409는 retained input과 recovery summary를, 422는 retained official field와 alert focus/`aria-describedby` linkage를 증명한다. pending duplicate lock과 same-key replay도 유지된다.
- destructive discard/negative adjustment와 unweighed close는 familiar second-confirmation summary 및 no grams/no nutrition/no meal-log consequence를 보존한다.

## 원본 크기 evidence 직접 검사

아래 변경 PNG 9장을 모두 `view_image(detail="original")`로 직접 열었다. thumbnail, 파일명 또는 manifest만으로 판정하지 않았다.

| PNG | dimensions | SHA-256 | 직접 확인 |
| --- | ---: | --- | --- |
| `COOK_MODE-before-mobile-narrow-320.png` | `320×568` | `d40348c2c49055d692d361d368df152b9b8f7cb4c50d58814fca4d889785155d` | familiar completion sheet, stacked CTA, clipping 없음 |
| `COOK_MODE-desktop-state-matrix.png` | `1440×1000` | `7e91fa91ab205d4be7af8c0bd2b7a5fa11500c84cf240538beb8aa829af82ca1` | desktop containment와 known state |
| `COOK_MODE-mobile-default-390-known.png` | `390×844` | `12decd919b030c41812f5bfc5c04fdea84cf16c5973deb81371f4cb1027db64d` | known sheet, footer, safe containment |
| `LEFTOVERS-before-mobile-default-390.png` | `390×844` | `5d63ec26b1ac5c8c4f0d547a9a3e38abccbfc5562fe50b048f0fb4380ff82fc8` | single bottom tab과 legacy action hierarchy |
| `LEFTOVERS-before-mobile-narrow-320.png` | `320×568` | `0ff35e8a518f078640fb327af4dfa7d5beb50d87bb7afb0bf292de5a92a54e20` | 320px single tab, action/tab 분리, no clipping |
| `LEFTOVERS-desktop-state-matrix.png` | `1440×2127` | `8dec10b68cc6a521a50eceaefdab775ddc485bb431f0244156a9bb552268fcbd` | legacy와 batch section, known/missing/unrecoverable/legacy-null/depleted |
| `LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png` | `390×844` | `8451217504cfb80d4d4883fd01aa68b5dc5336c8f2b116df5239882ccfa8aa70` | action sheet와 irreversible consequence summary |
| `LEFTOVERS-mobile-default-390-legacy-null-depleted.png` | `390×844` | `d84a940b2758c98d26b9141106c319ee35ebe34205d274023f2d78b82c6247dd` | legacy-null read-only와 depleted eligibility |
| `LEFTOVERS-mobile-narrow-320-actions.png` | `320×568` | `1804bc8af374ae7e38aa3bfd1782b5e138ea824f2068c15321aa859d9fb7bf23` | 320px action sheet CTA, no bottom-tab obstruction |

- generator SHA-256: `26adda22b8170eaef3488e15fdcec0c91475a2cd66136a52a2a0fbbbd44d822c`
- manifest SHA-256: `8bf683c01b0d5c6b61155ee244f626fb246f83764e9f7d8c0107556445968134`
- manifest: `captured_at=2026-08-10T18:34:02.621Z`, implementation head/tree `a44b3df8...` / `725ddf3b...`, viewport matrix `320/390/1440`, PNG 15 + runtime JSON 2 exact inventory
- nine PNG dimensions/hashes, manifest implementation tree, evidence diff 10-file inventory 및 generator provenance가 모두 일치한다.

## 독립 verification

| 검증 | 결과 |
| --- | --- |
| focused #11 component/unit tests | `7 files / 21 tests passed` |
| full `slice-16-leftovers.spec.ts`, `mobile-ios-small` + `mobile-chrome` + `desktop-chrome`, retries 0 | `34 passed / 2 intended project skips` |
| authority evidence presence validator | passed |
| closeout sync validator | passed |
| exploratory QA evidence validator | passed |
| worktree / diff | clean; `git diff --check` passed |

Focused E2E 결과에는 390px exact geometry probe, 320px mobile project의 real hit testing, eat/planner request 1회 발행, guest auth gate와 legacy navigation regression이 포함된다. 이 재검토 task는 evidence generator를 다시 실행하거나 PNG를 수정하지 않았다.

## Exact-current-head GitHub checks

Reviewed head `cbddeb6d...`의 raw check runs는 **18 = 17 SUCCESS + 1 intended SKIPPED**이고, canonical unique contexts는 **15 = 14 SUCCESS + 1 intended SKIPPED**이다. pending/fail/cancel/rerun은 모두 0이다.

- Actions runs 7개는 모두 `status=completed`, `conclusion=success`, `run_attempt=1`이다: `31420941365`, `31420940986`, `31420691947`, `31420691899`, `31420691904`, `31420691944`, `31420688652`.
- QA run `31420691947`: completed / success / attempt 1.
- full-regression job `93560726043`: success, `949 passed / 172 skipped / 4 flaky`, terminal failure 0.
- visual job `93560726046`: success, `23 passed / 22 skipped`.
- accessibility job `93560726035`: success, `18 passed / 15 skipped`.
- smoke job `93560726079`: success, `58 passed / 10 skipped / 1 flaky`.
- Draft `lighthouse` job `93560727300`: intended skipped.
- GitGuardian, CI quality/build/hybrid-authority/security-function-authorization, Security Smoke, QA changes, Policy, labeler 및 template-check도 terminal success다.

Green CI는 제품 authority를 대체하지 않는다. 여기서는 exact-current-head repair/evidence publication에 실패·pending·cancel·rerun이 없고 required full-regression/visual이 success인지 확인하는 Stage 6 입력으로만 사용했다.

## 제한과 미완료 경계

Mock screenshot과 자동화는 다음을 증명하지 못한다.

- 실제 OS virtual keyboard의 occlusion, scroll-to-field 및 focus timing
- 실제 physical keyboard Tab/Shift+Tab/Escape timing
- VoiceOver/TalkBack의 실제 reading order, accessible name/description 및 live announcement
- full WCAG conformance와 모든 page node의 contrast
- physical 320px/390px device, iOS/Android safe-area 및 browser chrome 변화
- server-Mac, OAuth, production/remote DB 및 실제 other-owner account
- R/R+1/R+2, broader Manual verification 및 capability activation

위 항목은 Manual/future pending이며 이번 `0/0/0` 판정으로 닫히지 않는다. PR #1323은 Draft로 유지한다. 이 report-only publication은 fresh independent Stage 6 verdict일 뿐 product design authority replacement, Ready 승인, merge 또는 lifecycle 완료가 아니다.
