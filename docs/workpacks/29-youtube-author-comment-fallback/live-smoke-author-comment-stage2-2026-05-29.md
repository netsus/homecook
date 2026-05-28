# Stage 2 Author Comment Live Smoke - 2026-05-29

## Scope

- Provider: official YouTube Data API
- Calls:
  - `videos.list(part=snippet)`
  - `commentThreads.list(part=snippet,textFormat=plainText,order=relevance,maxResults=100)`
- Source rule: top-level comments only, filtered by `topLevelComment.snippet.authorChannelId.value === video.snippet.channelId`
- Registration: not performed
- App extract route: not exercised in this small Stage 2 smoke; full route/DB live smoke remains in the later closeout gate.
- Secret handling: `.env.local` `YOUTUBE_API_KEY` was used locally and not printed.

## Result

Run id: `youtube-author-comment-live-smoke-stage2-2026-05-29`

| Video ID | HTTP | Top-level comments | Author top-level comments | Author recipe-signal comments | Title |
| --- | ---: | ---: | ---: | ---: | --- |
| `mdo6M1l1ocA` | 200 | 4 | 1 | 1 | 마늘쫑 소고기 볶음 |
| `I_gAKudK9oI` | 200 | 8 | 1 | 1 | 실패 없는 비빔국수 |
| `_PUFZM6vZQw` | 200 | 39 | 1 | 1 | 전자렌지 수육보쌈 |

## Interpretation

- `youtube-author-comment-live-smoke` provider path is available for the sampled URLs.
- The declared one-page cap and relevance order were used.
- Each sampled URL had exactly one author top-level comment with recipe signal.
- This smoke confirms the external comments API path only. It does not replace the later 30+ URL extract/register smoke required before final slice closeout.
