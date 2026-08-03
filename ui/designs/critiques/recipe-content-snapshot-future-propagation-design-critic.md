# recipe-content-snapshot-future-propagation 설계 리뷰

> 검토 대상: `docs/workpacks/recipe-content-snapshot-future-propagation/README.md#stage-1-wireframes`, `ui/designs/RECIPE_DETAIL.md`, `ui/designs/PLANNER_WEEK.md`, `ui/designs/COOK_MODE.md`
> 기준 문서: 요구사항 기준선 v1.7.28 / 화면정의서 v1.5.32 / 유저 Flow맵 v1.3.30 / API v1.2.34
> 검토일: 2026-08-03
> 검토자: design-critic (독립 Codex task)
> 검토 범위: Stage 4 구현 전 `RECIPE_DETAIL` impact dialog, 기존 요리 시작 surface, `legacy_v1 | snapshot_v2` COOK_MODE dispatch 상태 계약

## 종합 평가

**등급**: 🟡 조건부 통과 — Stage 4 구현 착수 가능

**BLOCKER**: **0**

**필수 non-blocker**: 6개 / **권장 사항**: 3개

**한 줄 요약**: Stage 1 계약은 두 전략, active claim, completed shopping 불변, start-before-navigation, 명시적 version dispatch와 v2 drain 경계를 충분히 잠갔다. 다만 초기 preview 오류, 무선택 저장 방지, 좁은 화면 dialog containment, terminal v2 read-only를 구현·증거에서 명시적으로 닫아야 한다.

BLOCKER 0인 이유는 현재 공식 문서와 workpack이 구현 결정을 내릴 만큼 상태와 우선순위를 고정했기 때문이다. 아래 필수 항목은 새 제품 계약이나 PLANNER_WEEK 구조 변경 없이 기존 계약을 안전하게 표현하는 구현 조건이다.

이 문서는 **구현 시작용 design critique**일 뿐이며 Stage 5 디자인 승인, `Design Status: confirmed`, `authority_precheck`, `final_authority_gate` 또는 다른 Stage의 독립 승인을 대신할 수 없다. 구현 head의 390px/320px screenshot 또는 Figma evidence와 별도 product-design-authority 판정이 여전히 필요하다.

## 크리티컬 이슈 (수정 필수)

없음. **BLOCKER 0**.

## 필수 수정 사항 (non-blocker, Stage 4에서 닫기)

| # | 위치 | 문제 | 수정 방향 / 완료 조건 |
|---|------|------|------------------------|
| 1 | impact preview 최초 loading/error/unauthorized | ASCII wireframe에는 loading은 있지만 최초 preview 실패와 세션 만료 상태의 구체적인 화면이 없다. 일반 오류를 빈 영향 또는 저장 성공처럼 처리할 여지가 있다. | loading에서는 radio와 `[저장]`을 비활성화하고 draft를 유지한다. 실패 시 dialog를 닫거나 이동하지 말고 `영향을 확인하지 못했어요` + `[다시 확인]`을 표시하며 retry로 초점을 옮긴다. 401/세션 만료도 draft를 보존한 fail-closed 복귀로 처리한다. |
| 2 | 영향 전략 radio group / 저장 CTA | 두 선택의 순서는 잠겼지만 기본 선택과 무선택 submit 방지가 명시되지 않았다. `replace_all`의 암묵적 선택은 미래 계획을 의도치 않게 바꿀 수 있다. | `전체 반영`을 첫 행에 두되 두 radio를 처음에는 모두 미선택으로 시작한다. 사용자가 하나를 명시적으로 고르기 전 `[저장]`은 비활성화한다. 각 행에 결과 설명을 연결하고 날짜 checkbox·추가 장보기·옛 레시피 요리 action은 추가하지 않는다. |
| 3 | active claim / completed shopping 설명 | active claim 시 disabled와 keep 가능은 잠겼지만, disabled reason의 접근성 연결과 완료 장보기 이후 실제 요리 기준을 wireframe copy만으로는 충분히 설명하지 못한다. | `전체 반영` disabled reason을 해당 control의 `aria-describedby`에 연결하고 `기존 계획 유지`는 계속 선택 가능하게 둔다. 안내는 `완료한 장보기 기록은 바뀌지 않아요. 요리는 각 계획에 고정된 레시피 내용으로 진행돼요.` 의미를 함께 전달한다. |
| 4 | submit/recheck focus 및 중복 실행 | stale/claim 409의 recheck focus는 잠겼으나 최초 retry, 최종 PATCH pending, 재확인 후 선택 초기화까지 하나의 focus 흐름으로 정리되지 않았다. | final submit 중 close/radio/save를 잠그고 요청 latch + 동일 요청의 idempotency key로 중복 submit을 막는다. `RECIPE_IMPACT_STALE`와 `MEAL_COOKING_ALREADY_STARTED`는 dialog를 유지하고 `[최신 영향 다시 확인]`에 초점을 둔다. 재확인 성공 뒤 이전 선택을 자동 재사용하지 않고 다시 선택하게 한다. 닫기 시 편집기의 저장 trigger로 초점을 복원한다. |
| 5 | PLANNER/MEAL/RECIPE start transition | 기존 `MEAL_SCREEN`은 pending set으로 중복 실행을 막지만 모바일 `[요리하기]`가 현재 `min-height: 38px`이고, `RECIPE_DETAIL` standalone은 현재 recipe cook-mode route로 즉시 이동한다. v2 경로에서 그대로 재사용하면 44px 및 exact-success-before-navigation 계약을 어긴다. | start CTA는 최소 44×44px로 올린다. `snapshot_v2` 선택 시 현재 화면을 유지한 채 `session 생성 중…`을 inline 표시하고 중복 action을 비활성화한다. exact `{session_id, contract_version, mode, status, content_summary}` 성공을 검증한 뒤에만 이동한다. error/409는 현재 화면의 CTA 근처에 설명+retry를 남긴다. `legacy_v1`은 기존 동작을 보존하며 v2 creation-off 상태에서 억지로 v2 start를 호출하지 않는다. |
| 6 | COOK_MODE explicit dispatch / terminal drain | 현재 `types/cooking.ts`, `lib/api/cooking.ts`, legacy store는 `contract_version`이 없는 v1 shape를 전제로 하고, 기존 `CookModeScreen`은 local complete/cancel 뒤 이동한다. 이를 union parser로 넓히면 body-shape 추측이나 terminal v2 자동 이탈 위험이 있다. | `legacy_v1`과 `snapshot_v2`를 서로 다른 endpoint/type/parser/reader로 유지하고 상위 dispatcher는 명시적 `contract_version`만 본다. v2 read 오류는 mutable recipe나 v1 parser로 fallback하지 않는다. GET으로 읽은 `cancelled|completed` v2는 whole-board를 read-only로 렌더링하고 mutation CTA를 숨기거나 비활성화한다. creation flag가 꺼져도 기존 v2 read/cancel drain은 유지한다. |

## 권장 사항

| # | 위치 | 제안 |
|---|------|------|
| 1 | impact dialog 계층 | radio group에 `미래 계획에 어떻게 반영할까요?` 같은 group label을 두고, `전체 반영`에는 `미래 계획과 미완료 장보기를 새 내용에 맞춰 바꿔요`, `기존 계획 유지`에는 `기존 계획은 당시 내용으로 유지해요` 수준의 짧은 설명을 붙인다. primary CTA는 `[저장]` 하나로 유지한다. |
| 2 | 390px/320px geometry | 화면 좌우 여백은 16px, 선택·요약 card는 16px radius를 기준으로 하고 modal shell은 기존 dialog/sheet token을 유지한다. 320px 또는 키보드가 열린 높이에서는 dialog body만 세로 스크롤하고 footer는 dialog 안에 고정해 page-level overflow와 CTA 가림을 막는다. |
| 3 | 상태 공지 | loading/pending은 `aria-busy`, 오류는 `role=alert`, 성공 직전 전환은 과도한 toast 없이 상태 문구로 알린다. 로딩 skeleton과 terminal read-only가 기존 whole-board geometry를 크게 흔들지 않게 한다. |

## 현재 구현·설계 구조 대조

- `components/recipe/personal-recipe-editor-shell.tsx`에는 submit latch와 오류 focus 기반이 있다. impact preview와 final PATCH를 한 번의 암묵적 submit으로 합치지 말고 dialog 단계와 final mutation 단계를 분리해 재사용한다.
- `components/planner/meal-screen.tsx`는 pending meal set으로 duplicate start를 막고 성공 후 이동한다. 이 패턴은 유지하되 44px target과 `contract_version` 분기를 추가한다.
- `components/recipe/recipe-detail-screen.tsx`의 standalone 직행은 legacy 경로로 보존할 수 있다. snapshot-v2 경로만 exact start 성공 뒤 session route로 이동한다.
- `components/cooking/cook-mode-mobile-ui.tsx`와 `cook-mode-whole-board.tsx`가 현재 whole-board authority다. `ui/designs/COOK_MODE.md`의 과거 좌우 스와이프·단계별 불세기/시간 문구는 화면정의서 v1.5.32와 merged `cook-mode-whole-board`에 의해 supersede된 보조 기록이므로 되살리지 않는다.
- `ui/designs/PLANNER_WEEK.md`의 과거 계획 영양/완제품 신규 추가 기록도 현재 공식 addendum보다 우선하지 않는다. #7은 start pending/error만 additive하게 연결하며 PLANNER_WEEK shell 또는 day-card 구조를 재설계하지 않는다.

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 미래 Meal 수·날짜 범위·미완료/완료 장보기 수·active claim 수를 표시한다.
- [x] 선택은 `전체 반영 | 기존 계획 유지` 둘뿐이며 문서 밖 action이 없다.
- [x] active claim은 전체 반영만 disabled하고 keep은 가능하다.
- [x] completed shopping은 read-only이며 영향 반영 대상이 아니다.
- [x] session exact success 전에 COOK_MODE로 이동하지 않는다.
- [x] 삭제된 `DELETE /recipes/{id}/save` endpoint를 사용하지 않는다.
- [△] 최초 preview error/unauthorized의 구체 UI는 필수 사항 #1로 구현 증거가 필요하다.

### B. 공통 상태 커버리지

- [x] impact loading, empty-zero, default, active-claim, stale/claim 상태가 잠겼다.
- [x] start pending/error/success가 잠겼고 pending 중 duplicate action을 막는다.
- [x] snapshot-v2 loading/error/terminal read-only/creation-off drain이 잠겼다.
- [△] initial preview error focus와 terminal v2 실제 렌더링은 필수 사항 #1/#6으로 구현 증거가 필요하다.
- [N/A] 일반 list empty CTA나 SHOPPING_DETAIL 수정 UI는 이번 additive 상태 범위가 아니다.

### C. 내비게이션 & 플로우

- [x] start 실패/409는 현재 화면을 유지하고 성공에서만 COOK_MODE로 이동한다.
- [x] stale/claim은 dialog를 유지하고 latest-impact recheck로 돌아간다.
- [x] `legacy_v1 | snapshot_v2`를 명시적으로 분기하며 parser fallback이 없다.
- [x] v2 creation-off에서도 existing read/cancel drain 경로가 끊기지 않는다.
- [N/A] 하단 4탭과 PLANNER_WEEK shell은 변경하지 않는다.

### D. UX 품질

- [x] impact dialog는 짧은 선택이므로 modal/dialog가 적절하며 full-page flow를 추가하지 않는다.
- [x] primary action은 dialog `[저장]`, start surface `[요리하기]`로 명확하다.
- [x] whole-page horizontal scroll을 요구하지 않는다.
- [△] 320px/키보드에서 dialog body/footer scroll containment는 권장 사항 #2대로 실제 검증해야 한다.
- [△] 현재 start CTA 38px 지점은 필수 사항 #5대로 44px 이상으로 보정해야 한다.
- [x] glow·과도한 gradient 같은 제네릭 AI UI를 추가하지 않는다.
- [N/A] 장보기 D&D와 SHOPPING_DETAIL 2영역 구조는 이번 범위가 아니다.

### E. 도메인 규칙 정합성

- [x] `keep`은 기존 Meal pin을 유지하고 `replace_all`만 eligible 미래 Meal을 repin한다.
- [x] active claim 대상의 silent exclusion 없이 전체 무변경 409다.
- [x] past/cook_done/completed shopping/session/history는 변경하지 않는다.
- [x] planner v2는 Meal pin, standalone v2만 current content를 start transaction에서 pin한다.
- [x] v2 immutable reader는 mutable current recipe로 fallback하지 않는다.
- [x] 독립 요리는 planner `meals.status`를 바꾸지 않는다.
- [x] COOK_MODE에 인분 조절 UI를 추가하지 않는다.
- [N/A] 레시피북 타입과 pantry 수량 표시는 이번 화면 변경 범위가 아니다.

### F. 디자인 토큰 준수

- [x] 신규 primary CTA는 app-scoped brand token을 사용하고 임의 hex를 추가하지 않는다.
- [x] surface/보조 텍스트/line은 역할 token을 사용한다.
- [x] 모바일 수평 여백 16px 기준을 유지한다.
- [△] 선택·요약 card의 16px radius와 44px control target은 권장 사항 #2 및 필수 사항 #5로 screenshot/geometry 검증이 필요하다.
- [x] modal shell은 기존 dialog/sheet token을 재사용하며 구버전 coral/cream 직접값을 추가하지 않는다.

## design-generator / Stage 4 재작업 요청 항목

- [ ] 최초 impact preview error/unauthorized 상태를 dialog state matrix와 component test에 추가한다.
- [ ] 전략 무선택 초기 상태와 `[저장]` disabled를 고정한다.
- [ ] active-claim reason association, keep 가능, completed-shopping + pinned-content copy를 고정한다.
- [ ] stale/claim recheck focus, 재확인 뒤 선택 초기화, submit latch를 테스트한다.
- [ ] planner/standalone start의 pending/error/exact-success transition과 44px target을 증명한다.
- [ ] explicit legacy/v2 parser 분리, immutable v2 error, terminal read-only, creation-off drain을 증명한다.
- [ ] 390px/320px에서 overflow, keyboard occlusion, focus trap/restore, 16px card radius를 캡처한다.

## 통과 조건

이 화면 설계가 Stage 5/authority 판단으로 넘어가려면:

- [x] 구현 전 blocker 0개
- [ ] 위 필수 non-blocker 6개를 component/E2E/visual evidence로 닫기
- [ ] 390px/320px artifact에서 page overflow·CTA clipping·keyboard occlusion·focus loss 0개
- [ ] 별도 product-design-authority report에서 blocker/major 0개
- [ ] 구현 head와 비공식 설계 문서/evidence가 같은 화면 상태를 설명할 것

다시 말해, **Stage 4 구현 착수는 가능하지만 이 critique만으로 독립 Stage 승인 또는 `Design Status: confirmed` 처리는 금지한다.**
