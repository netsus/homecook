# Acceptance Checklist: wave1-prototype-repair

> Prototype repair는 service porting 전 단계다. 체크는 실제 prototype 수정, smoke, screenshot, closeout evidence가 생긴 뒤에만 한다.

## Repair 0: Navigation And Return Context

- [x] MEAL_SCREEN -> RECIPE_DETAIL -> back이 원래 끼니 화면으로 복귀한다.
- [x] MENU_ADD option -> destination -> back이 식사추가 modal 열린 PLANNER 상태로 복귀한다.
- [x] MYPAGE shopping history -> SHOPPING_DETAIL -> back이 장보기기록 화면으로 복귀한다.
- [x] MYPAGE recipebook list -> RECIPEBOOK_DETAIL -> back이 레시피북 목록으로 복귀한다.
- [x] Mobile shell과 desktop shell에서 같은 return context 규칙을 적용한다.

Evidence:

- `prototype Repair 0 navigation smoke OK`
- `prototype Repair 0 desktop navigation smoke OK`

## Repair 1: Modal And Interaction Fixes

- [ ] MENU_ADD의 레시피북/팬트리 추천/남은요리/유튜브 가져오기 option이 modal로 열린다.
- [ ] Save Modal이 레시피북 다중 선택을 지원한다.
- [ ] Save Modal에서 이미 저장된 책은 해제, 저장 안 된 책은 추가로 표현된다.
- [ ] Planner add modal에 취소 버튼이 있다.
- [ ] Planner add modal의 recipe info에 선택 인분이 실시간 표시된다.
- [ ] MANUAL_CREATE 재료 수량 입력은 숫자만 허용한다.
- [ ] SHOPPING_DETAIL 장보기 완료 후 pantry reflect modal이 열린다.
- [ ] Pantry add modal은 이미 보유한 재료를 disabled로 표시하고 중복 추가하지 않는다.
- [ ] Bundle Picker 취소 버튼 텍스트가 가로로 렌더된다.

## Repair 2: Screen Visual Corrections

- [ ] HOME 재료 검색 modal은 search input 아래 가로 category chip rail과 filtered ingredient list를 가진다.
- [ ] HOME recipe card는 별점 대신 조회수를 보여준다.
- [ ] HOME recipe card tag는 MVP처럼 recipe 요약 정보를 보여주고 인분/조리시간 중복을 피한다.
- [ ] RECIPE_DETAIL hero metric은 이미지 오른쪽 아래에 붙고 흰 배경 없이 흰 icon/text + shadow로 보인다.
- [ ] RECIPE_DETAIL `완료` label은 `요리완료`로 바뀐다.
- [ ] RECIPE_DETAIL 칼로리 정보가 제거된다.
- [ ] Login social login CTA가 viewport에서 잘리지 않는다.
- [ ] PLANNER week rail은 일주일 날짜 카드 가로 스크롤과 sticky behavior를 가진다.
- [ ] PLANNER date chip click이 해당 날짜 영역으로 scroll한다.
- [ ] PLANNER meal card는 emoji를 제거하고 recipe image/servings를 표시한다.
- [ ] PLANNER 한 끼니에 2개까지 보이고 초과분은 `+1`처럼 표시하며 row height가 커지지 않는다.
- [ ] PLANNER `+음식`은 `+`로 변경되고 색상 충돌이 줄어든다.
- [ ] SHOPPING_DETAIL Step2 title은 날짜가 먼저 나온다.
- [ ] Completed shopping detail의 공유 버튼 왼쪽 `완료` 상태 표시는 제거된다.
- [ ] COOK_MODE 상단 recipe title이 더 크게 보인다.
- [ ] PANTRY `구매` category가 제거된다.
- [ ] MYPAGE recipebook card의 recipe count와 description 위치/디자인이 switch된다.
- [ ] LEFTOVERS 이동 버튼 텍스트가 `다먹은 요리`, `남은 요리`로 표시된다.

## Repair 3: Functional Logic Fixes

- [ ] RECIPE_DETAIL `요리하기`는 플래너 추가 없이 요리모드로 진입한다.
- [ ] HOME recipe card 우측 상단 저장 버튼은 Save Modal을 연다.
- [ ] SETTINGS nickname change가 prototype state에 반영된다.
- [ ] SETTINGS meal column은 최대 5개를 넘지 않는다.
- [ ] SETTINGS 환경설정에 저장/취소 버튼이 있다.
- [ ] LEFTOVERS에서 planner add 후 해당 남은요리가 사라지지 않는다.

## Repair 4: Freeze And Service Porting Gate

- [ ] Repair 0~3 PR이 모두 merged됐다.
- [ ] Fixed prototype commit SHA가 closeout note에 기록됐다.
- [ ] 320px/390px screenshot evidence가 남아 있다.
- [ ] Navigation smoke evidence가 남아 있다.
- [ ] Modal behavior smoke evidence가 남아 있다.
- [ ] `index.html`과 `homecook-baemin-prototype.html` 정합성 확인이 통과했다.
- [ ] 이후 service Slice A~F porting prompt가 fixed prototype commit SHA를 reference로 명시한다.

## Guardrails

- [ ] Prototype repair 동안 MVP service source를 수정하지 않는다.
- [ ] API/DB/status/endpoint/field를 새로 추가하지 않는다.
- [ ] 새 dependency를 추가하지 않는다.
- [ ] Prototype의 broken/demo-only behavior를 service porting 기준으로 남기지 않는다.
