# MANUAL_RECIPE_CREATE 설계 리뷰

> 검토 대상: `ui/designs/MANUAL_RECIPE_CREATE.md`
> 기준 문서: 화면정의서 v1.5.1 / 요구사항 v1.6.4 / workpack 18 README / acceptance.md
> 검토일: 2026-05-01
> 검토자: design-critic (Claude)

## 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: 요구사항 정합성, 디자인 토큰 준수, 5-상태 커버리지, 모바일 UX 품질이 모두 양호하며 크리티컬 이슈 없음. 마이너 이슈 2건은 권장 수정 수준.

## 크리티컬 이슈 (수정 필수)

없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 재료 추가 모달 (Line 104~134) | 검색 결과 리스트가 길어질 경우 스크롤 경계가 명시되지 않음 | 검색 결과 영역을 `max-height: 40vh` 정도로 명시하여 scroll containment를 분명히 하고, 스크롤 시각적 affordance (fade gradient) 추가 |
| 2 | 조리방법 추가 모달 (Line 136~162) | 조리방법 칩이 8개 seed 고정이라는 가정이 있지만, 확장 시 wrap grid overflow 처리 안내 부족 | 칩 영역도 `max-height` 제한을 두거나, "8개 이상이면 스크롤 가능한 영역"임을 명시 |

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됨 (레시피명, 기본 인분, 재료, 스텝 추가, 저장 후 끼니 추가/상세 이동)
- [x] 문서에 없는 컴포넌트/필드/기능이 추가되지 않음 (화면정의서 §9, workpack README와 일치)
- [x] 로그인 게이트 대상 액션 처리 완료 ([저장] → 로그인 게이트 → return-to-action, Line 216, 379~393)
- [x] read-only 상태 해당 없음 (등록 완료 후 화면 닫힘, RECIPE_DETAIL에서 read-only 확인 가능, Line 395~397)
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save` 미사용 (해당 없음)

### B. 공통 상태 커버리지

- [x] Loading 상태 포함 (조리방법 목록 로딩 시 스켈레톤 8개, Line 324~334)
- [x] Empty 상태 포함 (재료/스텝이 0개일 때 안내 + CTA, Line 84, 101, 336~349)
- [x] Error 상태 포함 (Validation Error + Network Error 모두 포함, Line 351~377)
- [x] Unauthorized 상태 포함 (비로그인 [저장] 시도 → 로그인 게이트 모달, Line 379~393)
- [x] read-only 상태가 필요한 화면: 해당 없음 (등록 완료 후 화면 닫힘)

### C. 내비게이션 & 플로우

- [x] 하단 탭 4개 (홈/플래너/팬트리/마이페이지) 구조 일관성 (Line 44)
- [x] 유저 Flow맵과 진입/이탈 경로 일치 (MENU_ADD → MANUAL_RECIPE_CREATE → MEAL_SCREEN / RECIPE_DETAIL / MENU_ADD, Line 201~221)
- [x] 뒤로가기 동작 명시 (Line 51, 202: MENU_ADD 복귀, 입력 내용 삭제 확인 모달)
- [x] 플로우 단절 지점 없음 (등록 완료 후 3가지 선택지 모두 명확히 정의, Line 164~195)

### D. UX 품질

- [x] 터치 타겟 최소 44px 준수 (인분 stepper 버튼 44×44px Line 65, 재료/스텝 삭제 버튼 44×44px Line 73, 94, [+ 재료/스텝 추가] 버튼 44px 높이 Line 82, 99)
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 (Line 11 명시)
- [x] 작은 모바일 sentinel 고려 (320px 수준 대응 언급 Line 295~300)
- [x] 핵심 액션이 시각적으로 명확함 (AppBar [저장] 버튼 --brand 색상, 비활성 시 --text-4, Line 53~55, 305~307)
- [x] whole-page horizontal scroll 없음 (세로 스크롤만, Line 223~229)
- [x] scroll containment 명확함 (세로 스크롤 전체 페이지, 모달/바텀시트는 별도 스크롤 우선순위 명시, Line 226~229)
- [x] 장보기 D&D (sort_order) UI: 해당 없음 (이 화면은 레시피 등록 화면)
- [x] 팬트리 제외 섹션 2-영역 구조: 해당 없음 (SHOPPING_DETAIL만 해당)
- [x] AI스러운 제네릭 UI 없음 (글로우, 과도한 그라디언트 등 사용하지 않음)

### E. 도메인 규칙 정합성

- [x] `meals.status` 전이 표현: 해당 없음 (등록 후 끼니 추가 시 `status='registered'`로 자동 생성, Line 219)
- [x] 독립 요리는 meals 상태를 바꾸지 않음: 해당 없음 (이 화면에서는 레시피만 등록)
- [x] 팬트리 수량 아닌 보유 여부만 표시: 해당 없음 (팬트리 관련 기능 없음)
- [x] 요리 모드 인분 조절 UI 없음: 해당 없음 (요리 모드 아님)
- [x] 저장 가능한 레시피북 타입 (saved/custom) 만 표시: 해당 없음 (my_added 가상 책 반영, Line 161, 246)

### F. 디자인 토큰 준수 (docs/design/design-tokens.md 기준)

- [x] CTA 버튼에 `--brand` 사용 (AppBar [저장] 버튼 Line 53, 재료/스텝 추가 모달 [추가] 버튼 Line 128, 156, 등록 완료 모달 [끼니에 추가] Line 171, 인분 stepper Line 65)
- [x] 카드 배경에 `--surface` 명시 (재료/스텝 카드 Line 75, 91, AppBar Line 55)
- [x] 태그·칩에 `--olive` 사용 ([+ 재료 추가], [+ 조리 과정 추가] 버튼 Line 81, 97)
- [x] 보조 텍스트에 `--muted` 사용 (Empty 안내 Line 84, 101, 340, 344)
- [x] 카드 border-radius 16px 준수 (재료/스텝 카드 --radius-md Line 75, 95)
- [x] 수평 여백 16px(모바일) 기준 준수 (카드 패딩 16px Line 76, 96)
- [x] 확정 토큰 외 임의 색상 미사용 (모든 색상이 확정 토큰 사용: --brand, --olive, --surface, --surface-fill, --muted, --text-2/3/4, --cook-* 등)

### 추가: Baemin Vocabulary/Material 사용 (h8 matrix 기준)

- [x] prototype-derived design 분류 확인 (Line 5~6: "not-required (generator+critic only)", h8 matrix 기준)
- [x] H5 modal system redesign 적용 (재료/스텝 추가 모달 Line 104~162: `olive base + thin orange highlight`, icon-only close, eyebrow 제거, compact copy)
- [x] 조리방법 색상 시스템 일관성 (--cook-* 토큰 사용 Line 92, design-tokens.md와 일치 Line 272~277)
- [x] 기존 토큰 시스템과 조화 (Baemin vocabulary 사용하되 확정 토큰 기반, Line 279~284)

## design-generator 재작업 요청 항목

없음 (🟢 통과)

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정

## 상세 분석

### 1. 요구사항 정합성 분석

**강점**:
- workpack README §Primary User Path의 6단계 흐름이 와이어프레임과 인터랙션 노트에 모두 반영됨
- 화면정의서 §9 MANUAL_RECIPE_CREATE의 모든 입력 필드 (레시피명, 기본 인분, 재료, 스텝)가 포함됨
- 등록 완료 후 "끼니에 추가" vs "레시피 상세로 이동" 선택지 제공으로 유연한 사용자 경로 지원
- 재료 타입 (QUANT vs TO_TASTE) 구분이 명확하게 UI에 반영됨 (Line 77~79, 121~126)
- 조리방법 선택이 `GET /cooking-methods` 소비를 전제로 설계됨 (Line 146~149, 160)

**검증 완료**:
- 로그인 게이트 + return-to-action 흐름이 명확히 정의됨 (Line 216, 379~393, 316~319)
- my_added 가상 책 반영이 디자인 결정 사항에 명시됨 (Line 247, 백엔드 자동 처리: recipes.created_by + source_type='manual')
- 스텝 번호 자동 채번 (Line 143, 214) 및 재정렬 (Line 215) 정책 반영

### 2. 5-상태 커버리지 분석

**Loading**:
- 조리방법 목록 로딩 시 스켈레톤 8개 표시 (Line 324~334)
- 조건: `GET /cooking-methods` 응답 대기 중

**Empty**:
- 재료가 0개일 때: "재료를 추가해주세요" + [+ 재료 추가] (Line 84, 339~341)
- 스텝이 0개일 때: "조리 과정을 추가해주세요" + [+ 조리 과정 추가] (Line 101, 343~345)
- 신규 등록 상태이므로 Empty는 자연스러운 초기 상태

**Error**:
- Validation Error: 필드별 error 메시지 + 빨간 테두리 (Line 351~362)
- Network Error (500): 오류 안내 모달 + [다시 시도] (Line 364~377)
- 조건별 세분화 (필수 필드 누락, 타입 제약 위반, 조리방법 ID 부재 등)

**Unauthorized**:
- 비로그인 [저장] 시도 → 로그인 게이트 모달 (Line 379~389)
- 로그인 후 등록 폼 자동 복귀 + 입력 내용 복원 (Line 392~393, 316~319)

**Read-only**:
- N/A (등록 완료 후 화면 닫힘, RECIPE_DETAIL에서 read-only 확인 가능, Line 395~397)

### 3. 모바일 UX 품질 분석

**터치 타겟**:
- 모든 주요 버튼/컨트롤이 44×44px 이상 명시 (stepper, 삭제 버튼, CTA 버튼)
- design-critic 검토 항목에도 터치 타겟 확인 명시 (Line 404)

**스크롤 구조**:
- 전체 페이지 세로 스크롤만 사용 (Line 224)
- 모달/바텀시트와 페이지 본문의 스크롤 우선순위 명확 (Line 226~229)
- 가로 스크롤 없음 (Line 225)

**키보드 처리**:
- 입력 필드 포커스 시 스크롤 자동 조정 (Line 232~234)
- virtual keyboard inset 고려 (Line 234)
- design-critic 검토 항목에 키보드 열림 시 필드 가려짐 여부 확인 포함 (Line 405)

**작은 모바일 sentinel**:
- 320px 폭에서 CTA 잘림, 핵심 정보 줄바꿈 붕괴, 터치 타겟 축소 방지 명시 (Line 295~300)
- 폰트, 여백, 카드 크기 비례 축소 원칙 언급

**정보 계층**:
- Primary CTA ([저장]) 우측 상단 배치, --brand 색상으로 강조 (Line 53, 305~307)
- 필수 필드 미입력 시 disabled 상태 (--text-4) 명시 (Line 54)
- 섹션 구분 명확 (기본 정보 → 재료 → 조리 과정, Line 15~42)

### 4. 디자인 토큰 준수 분석

**색상**:
- `--brand` (#ED7470): AppBar [저장], 인분 stepper, 모달 [추가] 버튼, 등록 완료 모달 [끼니에 추가] 등 모든 primary CTA에 일관되게 사용
- `--olive` (#1f6b52): [+ 재료 추가], [+ 조리 과정 추가] 같은 서브 액션에 일관되게 사용
- `--surface` (#ffffff): 카드 배경, AppBar 배경
- `--surface-fill` (#F8F9FA): 입력 필드 배경
- `--muted` (#5f6470): Empty 안내, placeholder
- `--text-2/3/4`: 메타 정보, 보조 텍스트, disabled 텍스트에 적절히 사용
- `--cook-*`: 조리방법별 색상 badge (design-tokens.md의 조리방법 색상 표와 일치)
- 구버전 색상(`#d56a3a`, `#6e7c4a` 등) 미사용 확인

**간격**:
- 카드 패딩 16px (--space-4, 모바일 기준, Line 76, 96)
- 칩 내부 패딩, 버튼 높이 44px 등 토큰 범위 내

**Border-radius**:
- 카드: --radius-md (12px 또는 16px 범위, Line 75, 95)
- 버튼/입력: --radius-sm (8px, Line 60, 81, 97)
- 모달: --radius-xl (20px 또는 그 이상 범위, H5 modal system)

**그림자**:
- AppBar: --shadow-2 (Line 55)
- 카드: --line 테두리 (Line 75, 91) 또는 --shadow-1/2 범위

### 5. H5 Modal System Redesign 적용 확인

- 재료 추가 모달 (Line 104~134):
  - icon-only close 우측 상단 ✓
  - 중앙 제목 ("재료 추가") ✓
  - eyebrow 없음 ✓
  - compact copy ✓
  - `--olive` base + `thin orange highlight` 명시 (Line 131)

- 조리 과정 추가 모달 (Line 136~162):
  - icon-only close 우측 상단 ✓
  - 중앙 제목 ("조리 과정 추가") ✓
  - eyebrow 없음 ✓
  - compact copy ✓
  - `--olive` base + `thin orange highlight` 명시 (Line 159)

### 6. 도메인 규칙 정합성 확인

- `source_type='manual'` 자동 설정 (화면정의서 §9, README Line 18~20)
- `my_added` 가상 책 반영 (recipes.created_by + source_type='manual', README Line 21, 161, 246, 283~284)
- 등록 후 끼니 추가 선택 시 `status='registered'` Meal 생성 (README Line 21, Line 219)
- 재료 타입별 validation 반영 (QUANT: amount/unit 필수, TO_TASTE: amount/unit null, Line 77~79, 121~126)
- 스텝 번호 자동 채번 및 재정렬 (Line 143, 214~215)

### 7. 마이너 이슈 상세

**이슈 #1: 재료 추가 모달 스크롤 경계**
- 현재 상태: 검색 결과 리스트가 있지만 scroll containment 명시 없음 (Line 114~117)
- 위험도: Low (기능 자체는 작동하지만 UX 개선 여지)
- 제안: `max-height: 40vh` + fade gradient로 스크롤 가능 영역임을 시각적으로 명확히

**이슈 #2: 조리방법 칩 wrap grid overflow**
- 현재 상태: 8개 seed 고정 가정, 확장 시 처리 안내 부족 (Line 147~149)
- 위험도: Low (현재는 8개 고정이므로 문제 없으나 미래 확장성 고려)
- 제안: 칩 영역도 `max-height` 제한 명시하거나, "8개 이상이면 스크롤" 정책 추가

### 8. design-critic 자체 검토 항목 확인

Line 399~410에 design-critic 검토 필요 항목 11건이 나열되어 있음:

1. ✓ 재료 추가 모달 검색 결과 스크롤 경계 → 마이너 이슈 #1
2. ✓ 조리방법 칩 8개 이상 wrap grid → 마이너 이슈 #2
3. ✓ 320px 폭 [저장] 버튼 잘림 여부 → 디자인 결정 §7 (Line 295~300)
4. ✓ 재료/스텝 카드 [×] 버튼 44×44px → Line 73, 94
5. ✓ 키보드 열림 시 입력 필드 가려짐 → Line 232~234
6. ✓ 등록 완료 모달 버튼 위계 → Line 171~173, --brand vs --olive
7. ✓ 조리방법 색상 COOK_MODE 일관성 → Line 272~277, --cook-* 토큰
8. ✓ Baemin vocabulary/material 조화 → Line 279~284
9. ✓ 로그인 게이트 return-to-action 자연스러움 → Line 316~319
10. ✓ 재료 타입 선택 UI QUANT/TO_TASTE 구분 명확성 → Line 77~79, 121~126
11. 모든 항목 설계 문서에 반영 확인

## 결론

MANUAL_RECIPE_CREATE 설계는 요구사항 정합성, 5-상태 커버리지, 디자인 토큰 준수, 모바일 UX 품질이 모두 양호하며, H5 modal system redesign, Baemin vocabulary 통합, 도메인 규칙 준수가 확인되었습니다.

마이너 이슈 2건은 기능 자체를 막지 않으며, Stage 4 구현 시 자연스럽게 처리 가능한 수준입니다. 크리티컬 이슈가 없으므로 구현 단계로 진행 가능합니다.

**권장 다음 단계**:
1. Stage 2: 백엔드 계약 고정 (`POST /recipes`, `GET /cooking-methods`)
2. Stage 4: 프론트엔드 구현 시 마이너 이슈 #1, #2 반영
3. Stage 5: public review 준비 (design status: temporary → pending-review)
4. Stage 6: merge 및 closeout
