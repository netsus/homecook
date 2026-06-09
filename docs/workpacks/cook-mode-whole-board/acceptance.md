# Acceptance: cook-mode-whole-board

## Happy Path

- [ ] Planner COOK_MODE renders recipe title, servings, date/meal context when return context exists, total ingredient list, and all cooking steps. <!-- omo:id=happy-planner-render;stage=4;scope=frontend;review=5,6 -->
- [ ] Standalone COOK_MODE renders title, servings, standalone context, total ingredient list, and all cooking steps. <!-- omo:id=happy-standalone-render;stage=4;scope=frontend;review=5,6 -->
- [ ] Complete actions still open the consumed ingredient sheet and submit existing API contracts. <!-- omo:id=happy-complete-existing;stage=4;scope=frontend;review=6 -->

## State / Policy

- [ ] COOK_MODE has no servings adjustment UI. <!-- omo:id=policy-no-servings-adjust;stage=4;scope=frontend;review=6 -->
- [ ] Previous/next step controls are absent. <!-- omo:id=policy-no-step-nav;stage=4;scope=frontend;review=5,6 -->
- [ ] Step cards omit per-step ingredient extraction, heat, and duration. <!-- omo:id=policy-no-step-meta;stage=4;scope=frontend;review=5,6 -->
- [ ] Long recipes can scroll within the board without hiding completion/cancel controls. <!-- omo:id=policy-long-scroll;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] Session COOK_MODE unauthorized state remains unchanged. <!-- omo:id=error-session-auth;stage=4;scope=frontend;review=6 -->
- [ ] Standalone unauthenticated user can view data and sees login gate only when completing. <!-- omo:id=error-standalone-login-gate;stage=4;scope=frontend;review=6 -->
- [ ] Wake lock failure does not block reading or completing a recipe. <!-- omo:id=error-wake-lock-nonblocking;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [ ] Planner completion still updates only the selected cooking session path. <!-- omo:id=data-planner-complete;stage=4;scope=frontend;review=6 -->
- [ ] Standalone completion still does not create or mutate meals. <!-- omo:id=data-standalone-complete;stage=4;scope=frontend;review=6 -->

## Manual Only

- [ ] Real device wake-lock behavior should be rechecked before release because browser support differs by OS/browser.
