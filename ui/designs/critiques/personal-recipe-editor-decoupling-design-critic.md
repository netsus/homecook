# personal-recipe-editor-decoupling — Stage 4 사전 디자인 크리틱

- 검토 역할: 독립 Codex `design-critic`
- 검토 시점: Stage 4 production 구현 전
- 검토 기준: workpack state matrix/wireframe, `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, mobile UX, anchor extension 규칙
- 판정: 조건부 승인 — 구현 시작 가능
- finding: blocker 0 / major 4 / minor 2

## 승인된 방향

- `planner-add`와 standalone editor context의 저장·복귀 의미를 분리한다.
- `RECIPE_DETAIL`의 기존 `[플래너에 추가] [요리하기]`를 primary로 유지하고 fork/edit는 secondary, delete는 별도 destructive tertiary로 둔다.
- 다른 사용자 private, deleted, quarantined 상태는 CTA와 존재를 fail-closed로 숨긴다.
- dirty guard는 모든 이탈 경로가 같은 `계속 편집 | 변경사항 버리기` 확인을 사용한다.
- managed image는 `image_object_id`를 내구 identity로 사용하고 브라우저 Storage 직접 삭제를 허용하지 않는다.

## Stage 4에서 닫아야 하는 Major

1. 와이어프레임의 활성 예정 CTA와 현재 capability-off dark ship을 분리한다. 실제 기본 상태는 CTA와 진입 경로를 숨기고, 활성 fixture는 테스트·증거에서만 별도로 검증한다.
2. dirty discard 중 owner image cancel이 실패하면 화면을 닫은 것으로 처리하지 않는다. 진행·실패·재시도·포커스 복원을 제공한다.
3. 320px에서 primary 2-button row → secondary → destructive 순서, 44px 터치 영역, 키보드와 sticky submit 비충돌을 실제 화면으로 검증한다.
4. 오래된 화면 설계의 Storage cleanup·색상 설명보다 현재 workpack과 화면정의서 `0-D`를 우선한다. 브라우저 Storage `.remove()`와 오래된 직접 색상값을 되살리지 않는다.

## Minor

- 삭제 확인에는 soft delete와 기존 계획·요리·기록 보존 설명을 넣고 destructive action의 포커스 순서를 검증한다.
- 이미 표시 중인 안전한 detail/draft가 있으면 오류 시 전체 내용을 지우지 않고 재시도 가능한 오류를 함께 보여준다.

## 완료 조건

이 문서는 implementation-start approval이다. Stage 5 디자인 승인이 아니다. Stage 4 완료 전 390px/320px screenshot evidence와 독립 product-design-authority 검토에서 blocker/major가 0이어야 한다.
