# COOK_MODE cooked-batch-weight-ledger Stage 4 Design QA

> 이 문서는 Stage 4 저자의 내부 구현 QA다. 독립 Stage 5, product-design-authority, Stage 6 승인이나 Design Status `confirmed`를 대신하지 않는다.

## 비교 대상

- source visual truth
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png`
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png`
- implementation screenshot
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-desktop-1280.png`
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-default-390.png`
  - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-narrow-320.png`
- state: snapshot-v2 COOK_MODE completion sheet open, initial pantry selection 0, weight action unselected, completion CTA disabled
- runtime viewport / density
  - desktop: CSS `1280 x 900`, screenshot `1280 x 900`, device scale factor `1`
  - default: CSS `390 x 844`, screenshot `390 x 844`, device scale factor `1`
  - narrow: CSS `320 x 568`, screenshot `320 x 568`, device scale factor `1`
- source pixels
  - default state montage: `390 x 3949`
  - narrow state montage: `320 x 5158`

Stage 1 PNG는 여러 상태를 세로로 이어 붙인 정적 보드라서 전체 이미지의 높이와 sheet y 좌표를 실제 viewport 높이로 해석하지 않았다. 전체 보드와 실제 runtime 원본을 한 비교 입력에서 열고, default 상태 구간은 390px 폭과 844px 높이로 정규화해 구성·위계·간격·상태를 비교했다.

## Full-view comparison

- 정보 구조: whole-board 위 familiar bottom sheet, 제목/설명, no-guess 안내, 재료별 exact row, exact-one weight action, 고정 footer 순서가 유지된다.
- 반응형: 390px에서는 세 row와 weight action이 읽히고, 320px에서는 본문만 내부 스크롤하며 footer가 계속 보인다. 좁은 화면의 weight action은 `scrollIntoViewIfNeeded()` 후 실제로 접근 가능함을 검사했다.
- 가로 overflow: 390px/320px 모두 `documentElement.scrollWidth <= clientWidth`다.

## Focused region comparison

- typography: 저장소의 기존 한국어 앱 타이포와 weight/section 위계를 재사용했다. 320px 설명과 안내 문구는 잘리지 않고 줄바꿈된다.
- spacing/layout rhythm: 승인 시안과 모바일 규칙의 좌우 16px를 #8 sheet에만 적용했다. row target은 44px 이상이며 section/row 간격은 기존 token과 16px 리듬을 따른다.
- colors/tokens: 새 색상 값을 만들지 않고 global CSS token만 사용했다. 안내 상자의 12px 파란 글자 대비 3.53:1 결함은 진한 본문 token으로 교체해 serious/critical axe 위반 0건으로 닫았다.
- image quality/assets: 이 sheet에는 새 raster asset이 없다. 기존 공용 ModalHeader의 닫기 아이콘과 공용 overlay shell을 그대로 재사용했다.
- copy/content: 완성 직후 음식 전체 중량, 용기·그릇 제외, 현재 남은 양 아님, 나중에 입력, 실제 사용 row만 선택 문구가 공식 #8 의미를 보존한다.

## Comparison history

1. P2 — 실제 사용 row 안내 누락
   - fix: 동일 원재료의 제품/팬트리 row가 다를 수 있으며 실제 사용 row만 선택하라는 안내를 추가했다.
   - post-fix evidence: final 390px/320px implementation PNG.
2. P1 — 안내 상자 WCAG AA 대비 부족
   - evidence: axe `color-contrast`, 3.53:1, required 4.5:1.
   - fix: 배경은 유지하고 foreground를 `--wave1-ink`로 교체했다.
   - post-fix evidence: canonical Playwright grep에서 serious/critical axe violation 0.
3. P2 — runtime 좌우 여백 20px와 승인 시안 16px 불일치
   - fix: 공용 overlay 기본값은 보존하고 #8 sheet에만 `px-4`를 주입했다.
   - post-fix evidence: runtime heading x 좌표가 16px임을 Playwright로 고정했다.
4. P3 — programmatic title focus의 브라우저 기본 outline 노출
   - fix: 비상호작용 heading의 focus announcement는 유지하고 공용 title에 `outline-none`을 적용했다.
   - post-fix evidence: final implementation PNG에서 불필요한 파란 사각 outline이 없다.

## Findings

- 남은 actionable P0/P1/P2: 없음.
- Contract Evolution Candidate, 구현하지 않음: Stage 1 정적 예시의 `냉장고`/`냉동실` 같은 저장 위치는 공식 `pantry_candidates`에 public field가 없다. runtime은 실제 제품명·브랜드와 같은 원재료 그룹 안의 행 순번만 표시하며 raw UUID나 저장 위치를 추측하지 않는다. 위치 문구가 반드시 필요하다면 별도 공식 계약 승인이 선행되어야 한다.
- source montage의 y 위치와 runtime bottom-sheet y 위치 차이는 정적 다중상태 보드와 실제 viewport의 차이이므로 visual defect로 분류하지 않았다.

## Runtime checks

- primary interactions: open, exact row select, known weight, weigh later, 409 retry, pending lock, Escape close/lock, focus trap, opener focus restore, terminal replay single close
- accessibility: 44px targets, dialog semantics, focus isolation, body lock, no horizontal overflow, serious/critical axe violation 0
- browser console errors: canonical capture test에서 0건을 요구한다.

final result: passed
