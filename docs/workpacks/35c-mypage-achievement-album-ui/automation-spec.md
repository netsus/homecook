# Automation Spec: 35c MYPAGE Achievement Album UI

## Vitest

- `tests/mypage-achievement-album.test.tsx`
  - profile header integration
  - grade / achievement / notification modal behavior
  - tutorial category behavior inside the achievement album
  - new user `Clay · Lv.1` state
  - archive modal soft-fail isolation
- `tests/mypage-growth-profile.test.tsx`
  - existing growth profile regression
- `tests/mypage-screen.test.tsx`
  - MYPAGE profile/stat integration regression
- `tests/user-gamification-api-client.test.ts`
  - gamification additive fields and archive API consumption

## Playwright

- `tests/e2e/slice-35c-mypage-achievement-album.spec.ts`
  - mobile 320/390 profile layout
  - desktop 1440/1920 profile layout
  - grade, achievement, achievement tutorial category, notification panels
- `tests/e2e/slice-33c-gamification.spec.ts`
  - 33c badge/quest/toast/loading/empty/unauthorized regression on the new integrated profile surface

## Evidence

35c visual evidence is written to:

- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-320-profile.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-390-profile.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/desktop-1440-profile.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/desktop-1920-profile.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-grade-modal.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-achievement-tutorial-category.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-achievement-modal.png`
- `ui/designs/evidence/35c-mypage-achievement-album-ui/mobile-notification-archive-modal.png`

## Required Closeout Commands

```bash
pnpm vitest run tests/mypage-achievement-album.test.tsx tests/mypage-growth-profile.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test tests/e2e/slice-35c-mypage-achievement-album.spec.ts tests/e2e/slice-33c-gamification.spec.ts
pnpm lint
pnpm typecheck
pnpm build
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 35c-mypage-achievement-album-ui
git diff --check
```
