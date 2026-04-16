# RECIPE_DETAIL 설계 리뷰

> 검토 대상: `ui/designs/RECIPE_DETAIL.md`
> 기준 문서: 화면정의서 v1.2.3 §3 / 요구사항기준선 v1.6.3 §1-2 / 유저Flow맵 v1.2.3 / design-tokens C2 명랑한 주방 / AGENTS.md
> 검토일: 2026-04-16
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: 현재 구현 기준의 `RECIPE_DETAIL` baseline은 공통 브랜드 헤더, compact wrap utility row, balanced primary CTA row, planner add / save / login gate 복귀 흐름까지 설계와 구현이 일치한다. 남은 확인 포인트는 다중 조리방법 배지 규칙 정도다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 다중 조리방법 배지 | 한 step에 조리방법이 여러 개인 경우 badge 우선순위 규칙이 설계에 아직 한 줄로 잠겨 있지는 않다. | 첫 번째 조리방법 우선 노출 또는 최대 2개 badge까지만 허용하는 규칙을 후속 문서화한다. |

---

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면정의서 §3의 핵심 컴포넌트(미디어, 제목+태그, 인분, 액션, 재료, 스텝)가 와이어프레임에 포함됐는가
- [x] 문서에 없는 컴포넌트/필드/기능이 추가됐는가 — 없음. 공통 브랜드 헤더와 breadcrumb 분리는 현재 구현 기준으로 문서화됐다.
- [x] 로그인 게이트 대상 액션(좋아요/저장/플래너 추가)이 모두 처리됐는가 — 3개 모두 로그인 게이트 + return-to-action으로 정리됐다.
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save`가 UI에 등장하지 않는가 — 등장하지 않음

### B. 공통 상태 커버리지

- [x] Loading 상태 포함
- [x] Error 상태 포함
- [x] Empty 상태(재료/스텝) 포함
- [x] unauthorized 상태 명시 — 비로그인 시 보호 액션은 로그인 게이트 모달로 이어진다
- [x] read-only 상태 N/A 근거 명시 — 이 화면 자체는 read-only 대상 아님

### C. 내비게이션 & 플로우

- [x] 공통 브랜드 헤더와 breadcrumb 역할이 분리돼 있는가
- [x] 공유 / 좋아요 / 저장 / planner add / 요리하기 동작이 현재 구현과 일치하는가
- [x] 로그인 후 같은 상세 화면으로 복귀하고 pending action을 한 번만 복구하는가

### D. UX 품질

- [x] 터치 타겟 최소 44px 준수 — utility/CTA/stepper 기준 충족
- [x] 모바일 퍼스트 레이아웃 — shared header + media + overview + CTA 흐름이 first fold에 맞게 정리됐다
- [x] 핵심 CTA가 시각적으로 명확한가 — `[플래너에 추가]`, `[요리하기]`가 primary row로 분리됐다
- [x] 공유 버튼 중복이 제거됐는가 — utility row 1회 노출로 정리됐다

### E. 도메인 규칙 정합성

- [x] 인분 조절은 상세에서만 가능하고 요리모드에서는 조절하지 않는다
- [x] 독립 요리 경로는 meals 상태를 변경하지 않는 것으로 문서화됐다
- [x] 저장 가능한 레시피북 타입은 `saved`, `custom`만 허용한다

### F. 디자인 토큰 준수

- [x] CTA / badge / card tone이 C2 토큰 계열을 따른다
- [x] 카드, sheet, button radius가 공통 토큰 기준을 따른다
- [x] 조리방법 색상은 design token 표와 일치한다

---

## design-generator 재작업 요청 항목

- [x] 플로팅 헤더 제거 및 공통 브랜드 헤더 기준 동기화
- [x] 5등분 액션 버튼 strip 제거, utility row + primary CTA row 구조 확정
- [x] 공유 버튼 중복 제거
- [x] planner add / login gate 닫기 affordance 현재 구현 기준 반영
- [x] 좋아요 활성 tone follow-up polish
- [x] TO_TASTE 가독성 follow-up 검토
- [ ] 다중 조리방법 배지 규칙 한 줄 잠금

---

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] 현재 구현과 설계가 같은 action hierarchy를 설명할 것
- [x] 남은 마이너 이슈는 후속 polish 대상으로 수용 가능

---

## Slice06 Addendum (2026-04-16)

- `06-recipe-to-planner` 기준으로 `RECIPE_DETAIL`은 `shared AppHeader + compact utility row + primary CTA row` baseline을 유지한다.
- slice06 이후에도 planner add 성공 상태가 이 action hierarchy를 깨지 않는지 authority evidence로 확인한다.
