# HOME Prototype Porting — Authority Report

> Slice: `baemin-prototype-home-porting`
> Date: 2026-04-28
> Scope: HOME only
> Prototype: `ui/designs/prototypes/baemin-redesign/screens/home.jsx`
> Supersedes for HOME: `ui/designs/authority/HOME-parity-authority.md`

## Verdict

`baemin-prototype-home-parity`의 점수 산정에서 제외했던 prototype-only 요소를 HOME에 직접 승격한다.

이번 기준에서는 hero greeting, promo strip, inline ingredient chips, HOME 전용 bottom tab을 더 이상 HOME deficit 제외 항목으로 보지 않는다. 해당 요소는 포팅 대상이다.

## Implemented Surface

- `/`에서 shared header/bottom tab 숨김
- HOME prototype AppBar
- hero greeting
- prototype search pill
- inline ingredient chip rail
- theme carousel
- promo strip
- all recipes section
- HOME 전용 bottom tab
- prototype card 구조의 `RecipeCard`

## Preserved Contracts

- API endpoint 변경 없음
- DB schema 변경 없음
- status value 변경 없음
- 새 dependency 없음
- backend에 없는 card presentation 값은 frontend fallback view model로만 처리

## Verification Evidence

- `pnpm exec vitest run tests/home-screen.test.tsx tests/recipe-card.test.tsx`
  - 2 files passed
  - 13 tests passed
- `pnpm lint`
  - passed with existing warnings only
- `pnpm typecheck`
  - passed
- `pnpm test:product`
  - 41 files passed
  - 311 tests passed
- `pnpm test:e2e:smoke`
  - 344 passed
  - 4 skipped
- `pnpm test:e2e:a11y`
  - 6 passed
- `pnpm test:e2e:visual`
  - 12 passed
- `git diff --check`
  - passed

## Pending Evidence

- Discord completion notification send confirmation
