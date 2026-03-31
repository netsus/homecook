# PLANNER_WEEK 설계 리뷰

> 검토 대상: `ui/designs/PLANNER_WEEK.md`
> 기준 문서: 화면정의서 v1.2 §5 / 요구사항기준선 v1.6 §1-4 / API v1.2.1 §3 / design-tokens C2 명랑한 주방 / AGENTS.md
> 검토일: 2026-03-31
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: planner shell, column CRUD, 상태 뱃지, disabled CTA 경계가 공식 문서와 잘 맞고 Stage 2로 넘길 수 있다. 다만 모바일 그리드의 스크롤 affordance와 컬럼 헤더 affordance는 구현 단계에서 주의가 필요하다.

---

## 크리티컬 이슈

없음.

---

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | 주간 그리드 | 모바일에서 컬럼이 4~5개가 되면 가로 스크롤 가능 여부를 즉시 이해하기 어려울 수 있다. | 첫 구현에서 column 영역 끝에 subtle fade 또는 스크롤 힌트를 둔다. |
| 2 | 컬럼 헤더 편집/삭제 affordance | 이름 수정과 삭제 affordance가 좁은 헤더 안에서 충돌할 수 있다. | 기본은 이름 탭 편집, 삭제는 overflow 메뉴나 아이콘 한 개로 단순화한다. |
| 3 | 상태 뱃지 | `registered` / `shopping_done` / `cook_done`의 의미가 처음 보는 사용자에게는 낯설 수 있다. | Stage 4에서 badge 텍스트를 유지하고 색상만으로 구분하지 않는다. |

---

## 체크리스트 결과

- [x] `PLANNER_WEEK` 화면 범위만 다룬다
- [x] 상단 CTA 3개가 노출된다
- [x] CTA는 실제 destination으로 이동하지 않는다
- [x] 컬럼 CRUD와 상태 뱃지가 포함된다
- [x] 로그인 게이트가 planner 탭 진입 기준으로 명시된다
- [x] loading / empty / error / unauthorized 상태가 포함된다
- [x] disabled CTA와 기본 토큰 방향이 명시된다

---

## 결론

Stage 1 산출물로 사용 가능하다. 구현 전 blocking issue는 없고, 위 마이너 이슈 3건은 Stage 4에서 UI 구체화 시 함께 점검하면 충분하다.
