# YouTube Description Parser Scoring Rubric

이 문서는 유튜브 설명란에서 재료와 조리 과정을 추출하는 결정론 파서 v2의 구현 기준이다. 목적은 새 영상마다 정규식을 덧붙이는 방식이 아니라, 라인별 신호를 점수화하고 문서 구조를 먼저 잡은 뒤 값을 추출하는 것이다.

## Accuracy Contract

- In-corpus fixture F1 목표: 0.90 이상.
- 구조화된 real-description wild sample F1 보고 목표: 0.85 이상.
- 약한 구조/반구조 wild sample F1 보고 목표: 0.70 이상.
- 위 수치는 LLM 없이 결정론 파서로 측정한다. 임의의 모든 유튜브 영상 90% 성공을 보장한다는 뜻이 아니다.

## Fixture Minimum

- 최소 50개 fixture를 유지한다.
- 전체 fixture 중 30개 이상은 실제 채널 설명란에서 개인정보/링크를 제거한 real-description 기반이어야 한다.
- 각 category는 최소 5개 fixture를 유지한다.
- wild fixture sample은 최소 5개 채널, 10개 영상의 설명란 텍스트를 고정해 별도 측정하고 in-corpus 점수와 섞지 않는다.

## Line Features

| Feature | Score | Applies To | Notes |
| --- | ---: | --- | --- |
| amount + known unit pattern | +5 | ingredient | `박력분120g`, `달걀 2개`, `1/2개`, `30~40g` |
| to-taste phrase | +4 | ingredient | `약간`, `조금`, `적당량`, `한 꼬집`, `취향껏` |
| short noun phrase without verb | +2 | ingredient | ingredient section 안에서만 강하게 사용 |
| cooking verb | +4 | step | `섞`, `넣`, `볶`, `굽`, `끓`, `풀`, `채우`, `자르`, `썰` |
| ordinal or timestamp prefix | +2 | step | `1)`, `2.`, `00:05` |
| sentence ending | +1 | step | `요`, `다`, `.`, `!` |
| recipe heading keyword | +6 | heading.recipe | `Recipe 1`, `첫 번째 레시피`, bracketed dish title near sections |
| ingredient heading keyword | +6 | heading.ingredients | `재료`, `ingredients`, `for the dough` |
| step heading keyword | +6 | heading.steps | `만드는 법`, `조리법`, `method`, `directions` |
| component keyword | +4 | heading.component | `반죽`, `필링`, `크림`, `토핑`, `소스`, `시럽`, `아이싱` |
| link/social/product/noise keyword | +8 | noise | link, hashtag-only, BGM, 제품 정보, 구매 링크, 구독 |

Negative signals:

| Feature | Score | Applies To | Notes |
| --- | ---: | --- | --- |
| cooking verb in ingredient candidate | -4 | ingredient | step sentence false positive 방지 |
| amount/unit in step candidate | -3 | step | ingredient line false positive 방지 |
| line longer than 120 chars | -3 | ingredient | prose note likely |
| noise keyword | -8 | ingredient/step | section reset candidate |

## Thresholds

- `ingredient_candidate`: ingredient score >= 5 and ingredient score >= step score + 2.
- `step_candidate`: step score >= 4 and step score >= ingredient score + 1.
- `heading.*`: heading score >= 6.
- `noise`: noise score >= 8.
- `note`: none of the above.

## Lookahead Rules

- `필링`처럼 컴포넌트명만 있는 라인은 다음 의미 있는 3줄 중 ingredient 후보가 더 많으면 ingredient-section component heading으로 본다.
- 같은 라인에 amount/unit이 있는 `초콜릿 필링 200g`은 component heading이 아니라 ingredient 후보로 본다.
- `반죽 만들기`, `크림 만들기`는 step-section component heading으로 본다.
- `For the dough`, `dough ingredients`는 ingredient-section component heading으로 본다.

## Selection And Degradation

- 재료 2개 이상과 조리 과정 1개 이상이 있으면 구조화된 후보로 본다.
- 재료/조리 과정 중 하나만 있으면 부분 추출 draft를 만들고 누락된 영역을 `blockingIssues`에 넣는다.
- 구조화 신호가 없으면 빈 draft와 직접 추가 안내 warning을 반환한다.
- 다중 레시피가 감지되면 provider/parser가 후보별 `ingredients`, `steps`, `evidence_refs`를 만든다.
- 일반 extract 응답은 `multi_parent` 세션의 `recipe_candidates[]`로 후보를 노출하고, top-level `ingredients` / `steps`는 비워 둔 채 `MULTI_CANDIDATE_REVIEW_REQUIRED`를 반환한다.
- 사용자가 후보 하나를 선택하면 `selected_multi_recipe_candidate` child draft를 만들고, 기존 flat 검수/등록 계약을 재사용한다.
- 단일 후보가 명확히 우세한 경우에만 `selected_single_recipe`로 flat draft를 반환한다.

## Flattening Rules

- 단일 후보 또는 선택된 child draft의 public register contract는 flat `ingredients[]` / `steps[]`를 사용한다.
- parent multi draft는 후보 목록을 유지하며, 후보 선택 전에는 amount 합산이나 컴포넌트 간 flattening을 하지 않는다.
- 컴포넌트 라벨은 `displayText`와 step instruction prefix에만 넣는다.
- 같은 재료가 같은 unit/type으로 여러 컴포넌트에 나오면 amount를 합산한다.
- 합산된 display text의 괄호 안 원본 수량은 정적 텍스트이므로 draft warning을 추가한다.
- 원본 step ordinal이 비연속이면 draft warning을 추가하고, flat draft step 번호는 1부터 다시 매긴다.
