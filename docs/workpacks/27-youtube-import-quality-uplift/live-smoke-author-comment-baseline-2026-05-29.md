# Live YouTube Smoke + Author Comment Probe - 2026-05-29

## Scope

- App URL: `http://127.0.0.1:3100`
- Supabase mode: local Supabase (`http://127.0.0.1:54321`)
- App server: `pnpm dev:demo -- -p 3100`
- YouTube source: official YouTube Data API with `.env.local` `YOUTUBE_API_KEY`
- Mode: extract-only live smoke plus author top-level comment probe
- Registration: not performed
- Cleanup: 30 `youtube_extraction_sessions` rows deleted successfully after the run

This run was executed after PR #618 (`fix(youtube): improve parser fidelity for live recipes`) merged. It measures the current description-only import quality and checks whether an author-comment-only fallback is worth implementing before transcript/OCR/LLM fallback work.

## Sample

The 30-video sample combines:

- 10 YouTube Data API search results for query `레시피 고정 댓글`
- 20 videos from the earlier balanced 30 URL smoke set
- duplicate video IDs removed before execution

The author comment probe uses only:

- `commentThreads.list`
- `order=relevance`
- `maxResults=100`
- 1 page only
- top-level comments only
- comments where `topLevelComment.snippet.authorChannelId.value === video.snippet.channelId`

Viewer comments were not used as recipe candidates.

## Result Summary

| Metric | Result |
| --- | ---: |
| Actual YouTube URLs | 30 |
| Extract API transport success | 30/30 |
| Registration-ready drafts | 5/30 |
| Empty extraction | 18/30 |
| Partial but blocked extraction | 7/30 |
| API errors | 0/30 |
| Extracted ingredients | 140 |
| Resolved ingredients | 130 |
| Unresolved ingredients | 8 |
| Extracted steps | 87 |
| Incomplete steps | 2 |

## Author Comment Probe Summary

| Metric | Result |
| --- | ---: |
| Videos probed | 30 |
| Provider errors | 1 |
| Comments disabled | 1 |
| Author top-level comment present | 23/30 |
| Author comment with recipe signal | 16/30 |
| Description missing/weak but author comment has recipe signal | 10/30 |

## Bucket Summary

| Bucket | Count |
| --- | ---: |
| Description registration-ready | 5 |
| Description missing/weak but author comment has recipe signal | 10 |
| Dictionary blocked | 3 |
| Step blocked | 6 |
| Author comment absent | 5 |
| Comments disabled | 1 |

## URL Results

Ingredient column format: `total/resolved/unresolved`. Step column format: `total/incomplete`.

| # | Video ID | Outcome | Ingredients | Steps | Description recipe signal | Author recipe comments | Title |
| ---: | --- | --- | ---: | ---: | --- | ---: | --- |
| 1 | `Jkhy8ltj5WE` | step_blocked | 0/0/0 | 0/0 | yes | 1 | 단골 이자카야 사장님이 알려준 구운 달걀꼬치 비법 |
| 2 | `mdo6M1l1ocA` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 마늘쫑 소고기 볶음 |
| 3 | `I_gAKudK9oI` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 실패 없는 비빔국수 |
| 4 | `lO0UttVBKGs` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 소고기 끼미 |
| 5 | `ZYFdCFvVPNg` | dictionary_blocked | 10/5/5 | 12/0 | yes | 1 | 가지무침 |
| 6 | `I-SyuQIf1oo` | author_comment_candidate | 1/0/1 | 1/0 | no | 1 | 사과 피자 |
| 7 | `5qEpW3SM-Vg` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 애호박 가지 두부전 |
| 8 | `dYJJGesgHwo` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 고추장 수제비 |
| 9 | `fTqd1XaDPp0` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 시금치 오일 파스타 |
| 10 | `FMwgau6IO_Q` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 진미채볶음 간장편 |
| 11 | `-f-A4xLpDQE` | author_comment_absent | 0/0/0 | 0/0 | no | 0 | 한식 공식 |
| 12 | `2UH5gMZoG14` | comments_disabled | 11/10/1 | 5/0 | yes | 0 | 두부요리 |
| 13 | `vNwAQmppzyM` | author_comment_absent | 0/0/0 | 0/0 | no | 0 | 밥 필요 없어요 돌돌 말면 끝 |
| 14 | `o1UIiJQeviQ` | dictionary_blocked | 4/3/0 | 1/0 | yes | 1 | 밑반찬만들기 |
| 15 | `G6pH-cVeHEY` | description_ready | 10/10/0 | 9/0 | yes | 1 | 주머니 애호박전 |
| 16 | `9fmd1LOTa-E` | step_blocked | 15/15/0 | 1/1 | yes | 0 | 두부조림 |
| 17 | `HoqkIzuqFrU` | description_ready | 12/12/0 | 1/0 | yes | 1 | 마늘쫑 반찬 |
| 18 | `qvqX-KaeU8s` | dictionary_blocked | 39/37/1 | 31/0 | yes | 0 | 한그릇 요리 7가지 |
| 19 | `eU6VoHNUTlM` | author_comment_absent | 0/0/0 | 0/0 | no | 0 | 라면만큼 쉬운 레시피 |
| 20 | `_PUFZM6vZQw` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 전자렌지 수육보쌈 |
| 21 | `-sxyXlAFEhM` | description_ready | 9/9/0 | 21/0 | yes | 0 | 황태채무침 |
| 22 | `KAMZSgRN4WQ` | description_ready | 8/8/0 | 3/0 | yes | 1 | 콩나물무침 |
| 23 | `wyPm621Q0TE` | step_blocked | 0/0/0 | 0/0 | no | 0 | 반찬가게 인기 반찬 |
| 24 | `Wb_rU9Sdm80` | description_ready | 10/10/0 | 1/0 | yes | 0 | 김무침 |
| 25 | `NwofrlmaDAc` | author_comment_absent | 0/0/0 | 0/0 | no | 0 | 시금치무침 |
| 26 | `ehIHFCBZp4E` | step_blocked | 11/11/0 | 1/1 | yes | 0 | 어묵볶음 |
| 27 | `6Re_tEaAjDQ` | step_blocked | 0/0/0 | 0/0 | no | 0 | 무생채 |
| 28 | `Rjfzpzj3bug` | step_blocked | 0/0/0 | 0/0 | no | 0 | 알배추 레시피 |
| 29 | `FSOj5BPSM-Q` | author_comment_candidate | 0/0/0 | 0/0 | no | 1 | 항정살 수육 |
| 30 | `B6wncU2E12g` | step_blocked | 0/0/0 | 0/0 | no | 0 | 용암만들기 튜토리얼 |

## Author Comment Candidate Videos

These 10 videos had no/weak description recipe signal but did have an author top-level comment with recipe signal:

| Video ID | Candidate reason |
| --- | --- |
| `mdo6M1l1ocA` | title points to pinned/comment recipe, author comment contains recipe-like structured text |
| `I_gAKudK9oI` | title points to pinned/comment recipe, author comment contains recipe-like structured text |
| `lO0UttVBKGs` | title references fixed comment, author comment contains recipe-like structured text |
| `I-SyuQIf1oo` | description is weak, author comment contains recipe-like structured text |
| `5qEpW3SM-Vg` | title points to pinned/comment recipe, author comment contains recipe-like structured text |
| `dYJJGesgHwo` | title says recipe is in fixed comment, author comment contains recipe-like structured text |
| `fTqd1XaDPp0` | title points to pinned/comment recipe, author comment contains recipe-like structured text |
| `FMwgau6IO_Q` | title references fixed comment, author comment contains recipe-like structured text |
| `_PUFZM6vZQw` | description is empty in API result, author comment contains recipe-like structured text |
| `FSOj5BPSM-Q` | description is empty in API result, author comment contains recipe-like structured text |

This is enough evidence to proceed with an author-comment-only fallback. The fallback should not wait for transcript/OCR/LLM decisions.

## Implementation Implications

1. **Author comment fallback has high ROI**
   - 10/30 videos were empty or unusable from the description but had an author recipe-signal comment.
   - Search results that explicitly mention `고정 댓글` are especially strong candidates.

2. **Author-only filtering is necessary**
   - The probe only counted comments whose `authorChannelId.value` matched the video `channelId`.
   - This keeps viewer tips, guesses, jokes, and unrelated replies out of parser input.

3. **Description-first still matters**
   - 5/30 videos are already registration-ready from description extraction.
   - The fallback should skip the comment API when description extraction is already ready.

4. **Provider failures should degrade**
   - 1/30 had comments disabled.
   - Comments-disabled should be diagnostic metadata, not an extract failure.

5. **Dictionary and step blockers remain separate**
   - 3 videos are still dictionary-blocked.
   - 6 videos are step-blocked.
   - Author comments can help source coverage, but it will not replace dictionary and step-quality work.

## Next Recommendation

Proceed to `29-youtube-author-comment-fallback` Stage 1 contract/workpack, then backend implementation:

- Add author-comment provider using official `commentThreads.list`.
- Query at most 1 page with `order=relevance`, `maxResults=100`.
- Filter strictly to video author top-level comments.
- Reuse the existing deterministic parser.
- Include `author_comment` in `extraction_methods` only when author comment text materially contributes ingredients or steps.
- Record attempted/disabled/provider-error diagnostics in extraction metadata even when author comments are not used.
