# Authority Report: RECIPEBOOK_DIARY_PORT

> slice: `recipebook-diary-port`
> stage: 4/5 implementation evidence
> reviewer: Codex
> date: 2026-06-09

## Design Status

**reviewed**

레시피북 다이어리화 1차 포팅은 API/DB 변경 없이 기존 `MYPAGE`와
`RECIPEBOOK_DETAIL` 화면 위에 적용했다. 전체 페이지 넘김 reader는
`GET /api/v1/recipes/{id}` 조회수 증가 계약 때문에 이번 범위에서 제외하고,
책장형 목록과 목차형 상세만 서비스 코드에 반영했다.

## Changes Summary

- `MYPAGE` 레시피북 탭은 시스템/커스텀 레시피북을 작은 책 형태 카드로 보여준다.
- 웹 책장에서는 커스텀 레시피북의 `이름 변경` / `삭제` 액션을 카드 하단에 노출해 관리 기능이 숨지 않게 했다.
- `MYPAGE` 책 카드는 좁은 inline 상세를 열지 않고 기존 `/mypage/recipe-books/{book_id}` 상세 화면으로 이동한다.
- `RECIPEBOOK_DETAIL` 웹은 왼쪽 목차/책 정보 rail과 오른쪽 레시피 목록을 분리해 1440px에서 목록 영역이 좁아지지 않게 했다.
- `RECIPEBOOK_DETAIL` 모바일은 상단 title-only 요약 대신 목차를 먼저 보여주고, 각 목차 항목은 해당 레시피 카드 anchor로 이동한다.
- 모바일 목차는 navigation landmark로 노출하며, anchor 이동 시 sticky app bar가 카드 상단을 가리지 않도록 scroll margin을 둔다.
- 모바일 상세 상단 뒤로가기/옵션 버튼과 목차 항목은 44px 이상 터치 타겟을 유지한다.

## Contract / State Risk

- API, DB, endpoint, status, dependency 변경 없음.
- `GET /api/v1/recipe-books/{book_id}/recipes`를 상세 목록의 유일한 data source로 유지한다.
- full reader preview를 위한 숨은 `GET /api/v1/recipes/{id}` 호출 없음.
- 저장 가능한 레시피북 타입은 기존 계약대로 `saved`, `custom`만 유지한다.
- `my_added` 책 제거 불가, system book rename/delete 미노출, liked unlike/remove 정책은 기존 `17b` 계약을 유지한다.

## Evidence

> evidence:
> - MYPAGE bookshelf desktop 1440: `ui/designs/evidence/recipebook-diary-port/mypage-bookshelf-desktop-1440.png`
> - RECIPEBOOK_DETAIL desktop 1440: `ui/designs/evidence/recipebook-diary-port/recipebook-detail-desktop-1440.png`
> - RECIPEBOOK_DETAIL mobile 390: `ui/designs/evidence/recipebook-diary-port/recipebook-detail-mobile-390.png`
> - RECIPEBOOK_DETAIL mobile 320: `ui/designs/evidence/recipebook-diary-port/recipebook-detail-mobile-320.png`

## Verification

- `pnpm exec vitest run tests/mypage-screen.test.tsx tests/recipe-book-detail-screen.test.tsx` - passed, 67 tests.
- `pnpm test:product` - passed, 79 files / 945 tests.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed.
- `pnpm build` - passed.
- `pnpm validate:workpack -- --slice recipebook-diary-port` - passed.
- `pnpm validate:workflow-v2` - passed.
- `pnpm validate:authority-evidence-presence` - passed.
- `pnpm exec playwright test tests/e2e/qa-recipebook-diary-port-evidence.spec.ts --project=desktop-chrome` - passed, generated/refreshed 4 evidence screenshots with horizontal overflow, mobile tap-target, navigation landmark, and sticky-header-safe anchor scroll checks.
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` - passed, 81 tests.
- `git diff --check` - passed.

## Scorecard

| Dimension | Score | Notes |
| --- | --- | --- |
| Web Information Architecture | 5/5 | 책장과 상세 split을 분리해 상세 레시피 영역이 충분히 넓다. |
| Mobile UX | 4/5 | 목차 우선 구조, navigation landmark, sticky-header-safe anchor 이동, 44px 터치 타겟을 확인했다. 하단 탭은 기존 앱 패턴대로 고정 overlay를 유지한다. |
| Interaction Clarity | 5/5 | 상세 이동, 커스텀 이름 변경, 삭제 액션이 카드/상세에서 모두 발견 가능하다. |
| Contract Safety | 5/5 | API/DB/레시피 상세 hidden fetch 없이 기존 계약 안에서만 변경했다. |
| Brand Fit | 4/5 | `#00A1FF` 브랜드 변수를 메인 책 색으로 사용하고, 주변 UI는 기존 HOMECOOK web/app 토큰을 유지한다. |

## Verdict

verdict: pass

**PASS** - `recipebook-diary-port` 1차 서비스 포팅은 사용자 피드백 범위 안에서 적용 가능하다.

- Blockers: 0
- Major issues: 0
- Minor issues: 1
  - 모바일 상세의 하단 탭 overlay는 기존 앱 공통 패턴을 유지한다. 레시피 카드는 스크롤로 완전히 접근 가능하며, 이번 변경에서 별도 bottom navigation 재설계는 하지 않았다.
