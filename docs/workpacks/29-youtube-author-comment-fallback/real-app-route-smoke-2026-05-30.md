# YouTube Real App-Route Smoke - 2026-05-30

## Scope

- Run id: `youtube-real-app-route-smoke-2026-05-30-4a86b13e`
- Started at: `2026-05-29T15:17:29.271Z`
- App URL: `http://127.0.0.1:3128`
- Mode: Playwright Chromium, real Supabase Auth session, real app route calls, real YouTube provider calls
- Auth override/API mocks: not used
- DB verification: Supabase service role
- Cleanup: generated recipe/session rows deleted after verification; persistent test auth account retained
- Raw artifact: `/Users/shj/2025/2026/homecook1/.artifacts/youtube-real-app-route-smoke/youtube-real-app-route-smoke-2026-05-30-4a86b13e/report.json`
- Screenshot dir: `/Users/shj/2025/2026/homecook1/.artifacts/youtube-real-app-route-smoke/youtube-real-app-route-smoke-2026-05-30-4a86b13e`

## Summary

| Metric | Result |
| --- | ---: |
| URLs attempted | 30 |
| validate route ok | 30/30 |
| extract route ok | 30/30 |
| review screen reached | 30/30 |
| author_comment used | 4/30 |
| register attempted | 9/30 |
| register succeeded | 9/30 |
| cleaned recipes | 9 |
| cleaned sessions | 30 |

## Result Table

| # | Bucket | Video ID | Methods | Review | Register | DB | Cleanup | Notes |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | structured | `-f-A4xLpDQE` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 2 | structured | `2UH5gMZoG14` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:11<br>steps:5 | recipe, session | provider closeout: comments disabled, description signal present |
| 3 | structured | `vNwAQmppzyM` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 4 | structured | `o1UIiJQeviQ` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 확인 필요한 재료 |
| 5 | structured | `G6pH-cVeHEY` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:10<br>steps:9 | recipe, session | provider closeout: description signal and author recipe signal |
| 6 | semi_structured | `9fmd1LOTa-E` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 필수 만들기 |
| 7 | semi_structured | `HoqkIzuqFrU` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:12<br>steps:1 | recipe, session | provider closeout: description signal and author recipe signal |
| 8 | semi_structured | `qvqX-KaeU8s` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:39<br>steps:31 | recipe, session | provider closeout: description signal, author comment present without recipe signal |
| 9 | semi_structured | `eU6VoHNUTlM` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 10 | semi_structured | `_PUFZM6vZQw` | comment | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 확인 필요한 재료 |
| 11 | weak | `-sxyXlAFEhM` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 확인 필요한 재료 |
| 12 | weak | `KAMZSgRN4WQ` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:8<br>steps:3 | recipe, session | provider closeout: description signal and author recipe signal |
| 13 | weak | `wyPm621Q0TE` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 14 | weak | `Wb_rU9Sdm80` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:10<br>steps:1 | recipe, session | provider closeout: description signal, no author comments |
| 15 | weak | `NwofrlmaDAc` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 16 | shorts_weak | `ehIHFCBZp4E` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 필수 만들기 |
| 17 | shorts_weak | `6Re_tEaAjDQ` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 18 | shorts_weak | `Rjfzpzj3bug` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 19 | shorts_weak | `FSOj5BPSM-Q` | comment | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 확인 필요한 재료 |
| 20 | shorts_weak | `B6wncU2E12g` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 21 | multi_component | `j0v1GCA3fxk` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 필수 만들기 |
| 22 | multi_component | `Dc8ybaJMnK4` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 23 | multi_component | `VdEbuusFyRI` | comment | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 만들기 확인 필요한 재료 |
| 24 | multi_component | `_VV-51nh_LA` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:10<br>steps:2 | recipe, session | provider closeout: description signal, author comment present without recipe signal |
| 25 | multi_component | `ex_5qaexoO8` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 26 | baking_or_global | `_kwOeDDOtww` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 재료 만들기 |
| 27 | baking_or_global | `0zcXAJyfZNo` | description | yes | success | session:consumed<br>recipe:yes<br>ingredients:4<br>steps:13 | recipe, session | provider closeout: description signal, author comment present without recipe signal |
| 28 | baking_or_global | `mOV2mP4DsQs` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 필수 만들기 |
| 29 | baking_or_global | `BRDUvwiXEQA` | description | yes | blocked | session:draft<br>recipe:-<br>ingredients:0<br>steps:0 | session | requirements: 등록하려면 아래 항목을 확인해주세요. 필수 만들기 |
| 30 | baking_or_global | `nOFkL1cGGjE` | comment | yes | success | session:consumed<br>recipe:yes<br>ingredients:6<br>steps:4 | recipe, session | provider closeout: no description signal, author recipe signal |

## Cleanup

- Deleted recipe IDs: 9
- Deleted extraction session IDs: 30
- Remaining recipe rows after cleanup: 0
- Remaining extraction session rows after cleanup: 0
- The test auth account and public user row were retained for repeatable smoke runs.

## Limitations

- This is the 30 URL app-route measurement for the balanced provider closeout sample.
- Register is attempted only when the review UI enables the register action. Blocked drafts are recorded with visible requirements.
- YouTube provider availability and parser output can change over time, so this report is a point-in-time smoke result.
