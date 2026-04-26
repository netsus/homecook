# SHOPPING_DETAIL Design Critique

> 대상: `ui/designs/SHOPPING_DETAIL.md`
> 기준: `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`
> 리뷰일: 2026-04-26

## 전체 평가

SHOPPING_DETAIL 디자인은 **모바일 우선 체크리스트 패턴**을 따르며, 구매 섹션과 팬트리 제외 섹션의 명확한 분리, `exclude→uncheck` 규칙의 자연스러운 UX 표현, read-only 모드의 적절한 비활성화 처리가 잘 정리되어 있습니다.

**적합성 판정**: ✅ **Pass (mobile-baseline, mobile-narrow, primary-cta, scroll-containment, anchor 규칙 준수)**

---

## 체크리스트

### 1. Whole-page horizontal scroll 금지 (mobile-ux-rules.md § 1)

✅ **Pass**

- 전체 콘텐츠는 mobile-baseline 375px 안에 수용
- 가로 스크롤 없음 명시
- mobile-narrow (320px) 대응 시에도 가로 스크롤 발생하지 않도록 텍스트 축약 및 여백 조정

---

### 2. Scroll containment가 보여야 한다 (mobile-ux-rules.md § 2)

✅ **Pass**

- 구매 섹션과 제외 섹션은 **전체 페이지 세로 스크롤**로 통합 (각각 독립 스크롤 영역 아님)
- 스크롤 방향: 세로 (↓)만 허용
- 사용자가 어디를 스크롤하는지 직관적으로 알 수 있음

**Scroll containment 명확성**

- 구매 섹션 → 제외 섹션 순서로 이어지는 단일 세로 스크롤
- 섹션 헤더가 시각적 경계 역할 (구매할 재료 / 팬트리 제외 항목)

---

### 3. Primary CTA는 첫 화면에서 읽혀야 한다 (mobile-ux-rules.md § 3)

✅ **Pass**

**Primary CTA**

- 편집 모드: **체크박스 토글** (구매 완료 표시) + **[팬트리 제외] / [되살리기]** 버튼
- Read-only 모드: CTA 없음 (조회 전용)

**시각 위계**

- 체크박스: `--olive` 활성 색상, 각 항목의 왼쪽에 배치
- [팬트리 제외] / [되살리기] 버튼: `--olive` 테두리, 최소 터치 타겟 44×44px
- 하단 [장보기 완료] CTA: `--brand`, 높이 48px (slice 12a에서 구현)

**Thumb-friendly 위치**

- 체크박스: 항목 카드 왼쪽 (터치하기 쉬운 위치)
- 액션 버튼: 항목 카드 오른쪽 (양손 모두 접근 가능)

---

### 3a. 컨트롤은 대상과 가까워야 한다 (mobile-ux-rules.md § 3a)

✅ **Pass**

- 체크박스와 [팬트리 제외] 버튼은 각 항목 카드 안에 배치 (대상과 바로 가까이)
- 섹션 헤더 ("구매할 재료", "팬트리 제외 항목")는 해당 섹션 바로 위에 표시
- 컨트롤과 대상의 시각적 연결이 명확함

---

### 4. 정보 구조는 일반적인 앱 기대를 존중한다 (mobile-ux-rules.md § 4)

✅ **Pass**

- 장보기 체크리스트는 **보편적인 모바일 앱 패턴** (To-do list, Shopping list app)을 따름
- 체크박스 + 항목명 + 수량 + 액션 버튼 구조는 익숙한 레이아웃
- 섹션 분리 (구매 / 제외)는 직관적이며 학습 비용이 낮음

---

### 4a. 검증된 interaction model은 보존한다 (mobile-ux-rules.md § 4a)

✅ **Pass**

- 체크리스트 interaction model은 이미 검증된 패턴 (앱스토어, 리마인더, 노션 등)
- `exclude→uncheck` 규칙은 서버에서 자동 처리하므로 사용자는 "제외 = 안 사는 항목"으로 단순하게 이해 가능
- Read-only 모드는 비활성화로 표현 (일반적인 앱 패턴)

---

### 4b. 같은 단위 정보는 가능한 한 한 덩어리로 본다 (mobile-ux-rules.md § 4b)

✅ **Pass**

- 각 재료 항목 (재료명 + 수량 + 체크박스 + 액션 버튼)은 **한 카드 안에 모임**
- 섹션 단위 (구매 / 제외)는 헤더로 명확히 구분
- 반복 empty copy나 중복 메타데이터 없음

---

### 5. 작은 모바일 sentinel을 기준으로 검토한다 (mobile-ux-rules.md § 5)

✅ **Pass**

**mobile-narrow (320px) 대응 규칙**

- 카드 내부 여백 축소: `12px` → `8px`
- 버튼 텍스트 축약: `[팬트리 제외]` → `[제외]`, `[되살리기]` → `[되살림]`
- 기간 표기 축약: `4월 12일 ~ 4월 20일` → `4/12 ~ 4/20`
- **폰트 크기와 터치 타겟은 유지** (최소 44px)
- 레이아웃 비율은 mobile-baseline과 동일하게 유지

**Blocker 없음**

- CTA 잘림 없음
- 핵심 정보 줄바꿈 붕괴 없음
- 고정 요소가 콘텐츠 가림 없음
- 터치 타겟 축소 없음 (최소 44px 유지)

---

### 6. Modal / Sheet / Full page 선택은 사용자의 집중 흐름으로 정한다 (mobile-ux-rules.md § 6)

✅ **Pass**

- SHOPPING_DETAIL은 **Full page**로 구현 (장보기 리스트는 독립적인 맥락)
- 플래너에서 장보기 생성 후 자동 이동 (전체 화면 전환)
- 체크리스트 작업은 집중이 필요하므로 full page가 적합

---

### 7. 시각적 무게는 브랜드보다 사용성에 먼저 복무해야 한다 (mobile-ux-rules.md § 7)

✅ **Pass**

- `--olive` 체크박스와 버튼 테두리는 **행동 유도**를 우선
- `--brand` CTA는 하단에 명확히 구분되어 배치
- Decorative color보다 content readability 우선 (섹션 헤더는 `--muted`로 차분하게)

---

## Anchor Screen 규칙 검토 (anchor-screens.md)

### Anchor Extension 정의 확인

SHOPPING_DETAIL은 **신규 화면**이므로 anchor extension은 아니지만, `PLANNER_WEEK`에서 장보기 생성 후 자동 이동하므로 **anchor screen dependency**가 있습니다.

**Anchor screen dependency**: `PLANNER_WEEK`

✅ **적절한 연결**

- 플래너의 "장보기" 버튼 → SHOPPING_FLOW → SHOPPING_DETAIL 자동 이동
- 장보기 생성 flow의 자연스러운 다음 단계
- anchor screen의 핵심 CTA를 추가/변경하지 않음 (새로운 화면 진입만)

---

## 개선 제안

### 1. [Optional] 항목 드래그 순서 변경 affordance 추가

현재 디자인은 조회/체크/제외만 포함하며, 순서 변경(드래그&드롭)은 slice 11에서 구현 예정입니다. Slice 11에서 드래그 핸들 (`☰` 아이콘 등)을 추가할 때, 체크박스와 시각적으로 충돌하지 않도록 배치에 주의가 필요합니다.

**권장 배치 (slice 11 대비)**

```
┌─────────────────────────────────┐
│ ☰ ☑ 양파                  2개   │  ← 드래그 핸들 + 체크박스 + 재료명
│                      [팬트리 제외] │
└─────────────────────────────────┘
```

---

### 2. [Optional] Empty 상태에서 되살리기 유도 개선

구매 섹션이 empty일 때, 사용자가 제외 섹션에서 항목을 되살릴 수 있다는 것을 더 명확히 안내할 수 있습니다.

**현재 Empty copy**

```
팬트리에 이미 있어서
장볼 재료가 없어요
```

**개선 제안**

```
팬트리에 이미 있어서
장볼 재료가 없어요

아래 제외 항목에서 필요한 재료를
되살릴 수 있어요 ↓
```

단, 이 개선은 선택 사항이며 현재 디자인도 충분히 명확합니다.

---

## 최종 평가

**적합성**: ✅ **Pass**

SHOPPING_DETAIL 디자인은 모바일 UX 규칙을 잘 준수하며, primary CTA (체크박스, 제외/되살리기 버튼)가 명확하고, scroll containment가 직관적이며, mobile-narrow 대응이 적절합니다. `exclude→uncheck` 규칙은 서버에서 자동 처리되므로 사용자는 간단한 interaction만 수행하면 되며, read-only 모드는 비활성화로 명확히 표현됩니다.

**Design Status 전환 준비**: ✅ `temporary` → `pending-review` (Stage 4 완료 후)

**Authority Review 필요 여부**: Stage 4에서 screenshot/Figma evidence 기반 authority review 필요 (신규 화면)

---

## 다음 단계

1. Stage 2 (Codex): 백엔드 구현 (`GET /shopping/lists/{id}`, `PATCH /shopping/lists/{id}/items/{id}`)
2. Stage 4 (Claude): 프론트엔드 구현 + screenshot evidence 확보
3. Stage 4 (Codex): authority_precheck 실행
4. Stage 5 (Codex): design review
5. Stage 5 (Claude): final_authority_gate (authority report 확인 + blocker 0)
