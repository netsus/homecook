# 30 YouTube Multi-Recipe Caption Extraction

## Scope

- 한 영상에 여러 요리가 있는 YouTube 레시피를 공개 텍스트만으로 후보 분리한다.
- 허용 source는 설명란, 공개 작성자 top-level 댓글, 공개 caption/timedtext다.
- 후보가 2개 이상이면 parent 추출 결과는 `recipe_candidates[]`를 반환하고, 사용자가 후보 하나를 선택해야 저장 가능하다.
- 후보 선택은 `POST /api/v1/recipes/youtube/candidate-drafts`로 child draft를 만들고 기존 검수/등록 흐름을 재사용한다.

## Non-Goals

- 특정 video_id별 fixture/하드코딩 금지
- 레시피오 생성 결과 반환 금지
- 유료 provider, 로그인 전용 caption, LLM, OCR/ASR 신규 도입 금지
- 공개 텍스트로 재료/단계를 찾지 못하는 영상의 임의 생성 금지

## Implementation Notes

- `youtube_extraction_sessions.session_kind`는 `single`, `multi_parent`, `candidate_child`를 구분한다.
- `youtube_extraction_candidates`는 parent 후보 ledger이며 promoted/registered 상태를 추적한다.
- `multi_parent` 세션은 register와 ingredient-registration을 직접 받을 수 없다.
- UI는 후보명, 재료 개수, 단계 수를 보여주고 선택 시 child draft를 불러온다.

## Verification

- backend targeted tests: `tests/youtube-import.backend.test.ts`
- helper tests: `tests/recipio-youtube-import.test.ts`
- required gates: `pnpm lint`, `pnpm typecheck`, targeted tests, `git diff --check`
