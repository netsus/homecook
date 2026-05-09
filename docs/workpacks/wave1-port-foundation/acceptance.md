# Acceptance Checklist: wave1-port-foundation

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] AppShell이 `bottomTabsMode="default"` / `"hidden"`과 `headerMode="default"` / `"hidden"` 조합에서 올바르게 렌더된다 <!-- omo:id=accept-appshell-modes;stage=4;scope=frontend;review=5,6 -->
- [ ] BottomTabs shared 4탭(홈/플래너/팬트리/마이)이 모든 route에서 일관되게 렌더된다 <!-- omo:id=accept-bottom-tabs-render;stage=4;scope=frontend;review=5,6 -->
- [ ] Button이 primary/secondary/neutral/destructive variant와 sm/md/lg size에서 CTA 위계가 명확하다 <!-- omo:id=accept-button-cta-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [ ] Chip이 filter/selection variant에서 active/inactive 상태가 시각적으로 구분된다 <!-- omo:id=accept-chip-active-state;stage=4;scope=frontend;review=5,6 -->
- [ ] Card가 interactive/loading 변형에서 hover/active/loading 상태가 일관되게 작동한다 <!-- omo:id=accept-card-variants;stage=4;scope=frontend;review=5,6 -->
- [ ] Modal/Sheet이 ModalHeader + ModalFooterActions 조합에서 footer label이 정합하다 <!-- omo:id=accept-modal-footer-label;stage=4;scope=frontend;review=5,6 -->
- [ ] Sort dropdown primitive가 stateless하게 옵션 목록을 렌더하고 선택을 콜백으로 전달한다 <!-- omo:id=accept-sort-dropdown-render;stage=4;scope=frontend;review=5,6 -->
- [ ] SelectionChipRail이 horizontal scroll에서 잘림 없이 모든 chip을 탐색할 수 있다 <!-- omo:id=accept-chip-rail-scroll;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 공용 primitive가 disabled/loading/active/inactive 상태를 올바르게 반영한다 <!-- omo:id=accept-primitive-states;stage=4;scope=frontend;review=5,6 -->
- [ ] production 승인 토큰(`--brand`, `--brand-deep`, `--olive`, `--surface`, `--muted` 등)만 사용하고, prototype mint/Jua/asset은 사용하지 않는다 <!-- omo:id=accept-approved-tokens-only;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 컴포넌트의 public API(props interface)가 breaking하게 변경되지 않는다 <!-- omo:id=accept-no-breaking-api;stage=4;scope=frontend;review=5,6 -->
- [ ] AppShell의 5개 필수 상태 지원이 소비자에게 올바르게 위임된다 (loading/empty/error/read-only/unauthorized) <!-- omo:id=accept-state-delegation;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] EmptyState가 적절한 아이콘, 제목, 설명, 액션 버튼으로 렌더된다 <!-- omo:id=accept-empty-state-render;stage=4;scope=frontend;review=5,6 -->
- [ ] ErrorState가 기본 제목("문제가 발생했어요"), 메시지, 재시도 버튼으로 렌더된다 <!-- omo:id=accept-error-state-render;stage=4;scope=frontend;review=5,6 -->
- [ ] Skeleton이 적절한 width/height/rounded로 로딩 중 placeholder를 제공한다 <!-- omo:id=accept-skeleton-render;stage=4;scope=frontend;review=5,6 -->
- [ ] ContentState가 error/empty/gate/loading tone에서 각각 적절한 시각을 보여준다 <!-- omo:id=accept-content-state-tones;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] API endpoint, DB schema, status value, public field가 추가되지 않는다 <!-- omo:id=accept-no-contract-change;stage=4;scope=frontend;review=6 -->
- [ ] 새 npm dependency가 추가되지 않는다 <!-- omo:id=accept-no-new-dependency;stage=4;scope=frontend;review=6 -->

## Design Authority / Visual Evidence

- [ ] mobile 390px에서 공용 primitive가 overflow 없이 렌더된다 <!-- omo:id=accept-mobile-default-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 320px에서 공용 primitive가 overflow 없이 렌더된다 <!-- omo:id=accept-mobile-narrow-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] 카드 border-radius 16px, 버튼 border-radius 8px, 터치 타겟 최소 44x44px 기준이 준수된다 <!-- omo:id=accept-radius-touch-target;stage=4;scope=frontend;review=5,6 -->
- [ ] Sort dropdown이 touch-friendly하고 44px 이상 터치 타겟을 가진다 <!-- omo:id=accept-sort-dropdown-touch;stage=4;scope=frontend;review=5,6 -->
- [ ] Screenshot evidence가 Stage 4 완료 시 생성된다 <!-- omo:id=accept-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture / mock 없이 순수 컴포넌트 렌더 테스트가 가능하다 <!-- omo:id=accept-no-fixture-needed;stage=4;scope=frontend;review=6 -->

## Automation Split

### Vitest

- [ ] Button, Chip, Card, Badge, EmptyState, ErrorState, Skeleton, ContentState 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-primitives;stage=4;scope=frontend;review=5,6 -->
- [ ] Sort dropdown primitive 렌더 및 콜백 테스트가 존재한다 <!-- omo:id=accept-vitest-sort-dropdown;stage=4;scope=frontend;review=5,6 -->
- [ ] AppShell mode 조합 렌더 테스트가 존재한다 <!-- omo:id=accept-vitest-appshell;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] 공용 primitive가 실제 브라우저에서 mobile-chrome, mobile-ios-small 프로젝트에서 overflow 없이 렌더된다 <!-- omo:id=accept-playwright-primitives;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- dev server에서 390px/320px에서 공용 primitive 시각 품질 확인
- Sort dropdown의 backdrop dismiss, 키보드 접근성(Escape) 확인
- 각 primitive의 hover/active/focus 시각 피드백 확인
