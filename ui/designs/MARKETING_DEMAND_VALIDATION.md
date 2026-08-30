# MARKETING_DEMAND_VALIDATION — /beta 주간 영양 수요검증 랜딩

> status: Codex draft pending final-owner review
> campaign: `marketing-demand-validation`
> route: `/beta`
> source evidence:
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.png`
> - `ui/designs/evidence/marketing-demand-validation/weekly-nutrition-ad-v2.md`
> locked campaign promise:
> - Brand: `무먹`
> - Primary promise: `레시피도, 편의점도 / 하루·한 주 영양을 한눈에`
> - CTA: `30초 식단 기록 테스트 →`
> - Supporting line: `무료 · 로그인 없이 참여`
>
> Draft rule: the landing may reuse the promise, but the hero must not paste the full ad poster or repeat the entire ad block verbatim. The hero uses a phone-only crop derived from the selected evidence and a slimmer, landing-specific copy frame.

## 1. Design Direction

Purpose: turn the selected weekly nutrition creative into a single, focused /beta landing that measures whether the promise creates real intent, not curiosity.

Tone: refined utilitarian service UI. Clean white canvas, crisp black text, electric blue accent, thin borders, calm spacing, no glassmorphism, no purple gradients, no generic SaaS chrome.

Constraints:

- Mobile first, then desktop.
- No login wall.
- No pricing.
- No testimonials.
- No external analytics SDK.
- No page-level horizontal scroll.
- The ad creative remains immutable; if the crop needs to change, create a sibling evidence asset instead of overwriting the source.
- The landing may reuse the ad wording directly. The only hard prohibition is pasting the full poster layout or reproducing the entire ad block as a second poster.

Differentiator: the page behaves like a short diagnostic tool, not a marketing brochure. One ad-derived hero, one 5-question test, one neutral result, one interest check, one email gate, one follow-up.

## 2. Mobile-First Wireframe

### 390px default

```text
┌────────────────────────────────┐
│ 무먹                    /beta  │  ← compact app-like top bar
├────────────────────────────────┤
│ 레시피도, 편의점도            │
│ 하루·한 주 영양을 한눈에      │
│ 레시피와 완제품을 따로 기록   │
│ 하며 놓치던 하루 합계와       │
│ 주간 평균. 30초 테스트로      │
│ 내 식단 기록이 어디서 끊기는지│
│ 확인해보세요.                 │
│ [ 30초 식단 기록 테스트 ]     │  ← primary CTA
│ 무료 · 로그인 없이 참여        │
│ 개인정보 처리방침             │
│                                │
│ ┌────────────────────────────┐ │
│ │ phone-only crop            │ │  ← crop of selected ad, not full poster
│ │ weekly planner screen       │ │     keeps the ad proof visible
│ └────────────────────────────┘ │
├────────────────────────────────┤
│ 1/5  질문 1                    │
│ ○ option ○ option              │  ← single-choice answers
│ ○ option ○ option              │
│ [뒤로]                 [다음]   │
└────────────────────────────────┘
```

Mobile default intent:

- The hero promise, crop, and CTA must all be visible before the first quiz question is entered.
- The page should read like a diagnostic flow, not a full-height poster.
- The crop is the proof. The surrounding copy is the landing framing.

### 320px narrow sentinel

```text
┌──────────────────────────────┐
│ 무먹                  /beta  │
├──────────────────────────────┤
│ 레시피도, 편의점도          │
│ 하루·한 주 영양을 한눈에    │
│ ┌──────────────────────────┐ │
│ │ crop: phone screen       │ │
│ └──────────────────────────┘ │
│ [30초 식단 기록 테스트]      │
│ 무료 · 로그인 없이 참여      │
│ 개인정보 처리방침            │
│                              │
│ 1/5                          │
│ 질문이 한 줄을 넘으면        │
│ 두 줄까지 허용하되           │
│ 보기 버튼은 44px 유지        │
└──────────────────────────────┘
```

320px rules:

- CTA may compress, but it cannot be hidden below the fold of the hero.
- The phone crop must remain readable even when shortened.
- The 390px crop should stay within a visible height band of roughly 180-220px.
- The 320px crop should stay within a visible height band of roughly 140-160px.
- Question copy should wrap before controls do.
- No duplicated CTA labels inside the crop and the hero frame.

### 1024px+ desktop

```text
┌────────────────────────────────────────────────────────────┐
│ 무먹 /beta                                                 │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  ┌───────────────────────┐ │
│ │ 레시피도, 편의점도        │  │ phone-only crop       │ │
│ │ 하루·한 주 영양을 한눈에  │  │ selected ad fragment   │ │
│ │ 레시피와 완제품을 따로    │  │                       │ │
│ │ 기록하며 놓치던 하루      │  └───────────────────────┘ │
│ │ 합계와 주간 평균.         │                              │
│ │ 30초 테스트로 내 식단     │                              │
│ │ 기록이 어디서 끊기는지    │                              │
│ │ 확인해보세요.             │                              │
│ │ [30초 식단 기록 테스트]   │                              │
│ │ 무료 · 로그인 없이 참여   │                              │
│ │ 개인정보 처리방침        │                              │
│ └────────────────────────────┘                              │
│ ┌─────────────── quiz / result / email stack ─────────────┐ │
│ │ 1/5 질문 카드                                            │ │
│ │ result panel                                              │ │
│ │ concept panel                                             │ │
│ │ intent panel                                              │ │
│ │ email panel                                               │ │
│ │ follow-up panel                                           │ │
│ └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

Desktop rules:

- Use a two-column hero only after the mobile stack is stable.
- Keep the test flow below the hero; do not turn the page into a long sales deck.
- The right column is the crop and proof block, not a second advertisement.

## 3. State / Copy Contract

### 3.1 Global copy rules

- Keep all state copy neutral and service-like.
- Do not use shame language for the control group.
- Do not add price, testimonials, or feature bullets that are not part of the test.
- Do not expose raw session IDs, tracking jargon, or internal event names to the user.
- The hero CTA may reuse the ad CTA wording when it helps continuity, but the landing still must not reproduce the full ad poster or full ad block.

### 3.2 Hero copy

| Piece | Required copy | Notes |
|---|---|---|
| Kicker | `레시피도, 편의점도` | Small, utilitarian, not decorative |
| Headline | `하루·한 주 영양을 한눈에` | Landing-aligned framing that still matches the campaign promise |
| Body | `레시피와 완제품을 따로 기록하며 놓치던 하루 합계와 주간 평균. 30초 테스트로 내 식단 기록이 어디서 끊기는지 확인해보세요.` | Promise stays close to the ad and keeps the diagnostic tone |
| Primary CTA | `30초 식단 기록 테스트` | Starts the quiz, not a generic signup form |
| Helper | `무료 · 로그인 없이 참여` | `/privacy` is available from hero and form |
| Visual | `phone-only crop of selected ad` | Do not render the full poster or duplicate the exact poster layout |

### 3.3 Quiz copy

Progress:

- The quiz is single-choice.
- The progress indicator is `1/5` through `5/5`.
- The back button preserves the previous answer.
- The next button is disabled until one option is selected.

Questions and options:

1. `최근 4주 동안 칼로리나 탄단지 기록은 어땠나요?`
   - `관심이 없음`
   - `해보려 했지만 시작하지 못함`
   - `시작했지만 중단함`
   - `가끔 기록 중`
   - `꾸준히 기록 중`

2. `지난 7일 동안 집밥을 먹은 날은 며칠인가요?`
   - `0일`
   - `1일`
   - `2~3일`
   - `4~7일`

3. `직접 만든 음식을 기록할 때 보통 어떻게 하나요?`
   - `재료를 하나씩 검색해 입력`
   - `비슷한 완성 음식을 선택`
   - `대략 계산`
   - `저장한 레시피를 재사용`
   - `집밥은 기록하지 않음`

4. `가장 불편한 순간은 무엇인가요?`
   - `레시피에 있는 재료를 다시 입력할 때`
   - `조리 후 무게와 내가 먹은 양을 계산할 때`
   - `집밥과 완제품을 따로 기록할 때`
   - `하루 합계와 주간 흐름을 한눈에 못 볼 때`
   - `특별히 불편하지 않음`

5. `어떤 수준이라면 실제로 써보고 싶나요?`
   - `빠른 추정값이면 충분`
   - `레시피 기준 자동 계산`
   - `완성 무게·섭취량까지 반영한 정확한 계산`
   - `아직 잘 모르겠음`
   - `현재 방식으로 충분함`

Quiz copy rules:

- The text must fit on one screen at 390px without a secondary explainer block.
- `특별히 불편하지 않음` and `현재 방식으로 충분함` remain valid outcomes, not failing answers.
- The quiz result is derived from the answers, not from the email action.

### 3.4 Result copy

Result precedence:

1. `satisfied_control`
2. `weekly_blindspot`
3. `split_tracking`
4. `rough_match`
5. `ingredient_reentry`

| result key | headline | body | treatment |
|---|---|---|---|
| `ingredient_reentry` | `재료 재입력형` | `집밥을 기록할 때마다 같은 재료를 다시 찾느라 흐름이 끊깁니다.` | High friction, practical |
| `rough_match` | `대충 기록형` | `대략 맞추는 기록은 되지만, 하루와 주간 흐름은 자주 비어 있습니다.` | Mild friction |
| `split_tracking` | `식단 분리형` | `레시피와 완제품을 따로 기록하는 순간, 영양 흐름이 두 갈래로 나뉩니다.` | Core campaign fit |
| `weekly_blindspot` | `주간 흐름 실종형` | `기록은 하고 있지만 하루 합계와 이번 주 패턴을 다시 계산해야 해서 흐름을 놓치고 있어요.` | Best-fit insight |
| `satisfied_control` | `지금 방식도 괜찮은 편` | `지금 방식이 크게 불편하지 않은 편이에요. 이 응답도 제품 우선순위를 정하는 데 중요합니다.` | Neutral control group |

Result copy rules:

- Never shame the user for being a control-group respondent.
- Never imply medical diagnosis or performance judgment.
- The result should be presented before the email form.
- The solution idea comes after the result and before the email gate.
- The result stack should stay compact enough that the concept and email panels can still enter the viewport without forcing a tall scroll break.

### 3.5 Concept copy

| Piece | Required copy | Notes |
|---|---|---|
| Title | `이렇게 기록할 수 있다면 어떨까요?` | This is the solution reveal, not a promise of launch |
| Body | `레시피 영양 등록 + 완제품 등록 → 날짜별 kcal·탄·단·지 → 주간 평균` | Keep as a single concise line or two short lines |
| Buttons | `써보고 싶어요` / `지금은 필요하지 않아요` | Symmetric, same visual weight |
| Visual | `selected ad crop reused as a lighter proof block` | Not a second full ad |

Concept copy rules:

- The two buttons must be equal size and equal weight.
- `지금은 필요하지 않아요` stays honest and does not branch into a coercive prompt.
- If the user chooses the negative path, the email gate does not appear.

### 3.6 Intent copy

| Piece | Required copy | Notes |
|---|---|---|
| Title | `이런 앱이라면 써보고 싶나요?` | Lead-gate heading |
| Input label | `이메일` | Single-field form only |
| Consent | `베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.` | Explicit, brief, reversible |
| Primary CTA | `베타 우선 초대받기` | The main lead action |
| Secondary text | `무료 · 로그인 없이 참여` | Reinforce the promise without duplication |

Intent copy rules:

- No password, name, phone number, or open text field.
- No marketing opt-in by default.
- The negative path does not show the email field.
- The email gate should stay within a compact first-screen panel, and the explicit consent row should remain visible without forcing a second scroll page.

### 3.7 Follow-up copy

Follow-up appears only after lead submit success.

| Question | Options |
|---|---|
| `이 주간 화면이 있다면 써볼 의향은?` | `꼭 써보고 싶음` / `상황에 따라 써볼 것 같음` / `필요하지 않음` |
| `가장 먼저 보고 싶은 정보는?` | `날짜별 kcal·탄·단·지` / `주간 평균` / `아침·점심·저녁·간식 표` / `요리 계획과 식단 기록 전환` / `관심 없음` |

Follow-up rules:

- Both questions are optional.
- Skip is always available.
- Completion does not affect lead success.
- The follow-up is secondary, not a second conversion wall.
- Cap the follow-up block to at most 2 visible questions, a single-line skip action, and no more than 320px of visible vertical height before scrolling.

### 3.8 Error and system states

| State | Required copy | Required behavior |
|---|---|---|
| `loading` | `불러오는 중...` or stage-specific spinner text | Keep layout stable; never shift the page shell |
| `validation error` | Field-specific helper copy | Keep the answer or email value intact |
| `server error` | `다시 시도해 주세요.` | Preserve the current stage and user input |
| `duplicate generic success` | Same success message as accepted lead | Do not reveal duplicate status in the user-facing copy |
| `pending retry` | Silent queue state | Retry non-lead actions without user-visible noise |

## 4. Funnel Rules

- The route is one-page, one campaign, one funnel.
- A single stage stack drives the whole flow: `hero → quiz → result → concept → intent → email → followup → done`.
- The quiz and follow-up are both single-choice interactions.
- The hero must never be mistaken for a full poster repost.
- The landing must not fall back into product-navigation chrome.
- The campaign proof is the ad crop, the quiz, and the neutral result, in that order.
- Any replacement to the selected ad crop requires a new sibling evidence file and provenance note.

## 5. Measurement Copy Boundaries

- Track only: page view, quiz start, quiz complete, solution view, intent, lead, follow-up.
- Do not expose scroll depth, hover, or individual answer telemetry in the UI.
- Keep privacy and consent language close to the email gate.
- The /privacy link must remain visible from both the hero and the email form.

## 6. Open Risks To Carry Forward

- The crop can easily become a second poster if it is too large or too literal.
- The 320px sentinel can collapse if the hero copy and crop are both allowed to breathe too much.
- The neutral control-group result must stay dignified, or the entire funnel will feel manipulative.
- The follow-up must stay optional; if it feels required, the lead conversion story becomes muddy.
