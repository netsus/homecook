# Acceptance Checklist: baemin-prototype-home-porting

## Happy Path

- [x] HOME에 prototype AppBar, hero greeting, search pill이 렌더된다 <!-- omo:id=home-port-hero;stage=4;scope=frontend;review=5 -->
- [x] inline ingredient chip rail이 렌더되고 chip 선택 시 URL/API query에 `ingredient_ids`가 반영된다 <!-- omo:id=home-port-inline-chips;stage=4;scope=frontend;review=5 -->
- [x] `더보기` chip이 기존 `IngredientFilterModal`을 연다 <!-- omo:id=home-port-more-chip-modal;stage=4;scope=frontend;review=5 -->
- [x] theme carousel, promo strip, all recipes section이 HOME에서 렌더된다 <!-- omo:id=home-port-sections;stage=4;scope=frontend;review=5 -->
- [x] HOME 전용 bottom tab이 렌더되고 기존 shared bottom tab은 `/`에서 숨겨진다 <!-- omo:id=home-port-bottom-tab;stage=4;scope=frontend;review=5 -->
- [x] `RecipeCard`가 16:9 thumbnail, badge, bookmark, title, meta, tag pills 구조를 가진다 <!-- omo:id=home-port-card;stage=4;scope=frontend;review=5 -->

## State / Policy

- [x] 검색 debounce 300ms가 유지된다 <!-- omo:id=home-port-search-debounce;stage=4;scope=frontend;review=5 -->
- [x] loading / empty / error 상태가 유지된다 <!-- omo:id=home-port-states;stage=4;scope=frontend;review=5 -->
- [x] HOME 조회는 비로그인 가능 상태를 유지한다 <!-- omo:id=home-port-public-access;stage=4;scope=frontend;review=5 -->

## Contract / Data

- [x] API endpoint, DB schema, status value, public field가 추가되지 않는다 <!-- omo:id=home-port-contract-unchanged;stage=4;scope=frontend;review=5 -->
- [x] backend에 없는 rating/minutes/emoji는 API 변경 없이 frontend fallback view model로만 처리한다 <!-- omo:id=home-port-fallback-view-model;stage=4;scope=frontend;review=5 -->
- [x] 새 dependency를 추가하지 않는다 <!-- omo:id=home-port-no-dependency;stage=4;scope=frontend;review=5 -->

## Automation

- [x] `pnpm exec vitest run tests/home-screen.test.tsx tests/recipe-card.test.tsx` 통과 <!-- omo:id=home-port-vitest-targeted;stage=4;scope=frontend;review=5 -->
- [x] `pnpm lint` 통과 <!-- omo:id=home-port-lint;stage=4;scope=frontend;review=5 -->
- [x] `pnpm typecheck` 통과 <!-- omo:id=home-port-typecheck;stage=4;scope=frontend;review=5 -->
- [x] `pnpm test:product` 통과 <!-- omo:id=home-port-test-product;stage=4;scope=frontend;review=5 -->
- [x] `pnpm test:e2e:smoke` 통과 <!-- omo:id=home-port-e2e-smoke;stage=4;scope=frontend;review=5 -->
- [x] `pnpm test:e2e:a11y` 통과 <!-- omo:id=home-port-e2e-a11y;stage=4;scope=frontend;review=5 -->
- [x] `pnpm test:e2e:visual` 통과 <!-- omo:id=home-port-e2e-visual;stage=4;scope=frontend;review=5 -->

## Manual Only

- 3000번 dev server에서 HOME visual 확인 완료
- Discord 완료 알림 전송 확인
