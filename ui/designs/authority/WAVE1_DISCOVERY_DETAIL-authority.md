# Authority Report: WAVE1_DISCOVERY_DETAIL

> slice: wave1-port-discovery-detail
> stage: 5
> reviewer: Codex design authority precheck + Claude final authority gate
> date: 2026-05-10

## Design Status

**confirmed**

Stage 4 FE 구현 후 Codex가 screenshot evidence를 확인했고, Claude final authority gate도 `PASS`를 반환했다. HOME, RECIPE_DETAIL, save modal, login provider display의 design blocker는 0개다.

## Changes Summary

### HOME
- Header: 프로필/장바구니 아이콘 제거, 브랜드 텍스트만 중앙 유지
- Sort: 바텀시트 SortMenu 제거, 인라인 SortDropdown(Slice A primitive) 적용
- Sort default: `view_count` → `like_count`으로 변경. `view_count` option UI 숨김
- Filter chips: "모든 레시피" 섹션 아래로 재배치 (검색바 아래 → 레시피 리스트 영역)
- "재료로 거르기" → "재료로 검색" 문구: 이전 슬라이스에서 이미 변경 완료

### RECIPE_DETAIL
- Hero metrics: `cook_count` 표시 추가 (요리완료). `like_count`, `save_count`, `cook_count`, `plan_count` 4종 표시
- `view_count`: UI에서 숨김 (데이터 보존)
- Metrics row: 좋아요·저장 → 요리완료 → 플래너 → 공유 순서로 재정렬
- Bottom sticky CTA: 기존 overview 내 CTA를 `sticky bottom-0` 바로 분리. `플래너에 추가` (olive) + `요리하기` (brand) 2버튼
- Detail route: shared bottom tabs를 숨겨 sticky CTA와 전역 bottom tab의 이중 고정 overlap 제거
- Step font: `text-sm` (14px) → `text-base` (16px) 증가
- 별점/rating: 이전부터 부재 확인

### Save Modal
- 변경 없음. 기존 구현이 이미 spec 충족: 제목 "레시피 저장", 프리뷰 없음, 버튼 "저장"

### Login Provider
- `kakao` provider FE-only 숨김 (`HIDDEN_PROVIDERS` filter)
- `apple` provider: `AUTH_PROVIDER_META`에 미정의, 변경 불필요
- Login screen copy: "카카오, 네이버, 구글" → "네이버, 구글"

## Token Usage

Production tokens only:
- `--brand`, `--brand-deep`, `--olive`, `--foreground`, `--surface`, `--panel`, `--line`, `--muted`, `--text-2`
- `--radius-full`, `--radius-md`, `--radius-xl`
- `--shadow-1`, `--shadow-2`, `--shadow-3`

No prototype mint/Jua/asset leakage.

## Risk Assessment

- **Risk class**: anchor-extension (HOME + RECIPE_DETAIL 두 anchor screen 변경)
- CTA hierarchy 변경: overview 내장 → sticky bottom 분리. 기존 탭/서빙/플래너/쿡 경로 보존
- Sort default 변경: `view_count` → `like_count`. API 계약에 영향 없음 (view_count sort는 API에 여전히 존재)
- `cook_count` metric 표시: 기존 공식 API 필드 소비만

## Evidence

> evidence:
> - HOME mobile default: `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-default.png`
> - HOME mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/home-mobile-narrow.png`
> - HOME sort dropdown open: `ui/designs/evidence/wave1-port-discovery-detail/home-sort-dropdown-open.png`
> - RECIPE_DETAIL mobile default: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-default.png`
> - RECIPE_DETAIL mobile narrow: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-mobile-narrow.png`
> - RECIPE_DETAIL hero stats: `ui/designs/evidence/wave1-port-discovery-detail/recipe-detail-hero-stats.png`
> - Save modal: `ui/designs/evidence/wave1-port-discovery-detail/save-modal.png`
> - Login screen: `ui/designs/evidence/wave1-port-discovery-detail/login-screen.png`

## Scorecard

Codex Stage 5 precheck와 Claude final authority gate 응답을 반영한다.

| Dimension | Score | Notes |
|-----------|-------|-------|
| Mobile UX | 8/10 | 390px/320px HOME and RECIPE_DETAIL evidence에서 라벨 줄바꿈/가로 overflow 없음. Detail sticky CTA는 불투명 bottom bar로 정리 |
| Interaction Clarity | 8/10 | HOME inline SortDropdown, save modal, login providers, detail CTA가 스크린샷과 E2E 흐름에서 식별 가능 |
| Visual Hierarchy | 8/10 | HOME은 검색/테마/정렬/칩 순서가 읽히고, detail은 hero media -> metrics -> CTA hierarchy가 유지됨 |
| Color/Material Fit | 8/10 | 승인 production token만 사용. prototype mint/Jua/asset leakage 없음 |
| Familiar App Pattern Fit | 8/10 | 모바일 bottom CTA, inline dropdown, modal 선택 목록, OAuth provider buttons 모두 익숙한 앱 패턴으로 동작 |

## Blockers

0

## Claude Final Gate

- Prompt: `.omx/artifacts/claude-delegate-3f4ca745-db71-4392-a3f1-4e3c4493e9bc-wave1-port-discovery-detail-final-authority-gate-prompt-20260509T222027Z.md`
- Response: `.omx/artifacts/claude-delegate-3f4ca745-db71-4392-a3f1-4e3c4493e9bc-wave1-port-discovery-detail-final-authority-gate-response-20260509T222027Z.md`
- Verdict: `PASS`
- Blockers: `None`

## Next Action

- Stage 6 `pnpm verify:frontend` 및 PR closeout 진행
