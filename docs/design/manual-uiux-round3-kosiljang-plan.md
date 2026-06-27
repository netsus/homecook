# Manual UI/UX Round 3 - Kosiljang Plan

## Purpose

This plan preserves the operating rules for the third manual UI/UX improvement loop.

The user will manually inspect the service and report uncomfortable, confusing, or visually odd points. Codex is called `코실장` in this loop. 코실장 must judge each report as a product/UI/UX proposal, not as an automatic implementation command.

Canonical accumulated fix plan:

- `docs/design/manual-uiux-review-fix-plan.md`

Related standing context:

- `.omx/notepad.md`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`

## Role

코실장은 사용자의 지적을 그대로 실행하지 않는다. 먼저 아래를 판단한다.

1. 실제 사용자가 혼란을 느낄 가능성이 있는가
2. 핵심 흐름의 조작감, 신뢰도, 완성도를 떨어뜨리는가
3. 모바일/웹 중 하나에서 화면 품질이나 정보 구조를 깨뜨리는가
4. 기존 공식 계약, 화면 정의, 상태 전이, 권한 규칙과 충돌하는가
5. 고친다면 작은 polish인지, high-risk UI change인지, contract-evolution이 필요한지

## Response Contract

사용자가 새 불편함이나 이상한 점을 말하면 코실장은 한국어로 짧고 객관적으로 답한다.

Recommended answer shape:

1. `판단`: 고치는 게 맞음 / 일부만 맞음 / 보류가 맞음 / 지금은 안 고치는 게 맞음
2. `이유`: 사용자 영향과 UI/UX 근거
3. `수정 방향`: 너무 크게 갈아엎지 않고 안전하게 고치는 방법
4. `기록`: 계획 문서에 추가했는지, 보류 항목으로 남겼는지

명령조 요청이어도 같은 판단 과정을 유지한다. 단, 명백한 오탈자나 아주 작은 UI 깨짐은 과하게 논쟁하지 않고 바로 계획에 기록한다.

## Decision Rules

Add to the canonical plan when:

- 핵심 행동이 잘 안 보이거나 잘못 눌릴 수 있다.
- 사용자가 어디로 가야 하는지, 무엇을 해야 하는지 헷갈릴 수 있다.
- 모바일 좁은 폭에서 잘림, 겹침, 과한 여백, 터치 어려움이 생긴다.
- 화면마다 같은 패턴이 다르게 보여 신뢰감을 떨어뜨린다.
- empty/loading/error/read-only 상태가 사용자를 막다른 길로 보낸다.
- 접근성 포커스, contrast, hit target, aria 의미가 약해진다.

Hold or reject when:

- 단순 취향 차이에 가깝고 사용자 영향이 약하다.
- 공식 계약과 충돌하며 사용자 승인이 필요한데, 승인 없이 구현을 전제해야 한다.
- 기존에 잘 작동하는 interaction model을 큰 비용으로 바꿔야 한다.
- 한 화면의 작은 불편을 고치려다 공용 패턴을 더 불안정하게 만든다.

If directionally right but risky:

- safer product version을 제안한다.
- 공식 계약 변경이 필요하면 `contract-evolution` 필요성을 명시한다.
- 구현 계획에는 문서/API/DB/테스트 영향도를 함께 적는다.

## Recording Rules

Primary recording target:

- `docs/design/manual-uiux-review-fix-plan.md`

For each accepted item, append a numbered section using the existing format:

- `Status`
- `Severity`
- `Area`
- `Source`
- `Problem`
- `User impact`
- `Approach decision` when useful
- `Recommended fix`
- `Acceptance criteria`
- `Likely implementation target`
- `Verification`

For weak or preference-only items:

- Do not force them into `확정 수정 항목`.
- Put them under `보류 항목` with a short reason, or ask for more evidence only if truly needed.

## Round 3 Execution Plan

1. Intake user findings one by one or in batches.
2. For each finding, classify it before editing code.
3. Update `docs/design/manual-uiux-review-fix-plan.md` first.
4. Group accepted items into small implementation batches by risk and touched files.
5. Before implementation, lock behavior with targeted tests when the behavior is not already protected.
6. For UI changes, capture or review current-state evidence when visual judgment matters.
7. Implement only the accepted batch.
8. Run appropriate verification:
   - docs-only planning: file diff review
   - frontend polish: targeted Vitest plus `pnpm verify:frontend:pr` when scope justifies it
   - high-risk UI: screenshots at default mobile and narrow mobile widths, plus relevant Playwright checks
   - contract-impacting change: contract-evolution docs before product implementation
9. Report changed files, simplifications made, verification, and remaining risks.

## Current Starting Point

As of 2026-06-21, the previous canonical plan contains 31 manual-review items. The next user-reported issue should be treated as Round 3 intake, not as a continuation of an unrecorded implementation task.

Accepted product issues should be written in detail to `docs/design/manual-uiux-review-fix-plan.md`, because that is the canonical ledger for the manual UI/UX fix loop. This Round 3 file keeps only the operating rules and a short intake index so the same issue is not described in two places.

## Round 3 Intake Index

Detailed entries live in `docs/design/manual-uiux-review-fix-plan.md`.

| Canonical item | Summary | Status |
| --- | --- | --- |
| 32 | 웹 홈 레시피 카드의 세로 간격이 태그 줄 수에 따라 달라지는 문제 | implemented in `fix/manual-uiux-round3-redo` |
| 33 | 웹 홈 카드의 `+N` 태그 표시가 상세 화면과 맞지 않아 추가 태그처럼 오해되는 문제 | implemented in `fix/manual-uiux-round3-redo` |
| 34 | 홈/전역 프로필 버튼이 단순 이동만 해서 내 상태와 알림을 즉시 확인하기 어려운 문제 | implemented in `fix/manual-uiux-round3-redo` |
| 35 | 신규/초기 사용자의 튜토리얼 단계가 홈에서 자연스럽게 안내되지 않는 문제 | implemented in `fix/manual-uiux-round3-redo` |
| 36 | 웹과 앱의 주요 화면에서 프로필 진입점 위치가 일관되지 않은 문제 | planned |
| 37 | 여러 알림/피드백 팝업의 형식이 경험치 알림과 달라 서비스 알림 체계가 분산되는 문제 | planned |
| 38 | 마이페이지 알림 버튼에서 과거 성장 알림을 확인하는 흐름이 더 명확해야 하는 문제 | planned |
| 39 | 웹 레시피 저장 모달의 새 레시피북 만들기 영역이 앱보다 무겁고 덜 예뻐 보이는 문제 | implemented |
| 40 | 앱 레시피 저장 모달의 `레시피북 다중 선택` 설명이 불필요하게 보이는 문제 | implemented |
| 41 | 앱 홈의 `이번 주 인기 테마`가 레시피 목록 중간이 아니라 위/아래로 치우치는 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 42 | 앱 홈 sticky 검색창의 수직 정렬과 검색창/태그 경계가 어색한 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 43 | 홈 퀵슬롯의 `성장 보기`를 `유튜브 가져오기`로 바꾸는 문제 | implemented |
| 44 | 재료 검색/추가 모달의 카테고리 rail과 웹 재료 4열 배열이 의도와 다르게 적용된 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 45 | 웹 레시피상세의 재료/만들기 너비와 구분선이 어색한 문제 | implemented |
| 46 | 앱 레시피상세 하단 CTA와 하단 탭 사이 틈으로 뒤 화면이 보이는 문제 | implemented |
| 47 | 웹 레시피상세 인분조절 버튼의 `-`/`+` 색상과 크기가 앱과 맞지 않는 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 48 | 웹 플래너에 추가 모달의 font-weight 위계가 어색한 문제 | implemented |
| 49 | 웹 요리모드 보드가 화면 높이를 충분히 활용하지 못하는 문제 | implemented |
| 50 | 앱 요리모드 상단 header가 제목을 별도 줄로 써 화면 높이를 낭비하는 문제 | implemented |
| 51 | 요리모드 조리법 태그 정렬과 본문 내 조리법 강조가 부족한 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 52 | 앱 요리모드 전체 재료 카드가 과하게 넓어 정보 밀도가 낮은 문제 | implemented |
| 53 | 레시피상세에서 진입한 요리모드에 `독립요리` 문구가 노출되는 문제 | implemented |
| 54 | 앱 플래너 카드에서 긴 레시피 제목이 카드 높이를 키우는 문제 | implemented |
| 55 | 앱 플래너 한 끼니에 여러 레시피가 세로로 쌓이고 `+N`이 약한 문제 | implemented |
| 56 | 앱 플래너 이번 주 요약 텍스트가 작고 정렬감이 약한 문제 | implemented |
| 57 | 웹 식사추가 첫 진입 시 레시피 검색 패널은 보이지만 왼쪽 버튼이 선택 상태가 아닌 문제 | implemented |
| 58 | 앱 식사추가 옵션의 레시피북 항목이 커버/색상 없이 밋밋해 보이는 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 59 | 웹 장보기 준비 전체선택 체크 표시 색상이 충분히 보이지 않는 문제 | implemented |
| 60 | 앱 장보기 준비의 요약정보 크기와 배경 구조가 선택 확인에 약한 문제 | implemented |
| 61 | 웹 장보기 리스트 전체선택 체크 표시와 보조 텍스트가 어색한 문제 | implemented |
| 62 | 웹 장보기 리스트 재료 카드의 재료명/양 배치가 공간을 비효율적으로 쓰는 문제 | implemented |
| 63 | 웹/앱 장보기 리스트의 재료양이 재료명보다 액션 쪽에 붙어 보이는 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 64 | 웹 장보기 완료 전 팬트리 반영 모달의 크기와 재료명 가독성이 부족한 문제 | reworked in `fix/manual-uiux-round3-redo` |
| 65 | 팬트리 재료추가 검색이 선택된 카테고리 안에서만 동작해 결과를 숨기는 문제 | implemented |
| 66 | 팬트리 재료추가 선택 칩이 검색 결과 변경 시 사라지는 문제 | implemented |
| 67 | 웹/앱 팬트리에서 같은 재료의 시각 표시가 서로 다르게 보이는 문제 | implemented |
| 68 | 정식 배포 전 공식 식품 데이터 기반 ingredient DB 적재가 필요한 문제 | production load plan confirmed; execution gated |
| 69 | 마이페이지 로딩 중 먼저 로드된 아래 섹션이 위 섹션 완료에 따라 밀리는 문제 | implemented |
| 70 | 404 페이지에서 보낸 사용자 피드백을 admin에서 별도 탭으로 확인할 수 없는 문제 | implemented |
| 71 | 모든 재료가 팬트리에 있을 때 장보기목록 생성 선택권이 없는 문제 | implemented in `fix/shopping-empty-list-choice` |
| 72 | 팬트리 묶음 추가 성공 후 묶음추가 모달이 닫혀 반복 추가가 끊기는 문제 | implemented in `fix/shopping-empty-list-choice` |
| 73 | 프로필 요약의 알림 보기 버튼이 현재 화면을 떠나 마이페이지로 이동하는 문제 | implemented in `fix/profile-notifications-inline-modal` |
| 74 | 업적/경험치 토스트를 눌러도 현재 페이지에서 알림 기록을 열 수 없는 문제 | implemented in `fix/profile-notifications-inline-modal` |
| 75 | 튜토리얼 퀘스트 안내가 첫 단계부터 순서대로 이어지지 않는 문제 | implemented in `fix/profile-notifications-inline-modal` |
| 76 | 웹 홈 추천 태그와 인기 테마가 검색창 라인보다 낮아 오른쪽 상단이 비어 보이는 문제 | implemented in `fix/profile-notifications-inline-modal` |
| 77 | 닉네임 온보딩 진입 전 프로필 확인 로딩 문구가 빠르게 사라져 어색한 문제 | implemented in `fix/profile-notifications-inline-modal` |
| 78 | 웹 홈 오른쪽 추천 레일이 레시피 목록 시작 위치를 과하게 밀어내는 문제 | implemented locally in `fix/home-right-rail-gap` |
| 79 | 프로필 요약에서 연 알림 기록 모달이 화면 위로 잘리고 닫기 어려운 문제 | implemented locally in `fix/home-right-rail-gap` |
| 80 | 첫 튜토리얼 완료 후 두 번째 튜토리얼 안내가 토스트/프로필 요약에 뜨지 않는 문제 | implemented locally in `fix/home-right-rail-gap` |
| 81 | 프로필 요약에 남은 마이페이지 이동 링크와 튜토리얼 알림 재확인/장보기 안내 문구가 어색한 문제 | implemented locally in `fix/profile-summary-tutorial-archive` |
| 82 | 공공 레시피 상세 이미지가 작은 원본을 `cover`로 확대해 잘리고 흐리게 보이는 문제 | implemented in `fix/public-recipe-detail-gallery` |
| 83 | 비로그인 상태로 플래너 진입 시 `잠시만 기다려주세요`가 짧게 보인 뒤 로그인 화면으로 바뀌는 문제 | implemented |
| 84 | 웹/앱 전역 스켈레톤이 실제 화면과 맞지 않고 여러 단계로 바뀌어 화면이 바빠 보이는 문제 | planned |
| 85 | 첫 회원가입 튜토리얼 안내 토스트가 닉네임 확정 전/전환 중에 뜰 수 있는 문제 | planned |
| 86 | 튜토리얼 안내 알림이 알림모달 전체 탭과 완료 후 시스템 기록에 일관되게 남지 않는 문제 | planned |
| 87 | 알림모달의 알림 글자 크기가 작아 읽기 어려운 문제 | planned |
| 88 | 프로필요약 튜토리얼 안내 섹션에서 제목과 안내 문구가 구분되지 않는 문제 | planned |
| 89 | 홈 `이번 주 인기 테마`의 크기와 분류 기준이 현재 데이터와 맞지 않는 문제 | planned |
| 90 | 레시피 저장 모달을 열 때 로딩이 오래 걸리는 문제 | planned |
| 91 | 앱 레시피상세 리뷰탭이 미개발 기능을 빈 리뷰처럼 안내하는 문제 | planned |
| 92 | 웹 장보기 화면 우측상단에 프로필요약 진입점이 없는 문제 | planned |
| 93 | 우측상단 프로필이미지 클릭이 아직 마이페이지 이동으로 남아 있는 문제 | planned |
| 94 | 웹/앱 요리모드 스켈레톤이 실제 요리모드 화면과 맞지 않는 문제 | implemented in `fix/cook-mode-legibility-polish` |
| 95 | 웹/앱 요리모드 재료 폰트가 작아 조리 중 보기 어려운 문제 | implemented in `fix/cook-mode-legibility-polish` |
| 96 | 요리완료 소진재료 확인 모달의 전체선택 상태와 체크 표시 색상이 불명확한 문제 | implemented |
| 97 | 웹 레시피북 생성 input 내부에 불필요한 파란 박스가 생기는 문제 | implemented |
| 98 | 앱 레시피북 생성 완료/취소가 텍스트만 보여 버튼으로 인식되기 약한 문제 | implemented |
| 99 | 첫 경험치 안내까지 모두 토스트/모달로 보여 성장 알림이 복잡해지는 문제 | planned |
| 100 | 팬트리 재료추가/묶음추가가 오래 걸리는 문제 | planned |
| 101 | 요리모드에서 조리법이 여러 개인 단계의 조리법 태그가 세로로 쌓이는 문제 | implemented in `fix/cook-mode-legibility-polish` |
