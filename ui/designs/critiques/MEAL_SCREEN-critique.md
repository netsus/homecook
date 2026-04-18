# MEAL_SCREEN 설계 리뷰

> 검토 대상: `ui/designs/MEAL_SCREEN.md`
> 기준 문서: 화면정의서 v1.5.0 §6 / 요구사항기준선 v1.6.3 §1-4, §2-8 / 유저flow맵 v1.3.0 §③ / design-tokens.md / mobile-ux-rules.md / anchor-screens.md / AGENTS.md
> 검토일: 2026-04-18
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: 화면정의서 §6의 필수 항목은 모두 커버되어 있고 도메인 규칙 위반은 없으나, Empty 상태 CTA 중복 노출, 삭제 버튼 destructive 색상 토큰 오류, 409 copy 불일치, `--muted` 토큰 값 오인 등 마이너 이슈가 4건 존재하여 조건부 통과로 판정한다. Stage 2 진행은 가능하며, Stage 4 구현 완료 전 아래 마이너 이슈를 반영할 것을 권고한다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | Empty 상태 화면 | 하단 고정 CTA와 본문 강조 CTA가 동시에 노출된다. "식사 추가" 버튼이 화면에 두 번 나타나 시각 위계가 분산된다. 화면정의서 §6 및 요구사항기준선 §1-4는 Empty 상태에서 [식사 추가] CTA 강조를 요구하나, 중복 표시를 명시하지는 않는다. | Empty 상태에서는 본문 중앙 강조 CTA 단독으로 처리하고, 하단 고정 CTA는 노출하지 않거나 비활성화한다. 또는 하단 고정 CTA를 유지하되 본문 내 중복 버튼을 제거하고 Empty copy와 하단 CTA만으로 안내를 구성한다. |
| 2 | 삭제 확인 모달 — 버튼 색상 | 삭제 버튼 색상으로 `--brand-deep` 또는 "위험 강조색"이라는 표현이 사용됐다. design-tokens.md 확정 토큰에 destructive/danger 전용 색상이 별도 정의되어 있지 않으며, `--brand-deep`(`#E05020`)은 hover/active/pressed 상태 전용 토큰이다. destructive 의미로 `--brand-deep`을 전용하면 토큰 사용 의미가 희석된다. | `--brand-deep`을 destructive 액션에 그대로 쓰되 "hover 상태 토큰을 destructive에 재사용한다"는 의도를 설계 결정 노트에 명확히 남긴다. 또는 Stage 4 구현 시 destructive 버튼 스타일을 `text-red-600` 등 Tailwind 유틸리티로 처리하고, 추후 토큰 확장 시 반영한다. 현재 설계 문서에서 "위험 강조색"이라는 모호한 표현을 제거하고 구체적인 토큰 또는 클래스를 명시하도록 수정한다. |
| 3 | 409 인라인 오류 copy | 설계 문서의 409 copy: `"변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요."` workpack README Key Rules의 409 copy: `"현재 상태에서는 이 작업을 수행할 수 없어요"`. 두 문서 간 copy가 다르다. | workpack README에 명시된 copy(`"현재 상태에서는 이 작업을 수행할 수 없어요"`)를 공식 기준으로 하고, 설계 파일의 copy를 일치시킨다. "새로고침" 안내는 낙관적 잠금 충돌에서만 의미가 있으므로 일반 409 메시지와 구분이 필요하다면 그 기준도 명시한다. |
| 4 | StatusBadge — `registered` 배경 색상 | `registered` 뱃지 배경이 `--muted`로 명시되어 있다. design-tokens.md에서 `--muted`는 `#5f6470`으로 보조 텍스트/플레이스홀더 전용 텍스트 색상 토큰이다. 배경 색상으로 사용하면 칩이 진한 회색으로 렌더링된다. 의도가 중립/비활성 칩이라면 `--line`(`rgba(0,0,0,0.07)`) 또는 `--surface`가 더 적합하다. | `registered` 뱃지 배경을 `--line` 또는 별도 neutral 배경(`rgba(0,0,0,0.07)`)으로 수정하고, 텍스트는 `--muted`(`#5f6470`)로 처리한다. 현재 설계는 배경과 텍스트 모두 `--muted`로 표기되어 있어 대비가 부족할 수 있다. |

---

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면정의서 §6 헤더(날짜 + 끼니명) 포함됨
- [x] 식사 리스트(카드) — 레시피명, 계획 인분, 상태 뱃지 포함됨
- [x] [인분 조절] stepper(+/-) 포함됨
- [x] [삭제] 버튼 + 확인 모달 연결됨
- [x] 하단 [식사 추가] → MENU_ADD CTA 포함됨
- [x] 인분 조절 확인 모달 (`shopping_done` / `cook_done` 조건, copy) 포함됨
- [x] 삭제 확인 모달 포함됨
- [x] 409 오류 인라인 표시 포함됨 (단, copy 불일치 — 마이너 이슈 #3 참조)
- [x] 개별 [요리하기] 버튼 없음 (화면정의서 §6 "이 화면에서는 제공하지 않는다" 정책 준수)
- [x] 식사 카드 → RECIPE_DETAIL 탭 진입 포함됨
- [x] 문서에 없는 컴포넌트/기능 추가 없음
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save` 미등장
- [x] MEAL_SCREEN 전체가 로그인 필요 — 비로그인 진입 시 로그인 게이트 모달 처리됨
- [x] 개별 액션(인분 조절, 삭제)의 로그인 필요 명시됨
- [x] return-to-action 패턴 명시됨

### B. 공통 상태 커버리지

- [x] Loading 상태 — 스켈레톤 카드 2장, shimmer 명시
- [x] Loading 중 CTA 노출 유지
- [x] Empty 상태 — "이 끼니에 등록된 식사가 없어요" + CTA 강조
- [◻] Empty 상태 CTA 중복 노출 문제 (마이너 이슈 #1 참조)
- [x] Error 상태 — "식사 목록을 불러오지 못했어요" + [다시 시도]
- [x] Error 상태에서도 하단 CTA 유지 (문서 요건 충족)
- [x] read-only 상태 — workpack README에 "이번 슬라이스에서 read-only 분기 없음(N/A)" 명시됨, 설계에서 올바르게 미포함
- [x] unauthorized 상태 — 로그인 게이트 + return-to-action 명시됨

### C. 내비게이션 & 플로우

- [x] 하단 탭 4개(홈/플래너/팬트리/마이페이지) 구조 일관성 — D4 설계 결정으로 탭바 유지 명시
- [x] 유저 Flow맵 §③ 진입 경로(PLANNER_WEEK 끼니 셀 탭) 일치
- [x] 유저 Flow맵 §③ 이탈 경로(RECIPE_DETAIL, MENU_ADD, PLANNER_WEEK 복귀) 일치
- [x] 뒤로가기 동작 명시 — "← 뒤로" → PLANNER_WEEK 복귀
- [x] MENU_ADD 복귀 후 식사 목록 자동 갱신 명시
- [x] 인터랙션 노트 테이블에 로그인 필요 여부 명시됨
- [x] 플로우 단절 지점 없음

### D. UX 품질

- [x] 터치 타겟 최소 44px — stepper 버튼 44×44px, 삭제 버튼 44×44px, 뒤로가기 버튼 44×44px 모두 명시
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 — 기본 와이어프레임 375px 기준
- [x] 320px narrow sentinel 별도 와이어프레임 포함, 주요 요소 잘림 없음 명시
- [x] **primary CTA 지정**: `[+ 식사 추가]`가 이 화면의 primary CTA로 명시됨 — `--brand` 색상으로 가장 강한 시각 위계, sticky 하단 고정으로 항상 접근 가능 (mobile-ux-rules.md Rule 3 준수)
- [x] **primary CTA vs secondary action 위계 분리**: 카드 내 stepper(+/-) 및 [삭제]는 secondary action으로 primary CTA보다 시각 무게가 낮게 설계됨 — 위계 혼동 없음
- [x] 핵심 액션(식사 추가) 하단 sticky 고정, 시각적으로 명확
- [x] Whole-page horizontal scroll 없음 — overflow-x: hidden 명시
- [x] Scroll containment 명확 — 앱바/하단 CTA sticky, 목록만 스크롤
- [x] 스크롤 구조 다이어그램 포함
- [x] 장보기 D&D UI — 이 화면(MEAL_SCREEN) 해당 없음 (SHOPPING_DETAIL 전용 규칙)
- [x] 팬트리 제외 섹션 2-영역 구조 — 이 화면 해당 없음
- [x] AI스러운 제네릭 UI(글로우, 과도한 그라디언트 등) 없음
- [x] 카드 1개일 때 시각 위계 관련 자가 점검 항목 명시됨(design-critic 검토 필요 항목 #5)
- [x] 모달 center modal vs bottom sheet 결정 근거(D1) 명시됨

### E. 도메인 규칙 정합성

- [x] `meals.status` 전이 표현 (`registered` / `shopping_done` / `cook_done`) 3종 정확히 표현됨
- [x] 상태 뱃지 한국어 표시명 (`식사 등록 완료` / `장보기 완료` / `요리 완료`) 화면정의서 §0-4 용어와 일치
- [x] 독립 요리는 `meals` 상태를 바꾸지 않음 — MEAL_SCREEN에서 개별 요리하기 버튼 없음으로 정책 준수
- [x] 팬트리는 수량이 아닌 보유 여부만 표시 — 이 화면 해당 없음
- [x] 요리모드에서 인분 조절 UI 없음 — 이 화면 해당 없음 (레시피 상세 §3 "요리모드에서는 인분 조절 불가" 정책은 COOK_MODE 범위)
- [x] 저장 가능한 레시피북 타입(saved/custom)만 표시 — 이 화면 해당 없음
- [x] 인분 조절은 `PATCH /meals/{meal_id}` — `planned_servings`만 변경, `status` 변경 없음 명시
- [x] 삭제 전 항상 확인 모달 표시 — 즉시 삭제 금지 명시됨
- [x] MEAL_SCREEN 자체는 anchor screen 아님, PLANNER_WEEK를 수정하지 않음 — D7 메모에 리스크 정확히 기술됨

### F. 디자인 토큰 준수

- [x] CTA 버튼(`+ 식사 추가`, stepper +/-)에 `--brand (#FF6C3C)` 사용됨
- [x] 카드 배경에 `--surface (#ffffff)` 명시됨
- [x] `shopping_done` 뱃지에 `--brand` 사용됨 (태그/칩 토큰과 중복이나 화면정의서 상태 색상 지정과 일치)
- [x] `cook_done` 뱃지에 `--olive` 사용됨 (`--olive (#1f6b52)` 토큰 일치)
- [◻] `registered` 뱃지 배경에 `--muted` 사용 — 텍스트 토큰을 배경 색상으로 오용 (마이너 이슈 #4 참조)
- [x] 보조 텍스트에 `--muted` 사용됨 (삭제 버튼, 단위 라벨 등)
- [x] 카드 border-radius 16px 준수됨
- [x] 버튼 border-radius 12px 준수됨
- [x] 칩 border-radius 9999px 준수됨
- [x] 모달 border-radius 20px 준수됨
- [x] 수평 여백 `--space-4` (16px) 기준 준수됨
- [x] 카드 box-shadow `0 2px 10px rgba(0,0,0,0.08)` 명시됨
- [x] 확정 토큰 외 임의 색상(`#d56a3a`, `#6e7c4a` 등 구버전) 미사용
- [x] `--panel` 배경 — 모달, 하단 CTA 영역, 탭바에 명시됨
- [x] `--background`(`#fff9f2`) — 앱바 배경에 명시됨
- [◻] 삭제 버튼 destructive 색상에 `--brand-deep` 사용 — hover/active 전용 토큰의 재사용 (마이너 이슈 #2 참조)
- [x] 타이포그래피 스케일 — text-xl(AppBar), text-base(카드 제목/버튼), text-sm(보조), text-xs(배지) 모두 design-tokens.md 용도와 일치

---

## design-generator 재작업 요청 항목

설계 문서 자체의 텍스트 수정 사항:

- [ ] **Empty 상태 섹션**: 하단 고정 CTA 중복 노출 방식을 단일 CTA 구조로 변경하거나, 중복 이유를 명시적 설계 결정(D 시리즈)으로 문서화한다.
- [ ] **삭제 확인 모달 버튼 색상**: `--brand-deep` 사용 의도를 명확히 하거나, 임시 처리임을 표기하고 Stage 4에서 확정한다.
- [ ] **409 인라인 copy**: `"변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요."` → workpack README 기준 `"현재 상태에서는 이 작업을 수행할 수 없어요."`로 통일한다.
- [ ] **StatusBadge registered 배경**: `--muted` → `--line` 또는 `rgba(0,0,0,0.07)`로 수정하고, 텍스트는 `--muted`(`#5f6470`)로 명시한다.

---

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개 — 충족
- [ ] 마이너 이슈 처리 또는 수용 결정 — 4건 중 Stage 4 구현 전까지 처리 권고 (#3 409 copy는 Stage 2 백엔드 계약 고정 전에 반드시 일치시킬 것)

---

## 부록: Stage 4 evidence 체크포인트

workpack README `Design Authority` 항목에 따라 Stage 4 authority review에서 확인해야 할 항목:

1. 식사 카드 목록이 길어질 때 리스트만 스크롤되고 앱바·하단 CTA가 고정되는지 스크린샷으로 확인
2. 320px narrow sentinel 스크린샷 — stepper 3요소가 한 행에 유지되는지, CTA 잘림 없는지
3. iPhone 하단 홈 인디케이터 영역에서 safe-area-inset-bottom 처리 확인
4. Loading 스켈레톤 높이가 실제 카드 높이와 일치하는지 확인 (CLS 방지)
5. 삭제 버튼과 stepper가 좁은 폭에서 탭 영역 겹침 없는지 확인
