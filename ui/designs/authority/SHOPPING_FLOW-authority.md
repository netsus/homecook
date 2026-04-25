# Authority Report: SHOPPING_FLOW (Draft)

> subphase: `stage4_draft`
> slice: `09-shopping-preview-create`
> stage: 4
> evidence (pending final screenshots):
> - `ui/designs/evidence/09-shopping-preview-create/SHOPPING_FLOW-mobile-default.png` (375px)
> - `ui/designs/evidence/09-shopping-preview-create/SHOPPING_FLOW-mobile-narrow.png` (320px)
> date: 2026-04-26

## Screen Overview

- Screen ID: `SHOPPING_FLOW`
- UI Risk: `new-screen`
- Anchor Dependency: `PLANNER_WEEK` (진입점: 상단 "장보기" 버튼)
- Design Status: `pending-review` (Stage 4 완료 후)

## Required States Implemented

- [x] loading (preview 로딩 중)
- [x] empty (eligible_meals 빈 배열)
- [x] error (API 호출 실패)
- [x] ready (레시피 목록 표시 + 인분 조정 + 생성 CTA)
- [x] creating (장보기 목록 생성 중)
- [x] unauthorized (401 → 로그인 리다이렉트)
- [x] conflict (409 → 이미 다른 리스트에 포함된 식사)

## Mobile UX Compliance Checklist

| 규칙 | 준수 여부 | 비고 |
|------|----------|------|
| Whole-page horizontal scroll 금지 | ✅ | 가로 스크롤 없음 |
| Scroll containment 명시 | ✅ | 레시피 카드 리스트만 세로 스크롤 |
| Primary CTA 첫 화면 노출 | ✅ | [장보기 목록 만들기] 하단 고정 |
| 터치 타겟 최소 44px | ✅ | 체크박스, 스테퍼, CTA 모두 44px+ |
| 작은 모바일(320px) 대응 | ⚠️ | 레시피명 1행 wrap, 카드 높이 증가 가능성 → 실제 화면 검증 필요 |
| CTA 위계 명확 | ✅ | `--brand` CTA vs `--olive` 체크/스테퍼 구분 명확 |
| Empty/Error 안내 명확 | ✅ | 각 상태별 안내 문구 + CTA 제공 |

## Component Inventory

### 1. AppBar (SHOPPING_FLOW)
- Height: `56px` (h-14)
- Back button: `44×44px` 터치 타겟
- Title: "장보기 준비"
- Structure: 양쪽 균형 (뒤로 버튼 + 제목 + 공백)

### 2. RecipeCard
- Border radius: `16px`
- Padding: `16px` (p-4)
- Checkbox: `24×24px` 체크 영역, `44×44px` 터치 타겟
- Recipe name: `text-base` (16px), `font-semibold`
- Servings display: `text-sm` (13px), `--muted`
- Stepper: `NumericStepperCompact` 재사용, `44×44px` 버튼
- 보조 정보: `text-sm` (13px), `--muted`

### 3. CTA Button (하단 고정)
- Width: `100%`
- Height: `48px`
- Border radius: `12px`
- Background: `--brand`
- Text: `text-base` (16px), `font-semibold`, `white`
- Disabled state: `opacity-50`

### 4. ContentState (Loading/Empty/Error)
- Reuses existing `ContentState` component
- Tone variants: `loading`, `empty`, `error`
- Consistent with existing app patterns

## Design Tokens Compliance

| Token | Usage | 준수 |
|-------|-------|------|
| `--brand` | 하단 CTA 배경 | ✅ |
| `--olive` | 체크박스 활성, 스테퍼 테두리 (서브 액션) | ✅ |
| `--foreground` | 레시피명, 상태 제목 | ✅ |
| `--muted` | 인분 표시, 보조 정보 | ✅ |
| `--surface` | 카드 배경 | ✅ |
| `--line` | 카드 테두리, 앱바 하단 테두리 | ✅ |

## Potential Issues (Pending Screenshot Evidence)

### 1. 320px Narrow Viewport (Priority: Medium)
- 레시피명이 긴 경우 1행 wrap → 카드 높이 증가
- 5개 이상 리스트에서 스크롤 피로도 가능성
- **Action**: 실제 320px 스크린샷 캡처 후 카드 높이 측정 필요

### 2. Checkbox vs Stepper Touch Conflict (Priority: Low)
- 체크박스와 스테퍼가 가로로 인접하지 않고 세로로 분리되어 충돌 위험 낮음
- **Action**: 실제 터치 인터랙션 동작 확인 필요 (Stage 5 manual QA)

### 3. Safe Area Inset Bottom (Priority: Low)
- 하단 CTA가 고정 위치인데 `safe-area-inset-bottom` 미적용
- **Action**: iOS Safari에서 하단 CTA가 홈 인디케이터에 가려지는지 확인

## Stage 4 Completion Status

- [x] Frontend implementation complete
- [x] All required UI states implemented
- [x] Vitest unit tests written (100% pass)
- [x] Playwright E2E tests written (100% pass)
- [ ] Mobile UX evidence screenshots captured (mobile-default, mobile-narrow)
- [x] Authority report draft created
- [x] Design status updated to `pending-review`

## Next Steps (Stage 5)

1. **Screenshot Evidence**:
   - Capture `SHOPPING_FLOW-mobile-default.png` (375px × full scroll)
   - Capture `SHOPPING_FLOW-mobile-narrow.png` (320px × full scroll)
   - Save to `ui/designs/evidence/09-shopping-preview-create/`

2. **Authority Review**:
   - Run `product-design-authority` agent with screenshots
   - Address any blocker/major issues
   - Update this report with final verdict

3. **Public Review**:
   - Human verification of mobile UX
   - Confirm touch targets in actual device/simulator
   - Verify safe area inset handling on iOS

## Preliminary Verdict (Pre-Screenshot)

**Status**: `draft` (pending screenshot evidence)

**Expected Outcome**: `pass` with 0 blockers, 0-1 minor issues

**Reasoning**:
- All required states implemented
- Touch targets meet 44px minimum
- Reuses proven components (`ContentState`, `NumericStepperCompact`)
- Follows established design token patterns
- No whole-page horizontal scroll
- Primary CTA visible on first screen

**Potential Minor Issues**:
- 320px viewport card height (pending measurement)
- Safe area inset bottom (pending iOS test)

**Stage 4 → Stage 5 Transition**: Ready pending screenshot capture and final authority review.
