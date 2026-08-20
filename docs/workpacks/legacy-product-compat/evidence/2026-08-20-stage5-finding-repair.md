# Stage 5 finding repair — 2026-08-20

## Scope

- workpack: `legacy-product-compat` (#13)
- source Draft PR: [#1371](https://github.com/netsus/homecook/pull/1371)
- repair author task: `01a01e01-0a0e-7f70-97dd-2e6c8f0012af`
- reviewed input head/tree: `deacb8038641f6ec3f2c63abc3c506eb74aed4cc` / `20e47a9f600e1bebc8528d2213649419c838e398`
- repair commit/tree/parent: `31a2b9394df031a7dee84e692cbd399d77044853` / `6873b140bb0471ed4995339a193845820c263e5e` / `deacb8038641f6ec3f2c63abc3c506eb74aed4cc`
- Stage 5 approval: independent task `01a01e3b-663e-7252-9c3c-0c7b30251c0e` APPROVE at exact `387f1d688204061c28b60c415135a70e42a07042` / tree `e0d887e487ad237a87fa6b3d67238d2dac045ce7`, drift `0`

## Finding

Delete failure kept the confirmation open, row and pinned detail intact, but the existing error message rendered in the inert planner body behind the active dialog. The active destructive context had no visible alert.

## RED → GREEN

- component RED: active confirmation `within(dialog).getByRole("alert")` absent — `1 failed / 5 passed`.
- Playwright RED: `confirm.getByRole("alert").toBeVisible()` absent — `1 failed`.
- minimal GREEN:
  - local confirmation error state consumes the existing thrown `Error.message` contract;
  - dialog body renders `role="alert"` with existing danger tokens;
  - failure restores focus to the existing close button ref after the pending submit loses focus;
  - planner body error state/rendering is removed to avoid hidden duplicate feedback.

## Verification

- component: `6/6`
- focused legacy component/client/store: `3 files / 17 tests`
- exact legacy Playwright: `14/14`, including the in-test `390x844`, `320x693`, `1280x900` matrix
- lint: pass
- typecheck: pass
- `pnpm verify:frontend:pr`: pass — product `2,757/175`, build 81 pages, smoke `62/10`, core a11y `8/1`, core visual `12/12`
- full gate split: retained Stage 4 clean full gate at `a591ebafa619a992b52a9a576e41e7a45b18f011`; current repair did not rerun or claim full `verify:frontend`

## Preserved boundaries

- no new public status, error, action, screen, route, field, endpoint, dependency, or visual redesign
- pinned row/detail, duplicate pending block, Escape, nested focus restore and 390/320/desktop overflow contract retained
- Design Status is `confirmed`; `authority_required=false`, 새 authority artifact 없음
- Stage 6 remains an independent pending review
- Manual/device/AT/server-Mac/OAuth/cutover/activation remain pending
