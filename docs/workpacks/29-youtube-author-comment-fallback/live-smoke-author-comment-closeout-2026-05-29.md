# Author Comment Fallback Live Smoke Closeout - 2026-05-29

## Scope

- Run id: `youtube-author-comment-live-smoke-closeout-2026-05-29`
- Provider path: official YouTube Data API v3 `videos.list` + `commentThreads.list`
- Sample source: balanced 30 URL set from `docs/workpacks/27-youtube-import-quality-uplift/live-smoke-expanded-2026-05-26.md`
- Mode: provider-level author top-level comment probe
- App extract/register route: not exercised in this provider closeout smoke
- Secret handling: local `.env.local` `YOUTUBE_API_KEY` was used and not printed
- Raw artifact: `/tmp/youtube-author-comment-live-smoke-closeout-2026-05-29.json`

## Summary

| Metric | Result |
| --- | ---: |
| Actual YouTube URLs | 30 |
| `videos.list` success | 30/30 |
| `commentThreads.list` success | 29/30 |
| Comment API disabled/error | 1/30 |
| Author top-level comment present | 19/30 |
| Author top-level comment with recipe signal | 13/30 |
| Description had no recipe signal but author comment had recipe signal | 5/30 |

Bucket summary:

| Bucket | Count | Comment API OK | Author comment present | Author recipe-signal comment |
| --- | ---: | ---: | ---: | ---: |
| structured | 5 | 4 | 2 | 2 |
| semi_structured | 5 | 5 | 3 | 2 |
| weak | 5 | 5 | 3 | 3 |
| shorts_weak | 5 | 5 | 5 | 3 |
| multi_component | 5 | 5 | 3 | 2 |
| baking_or_global | 5 | 5 | 3 | 1 |

## Result Table

`Description signal` is a lightweight probe signal only; the app parser can still extract more or less depending on structure.

| # | Bucket | Video ID | Comment status | Author comments | Author recipe-signal comments | Description signal | Title |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
| 1 | structured | `-f-A4xLpDQE` | ok | 0 | 0 | no | 초보도 요리고수 만들어주는 무조건 외워야하는 한식 공식#간설파마후참깨#한식 |
| 2 | structured | `2UH5gMZoG14` | commentsDisabled | 0 | 0 | yes | 너무 맛있고 건강한 두부요리! 꼭 이렇게 드셔보세요! #레시피 |
| 3 | structured | `vNwAQmppzyM` | ok | 0 | 0 | no | 밥 필요 없어요 돌돌 말면 끝! |
| 4 | structured | `o1UIiJQeviQ` | ok | 1 | 1 | yes | 금세 사라져요 #밑반찬만들기 |
| 5 | structured | `G6pH-cVeHEY` | ok | 1 | 1 | yes | 명절마다 인기 폭발! 신박하고 간단한 영양만점 주머니 애호박전 #레시피 |
| 6 | semi_structured | `9fmd1LOTa-E` | ok | 0 | 0 | yes | 두부조림 이렇게 하는게 가장 맛있습니다. 안보면 후회하는 뒤집어지게 맛있는 방법! 들기름으로 먼저 구우면 맛이 20배 |
| 7 | semi_structured | `HoqkIzuqFrU` | ok | 1 | 1 | yes | 마늘쫑에 '이것' 넣었더니 남편이 삼겹살 사온대요! |
| 8 | semi_structured | `qvqX-KaeU8s` | ok | 1 | 0 | yes | 밑반찬 없어도 돼요! 이렇게 하면 일주일이 편한 한그릇 요리 7가지 ! |
| 9 | semi_structured | `eU6VoHNUTlM` | ok | 0 | 0 | yes | 라면만큼 쉬운 레시피 |
| 10 | semi_structured | `_PUFZM6vZQw` | ok | 1 | 1 | no | 이제 불 앞에 서서 고기 삶지 마세요! #수육 #수육만들기 #쉬운요리 #전자렌지요리 #kfood #recipe #bossam #kimchi |
| 11 | weak | `-sxyXlAFEhM` | ok | 1 | 1 | yes | 황태채무침 보들보들하고 촉촉하게 고급반찬 아끼고 아낀 비법 알려드릴게요 |
| 12 | weak | `KAMZSgRN4WQ` | ok | 1 | 1 | yes | [150만] 맛있는 콩나물무침 레시피 |
| 13 | weak | `wyPm621Q0TE` | ok | 1 | 1 | no | 반찬가게에서 가장 많이 팔림 |
| 14 | weak | `Wb_rU9Sdm80` | ok | 0 | 0 | yes | 명절에 선물 받은 김이 있다면 밑반찬 만들어 보세요 /김무침 황금레시피 |
| 15 | weak | `NwofrlmaDAc` | ok | 0 | 0 | no | 30여년간 백반집 운영하신 우리엄마 시금치 무치는 방법#레시피 #반찬 #집밥 #cooking #시금치무침 |
| 16 | shorts_weak | `ehIHFCBZp4E` | ok | 1 | 0 | yes | 어묵볶음은 이제 남편한테 넘겨주세요 #shorts #어묵볶음#집밥#레시피 |
| 17 | shorts_weak | `6Re_tEaAjDQ` | ok | 1 | 1 | no | 편스토랑 류수영 무생채 황금레시피/새콤달콤 무생채 만드는법/여름무생채 무침요리/#shorts |
| 18 | shorts_weak | `Rjfzpzj3bug` | ok | 1 | 1 | yes | 절대 모르면 안되는 알배추 레시피 |
| 19 | shorts_weak | `FSOj5BPSM-Q` | ok | 1 | 1 | no | 항정살 수육 boiled pork jowl #레시피 #요리 #쇼츠 #food #easyrecipe #trending #cooking #recipe #youtubeshorts |
| 20 | shorts_weak | `B6wncU2E12g` | ok | 1 | 0 | yes | 용암만들기 튜토리얼 |
| 21 | multi_component | `j0v1GCA3fxk` | ok | 0 | 0 | yes | [3분 완성] 만능양념장 영업비밀 공개합니다 |
| 22 | multi_component | `Dc8ybaJMnK4` | ok | 0 | 0 | no | 고기 찍어먹는 간장소스, 육장 레시피 공개!! |
| 23 | multi_component | `VdEbuusFyRI` | ok | 1 | 1 | yes | 이 레시피로 당장 음식점 오픈해도 됨~만능양념장의 정확한 레시피 알려드립니다 업소용 만능 볶음요리소스 이 양념장 하나로 종결~ 제육볶음 오징어볶음 닭갈비 순대볶음 다 가능 |
| 24 | multi_component | `_VV-51nh_LA` | ok | 1 | 0 | yes | 만능양념장 의비밀/빨간양념/koreansauce/매직소스 :)제육볶음/닭도리탕/김치찜양념장 |
| 25 | multi_component | `ex_5qaexoO8` | ok | 1 | 1 | yes | [#집밥백선생] 샤브샤브의 감칠맛을 올려주는건?! 백종원이 알려주는 '샤브샤브 찍먹 소스' 황금비율 |
| 26 | baking_or_global | `_kwOeDDOtww` | ok | 0 | 0 | yes | 베이킹의 기초! 모든 레시피를 나에게 맞추는 법 |
| 27 | baking_or_global | `0zcXAJyfZNo` | ok | 1 | 0 | yes | 초보자도 성공 하는 기본 버터쿠키 레시피! 4가지 재료로 쉽고 간단하게 만들어봐요 |
| 28 | baking_or_global | `mOV2mP4DsQs` | ok | 0 | 0 | yes | 간단한 재료! 정말 맛있는 초코 케이크 (No 밀가루! 맛보장! 찐하고 촉촉함. 2 Ingredient Rich and Moist Chocolate Cake Recipe) |
| 29 | baking_or_global | `BRDUvwiXEQA` | ok | 1 | 0 | yes | 꿈꿔왔던 설탕 없는 카스테라 (살 찔 걱정 ZERO! 맘 편하게 먹는 다이어트 빵 레시피, 저당, 저탄수, 혈당 잡는 무설탕 베이킹,No Sugar Castella Recipe) |
| 30 | baking_or_global | `nOFkL1cGGjE` | ok | 1 | 1 | no | 밀가루 없이 초간단 치즈빵만들기 #스타벅스빵 #건강빵 #다이어트빵 #다이어트간식 #밀가루없이빵만들기 #치즈빵레시피 |

## Findings

- The official comments API path is available for 29/30 videos in the balanced sample.
- One video returned `commentsDisabled`, which matches the backend graceful degradation policy.
- 13/30 videos had author top-level comments with recipe-like signals.
- 5/30 videos had no lightweight description recipe signal but did have author-comment recipe signals, which confirms this fallback adds source coverage that description-only parsing misses.

## Limitations

- This run verifies provider availability and author-only signal coverage, not app route registration readiness.
- The next quality lane should measure full extraction readiness after app parser/comment merge changes, using a real authenticated app route smoke if required.
