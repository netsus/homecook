# HOME 설계 리뷰

> 검토 대상: `ui/designs/HOME.md`
> 기준 문서: 화면정의서 v1.2.3 §1 HOME / 요구사항 v1.6.3 §1-1 / 유저Flow맵 v1.2.3 §① / 디자인 토큰 C2 명랑한 주방
> 검토일: 2026-03-21
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: 현재 구현 기준의 HOME baseline은 공통 브랜드 헤더, discovery panel, `모든 레시피` 정렬 분리까지 반영되어 있다. 남은 확인 포인트는 테마 empty 처리와 향후 활성 필터 시각 언어 정도다.

---

## 크리티컬 이슈 (수정 필수)

없음

---

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 테마 empty 처리 | 테마 섹션이 모두 비었을 때 전체 empty로 바로 전환할지, 리스트 섹션만 유지할지 구현/문서 기준이 더 분명하면 좋다. | 테마 섹션 0개 + 리스트 0개 조합의 우선 표시 규칙을 한 줄로 잠근다. |
| 2 | 활성 필터 시각 언어 | `재료로 검색 (N)`과 필터 안내 바는 현재 충분히 읽히지만, 이후 토큰 변경 시 과하게 강조될 여지가 있다. | 활성 필터 상태의 강조 강도를 `--olive` 계열 안에서 유지하도록 후속 토큰 변경 시 재검토한다. |

---

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면정의서 §1의 모든 컴포넌트(검색바, [재료로 검색] 버튼, 정렬 드롭다운, 테마 섹션, 레시피 그리드, 카드)가 와이어프레임에 포함됐는가
- [x] 문서에 없는 컴포넌트/필드/기능이 추가됐는가 — 없음. `INGREDIENT_FILTER_MODAL`과 `모든 레시피` 정렬 sheet가 공식 화면정의서와 일치한다.
- [x] 로그인 게이트 대상 액션(플래너/팬트리/마이페이지 탭 이동)이 모두 처리됐는가 — 하단 탭바 비로그인 LoginRequiredModal 처리 명시됨
- [x] read-only 상태(완료 장보기 등)가 올바르게 반영됐는가 — HOME은 read-only 해당 없는 탐색 전용 화면, 별도 처리 불필요
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save`가 UI에 등장하지 않는가 — HOME 설계 범위 내 저장 액션 없음, 해당 없음

### B. 공통 상태 커버리지

- [x] Loading 상태 (스켈레톤/인디케이터) 포함 — 스켈레톤 카드 6개(2×3) + pulse 애니메이션 + 섹션 헤더 스켈레톤 명시
- [x] Empty 상태 (안내 + CTA) 포함 — shared `ContentState` shell 기준, eyebrow + headline + CTA 구조 명시
- [x] Error 상태 (안내 + [다시 시도]) 포함 — shared `ContentState` shell 기준, eyebrow + headline + CTA 구조 명시
- [x] read-only 상태가 필요한 화면에서 수정 UI 비노출 — 해당 없음 (HOME은 탐색 전용)
- [x] unauthorized 상태 명시 — HOME은 비로그인 허용 화면이므로 unauthorized 상태가 발생하지 않음을 interaction note로 명시 가능

### C. 내비게이션 & 플로우

- [x] 하단 탭 4개 (홈/플래너/팬트리/마이페이지) 구조 일관성 — --panel 배경, 4탭 배치, 활성/비활성 토큰 모두 명시
- [x] 유저 Flow맵과 진입/이탈 경로 일치 — 앱 실행 → HOME, 카드 탭 → RECIPE_DETAIL, [재료로 검색] → `INGREDIENT_FILTER_MODAL` 모두 일치
- [x] 뒤로가기 동작 명시 여부 — HOME은 앱 진입점이라 별도 뒤로가기 불필요. 공통 브랜드 헤더는 홈 링크만 제공하고, RECIPE_DETAIL → HOME 복귀 시 동작은 RECIPE_DETAIL 설계 범위
- [x] 플로우 단절 지점 없는가 — LoginRequiredModal [취소] → 이전 화면 유지, [로그인하기] → LOGIN 이동 명시. 단, return-to-action 명시가 미흡 (마이너 이슈 #1)

### D. UX 품질

- [x] 터치 타겟 최소 44px 준수 — 퀵 필터 행(44px 명시), 검색바 X버튼(44×44px), 하단 탭 각 탭(44×44px) 모두 명시
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 — 375px 기준 2열 그리드, 카드 너비 계산식(165px) 명시
- [x] 핵심 액션이 시각적으로 명확한가 — 검색바가 최상단 고정, Empty/Error 시 --brand CTA 버튼 배치 명확
- [◻] 장보기 D&D (sort_order) UI — HOME 화면 해당 없음
- [◻] 팬트리 제외 섹션 2-영역 구조 — SHOPPING_DETAIL 전용 항목, HOME 해당 없음
- [x] AI스러운 제네릭 UI 사용 여부 — 글로우/과도한 그라디언트 없음. 박스섀도우는 `0 2px 10px rgba(0,0,0,0.08)` 토큰 기준 준수

### E. 도메인 규칙 정합성

- [x] `meals.status` 전이 표현 — HOME 탐색 화면이므로 meals 상태 전이 직접 노출 없음, 해당 없음
- [x] 독립 요리는 meals 상태를 바꾸지 않는 것이 UI에서 명확한가 — HOME 범위 밖, 해당 없음
- [x] 팬트리는 수량이 아닌 보유 여부만 표시 — HOME에서 팬트리 정보 미노출, 해당 없음
- [x] 요리 모드에서 인분 조절 UI가 없는가 — HOME 범위 밖, 해당 없음
- [x] 저장 가능한 레시피북 타입 (saved/custom) 만 표시 — HOME에서 레시피 저장 UI 없음, 해당 없음

### F. 디자인 토큰 준수

- [x] CTA 버튼에 `--brand (#FF6C3C)` 사용됐는가 — Empty [필터 초기화], Error [다시 시도], LoginRequiredModal [로그인하기] 모두 --brand 명시
- [x] 카드 배경에 `--surface (#ffffff)` 명시됐는가 — 레시피 카드 "--surface 카드 배경" 명시
- [x] 태그·칩에 `--olive (#2ea67a)` 사용됐는가 — 레시피 카드 태그 칩, [재료로 검색] 칩 모두 --olive 명시
- [x] 보조 텍스트에 `--muted (#999999)` 사용됐는가 — placeholder, 통계 수치, 더보기 링크, 비활성 탭 모두 --muted 명시
- [x] 카드 border-radius 16px 준수됐는가 — 레시피 카드 "border-radius: 16px" 명시
- [x] 수평 여백 16px(모바일) 기준 준수됐는가 — "수평 여백 16px (--space-4)" 와이어프레임 주석 명시
- [x] 확정 토큰 외 임의 색상(`#d56a3a`, `#6e7c4a` 등 구버전) 사용됐는가 — 설계 전체에서 확정 토큰 변수명(`--brand`, `--olive`, `--surface` 등)만 사용, 구버전 하드코딩 색상 없음

---

## design-generator 재작업 요청 항목

- [x] 로그인 게이트 모달 — return-to-action 플로우를 인터랙션 노트와 와이어프레임 주석에 명시
- [x] 공통 상태 섹션 — unauthorized 상태 미해당 여부를 한 줄로 명시
- [x] 스크롤 & 레이아웃 동작 섹션 — 공통 브랜드 헤더와 discovery panel의 small-mobile spacing 기준 추가
- [x] 정렬 드롭다운 — 열림 시 z-index 레이어 정책 주석 추가

---

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 4건 처리 또는 수용 결정

---

## 부록: 설계 결정 검토 의견

design-generator가 `§ design-critic 검토 필요 항목`으로 위임한 6개 항목에 대한 판정:

| 항목 | 판정 | 근거 |
|------|------|------|
| 2열 그리드 카드 높이 균등화 | 구현 단계 결정 가능 — CSS `grid auto-rows` 사용 권장 (고정 높이 대비 유연성 확보) | 설계 단계에서 "최대 2줄 말줄임" 정의로 충분 |
| 공통 브랜드 헤더 top spacing | 구현/문서 모두 small-mobile 기준 반영 완료 | HOME / PLANNER 공통 shell 재사용성에 직접 영향 |
| 정렬 드롭다운 z-index 충돌 | 구현/문서 모두 레이어 정책 반영 완료 | 구현 시 테스트 항목 |
| 테마 섹션 0개 시 전체 Empty 처리 | 현행 설계("섹션이 0개면 전체 Empty 상태")로 충분 — 추가 수정 불필요 | 레시피 그리드 공통 상태와 일관성 있음 |
| [재료로 검색] 활성 시각 강조 | 현재 구현 수준은 적절하나 선택 수 badge와 footer summary가 과도해지지 않게 유지 필요 | `--olive` 계열 안에서만 강조를 유지하고, 추가 배지는 선택 수 1개만 노출 |
| 스켈레톤 카드 수(6개) 적절성 | 구현 단계 조정 가능 — 설계 단계에서 "최소 6개, 뷰포트 크기에 따라 가변" 정도로 기술하면 충분 | 크리티컬 이슈 아님 |

---

## Baemin Prototype Parity Critique

> 검토 대상: `ui/designs/HOME.md` §Baemin Prototype Parity Addendum
> 기준 문서: h7 direction gate, `baemin-prototype-parity-foundation`, workpack `baemin-prototype-home-parity`
> 검토일: 2026-04-28
> 검토자: design-critic

### 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: HOME body parity addendum은 prototype target, production IA 보존, exclusion 규칙, required state evidence plan, authority path를 모두 포함한다. Blocker 없음.

### 크리티컬 이슈

없음

### 마이너 이슈

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | required state evidence plan | `filter-active` 상태의 적용 재료 수(fixture 기반)를 캡처 precondition으로 명시하면 재현성이 높아진다 | fixture-route-matrix.md HOME 섹션과 교차 참조하여 재료 수 명시 |

### Parity 체크리스트

- [x] Prototype target source가 명시됐는가 — `homecook-baemin-prototype.html`, `home.jsx` 참조 명시
- [x] HOME production 정보 구조 보존이 명시됐는가 — 공통 헤더, 검색, 재료 필터, 테마 carousel, 모든 레시피, 정렬, 그리드 전체 열거
- [x] Prototype-only exclusions가 열거됐는가 — hero greeting, promo strip, inline ingredient chips, Jua, bottom tabs 5개 항목 명시
- [x] Exclusions가 deficit 비채점으로 처리됐는가 — "after layer에서 부재를 deficit으로 채점하지 않는다" 명시
- [x] h7 direction gate와 foundation 상속이 명시됐는가 — 선행 게이트/foundation merged 상태 확인
- [x] 5축 scoring weight가 h7과 동일한가 — skin 25, layout 30, interaction 20, assets/copy 10, state fidelity 15 명시
- [x] Required states 7개가 모두 열거됐는가 — initial, scrolled-to-recipes-entry, sort-open, filter-active, loading, empty, error
- [x] Viewport pair (390px 70% + 320px 30%)가 명시됐는가 — evidence plan table에 양 viewport 모두 포함
- [x] Capture path convention이 foundation 규칙을 따르는가 — `qa/visual/parity/baemin-prototype-home-parity/<viewport>-HOME-<state>-<layer>.png` 명시
- [x] Authority path + classification이 명시됐는가 — `anchor-extension`, `ui/designs/authority/HOME-parity-authority.md`
- [x] Contract evolution 불필요 판정이 근거와 함께 명시됐는가 — visual implementation only 명시, workpack README 교차 참조
- [x] Token mapping approved divergences가 deficit 비채점으로 처리됐는가 — workpack Key Rules §6에 명시, addendum에서 workpack 참조

### Blocker Count

**0** — Stage 4 진행에 차단 항목 없음

### 통과 조건

- [x] 크리티컬 이슈 0개
- [x] Parity 체크리스트 전체 통과
- [x] Blocker 0
