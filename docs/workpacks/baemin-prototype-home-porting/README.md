# Slice: baemin-prototype-home-porting

## Goal

HOME 화면을 `ui/designs/prototypes/baemin-redesign/screens/home.jsx` 기준으로 실제 체감 1:1에 가깝게 포팅한다.

기존 `baemin-prototype-home-parity`는 prototype-only 요소를 제외하고 점수를 산정했지만, 이 슬라이스는 사용자가 실제 화면에서 차이를 크게 느낀 요소를 HOME에 승격한다.

## Branches

- 프론트엔드: `feature/fe-baemin-prototype-home-porting`
- 현재 구현 브랜치: `feature/baemin-prototype-home-porting`
  - `feature/fe-*` 브랜치 guard가 origin/master의 Stage 1 문서 merge를 요구해, 동일 범위의 non-guard feature branch로 진행했다.

## In Scope

- 화면: `/` HOME only
- 공용 shell:
  - `/`에서만 shared header/bottom tab 숨김
  - `AppShell`에 bottom tab 숨김 옵션 추가
- HOME 화면:
  - prototype AppBar
  - hero greeting
  - search pill
  - inline ingredient chip rail
  - theme carousel
  - promo strip
  - all recipes section
  - HOME 전용 bottom tab
- `RecipeCard`:
  - 16:9 thumbnail area
  - bookmark affordance
  - 인기/source badge
  - title, meta row, tag pills
  - backend에 없는 rating/minutes/emoji는 frontend fallback view model로만 처리
- HOME 전용 token alias:
  - mint `#2AC1BC`
  - mintDeep `#20A8A4`
  - mintSoft `#E6F8F7`
  - bg `#FFFFFF`
  - ink `#212529`

## Out of Scope

- `RECIPE_DETAIL`, `PLANNER_WEEK`, modal family 변경
- API/DB/status/endpoint/field 추가
- Pantry/MyPage 기능 구현
- 새 npm dependency 추가
- Jua 폰트 self-hosting
- 공식 요구사항/화면정의서 계약 변경

## Contract Preservation

- `GET /api/v1/recipes`
- `GET /api/v1/recipes/themes`
- `GET /api/v1/ingredients`

위 API를 그대로 소비한다. 응답 필드가 부족한 시각 요소는 프론트엔드 fallback 표시로만 해결한다.

## Acceptance Source

- `docs/workpacks/baemin-prototype-home-porting/acceptance.md`
- `ui/designs/authority/HOME-prototype-porting-authority.md`

## Verification Plan

- `tests/home-screen.test.tsx`
  - hero, promo strip, inline chips, prototype bottom tab 렌더
  - chip 선택 시 `ingredient_ids` URL/API query 반영
  - `더보기` chip이 기존 `IngredientFilterModal`을 여는지 확인
  - 검색 debounce 300ms 유지
  - loading / empty / error 상태 유지
- `tests/recipe-card.test.tsx`
  - prototype card 구조, title/meta/tag/badge/bookmark 영역 확인
- E2E / visual
  - `/` 390px, 320px 수동 브라우저 확인
  - initial, scrolled, sort-open, filter-active, loading, empty, error 확인

