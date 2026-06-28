# YouTube 레시피 Evidence Packet 추출 계획

Status: reviewed and revised after `gpt-5.5` critique  
Date: 2026-06-28  
Change type: docs-governance / recipe-loop lab planning  
Primary scope: `lib/server/recipe-extraction-lab/*`, `scripts/recipe-loop/*`  
Non-production scope: no direct change to `POST /recipes/youtube/extract` in this plan  
Review artifact: `docs/engineering/youtube-recipe-evidence-packet-extraction-plan.gpt55-review.md`

## 1. Goal

YouTube 영상에서 재료와 조리 단계를 추출할 때, 현재처럼 큰 프롬프트와 비전 결과에 많이 의존하는 구조를 줄이고, 먼저 공개 텍스트와 자막을 시간 기준의 `EvidencePacket`으로 나눈 뒤 LLM이 그 증거 묶음을 구조화하도록 바꾼다.

목표는 아래 3가지다.

1. 다중 레시피 영상에서 후보별 재료와 단계가 섞이지 않게 한다.
2. 자막과 설명란에 이미 있는 계량을 `visual-estimate`보다 우선한다.
3. 비전 추출은 전체 추출기가 아니라 텍스트 증거가 부족한 구간의 보강기로 제한한다.

중요한 전제: `EvidencePacket`은 "텍스트만으로 모든 정답을 만든다"가 아니다. 텍스트와 자막에 없는 계량/단계는 cue로 꾸며내지 않고, 별도 비전 보강 artifact가 필요한 부족분으로 표시한다.

## 2. Current State

### 2.1 Current recipe-loop shape

현재 주요 파일은 다음과 같다.

| 파일 | 현재 역할 |
| --- | --- |
| `scripts/recipe-loop/run-extraction.mjs` | `source.json`을 읽고 provider를 선택해 `extractRecipeFromSources()`를 실행한 뒤 `result.json`을 저장한다. |
| `lib/server/recipe-extraction-lab/extract.mjs` | LLM 호출, JSON 정규화, 결합 레시피 분리, 계량 보정, 후처리를 담당한다. |
| `lib/server/recipe-extraction-lab/prompt.mjs` | source text와 추출 프롬프트를 만든다. 현재 transcript는 시간 정보를 잃고 한 덩어리 텍스트로 합쳐진다. |
| `scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs` | 프레임 선택, segment plan, source cue packet, recipe evidence ledger, 최종 JSON 생성을 담당한다. |
| `lib/server/youtube-caption-normalizer.ts` | production 쪽에 시간 있는 `YoutubeSourceSegment` 구조가 이미 있다. |
| `lib/server/youtube-multi-recipe-extractor.ts` | production 쪽에 설명란/자막 기반 다중 후보와 evidence ref 생성 로직이 이미 있다. |

### 2.2 Observed metrics for `fTlTpSJtrEs`

`notebooks/recipe_loop_data/train/fTlTpSJtrEs/golden.json` 기준 golden recipe는 7개다.

| run | recipe count | ingredientF1 | amountMatchRate | amountCoverage | stepCoverage | 주요 관찰 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `baseline` | 7/7 | 0.793 | 0.634 | 0.792 | 0.647 | 레시피 개수와 전체 골격은 가장 좋다. |
| `codex-vision-keyframes-source-cue-packet-smoke-20260628` | 7/7 | 0.387 | 0.711 | 0.862 | 0.301 | 비전 중심 결과가 핵심 재료와 단계 일부를 크게 놓쳤다. |
| `codex-vision-keyframes-recipe-evidence-ledger-prompt-smoke-20260628` | 7/7 | 0.491 | 0.788 | 1.000 | 0.343 | 계량 coverage는 좋아졌지만 재료/단계 의미 품질은 baseline보다 낮다. |

해석:

- 레시피 개수 탐지는 이미 7/7까지 도달했다.
- 실패의 중심은 후보 탐지가 아니라 후보별 재료/단계의 증거 분리와 단계 coverage다.
- 비전 keyframe provider는 자막이 풍부한 영상에서 오히려 `양념장`, `소스`, 잘못된 시각 추정 같은 노이즈를 만들 수 있다.

### 2.3 Fixture caveat for `fTlTpSJtrEs`

이 fixture는 텍스트 evidence-first 설계의 좋은 시험대이지만, 텍스트만으로 모든 정답을 맞히기 어려운 케이스다.

- `source.json`의 caption은 available이지만 55줄로 짧고, 자동자막이 깨진 줄이 많다.
- description timeline은 4개 조리 묶음만 제공한다: `메밀 파이프 후토마끼`, `맥적&열무 들기름냉파스타`, `등촌칼국수&소곱창구이`, `열무묵국&항정살 솥밥`.
- `golden.json`은 7개 recipe를 기대한다. 즉 timeline window 안에서 child packet을 나누는 규칙이 핵심이다.
- `에어프라이어 180도 10분`, `물 700ml`, 여러 `큰술` 계량은 설명란/자막에 충분히 명시되어 있지 않다. 이런 값은 deterministic cue extraction 성공 기준이 아니라 vision augmentation 이후의 회복 대상이다.

## 3. Architecture Options

### Option A: Prompt-only incremental tuning

현재 `prompt.mjs`의 규칙을 더 늘려 LLM이 더 잘 따르도록 한다.

Pros:

- 구현량이 가장 적다.
- 현재 runner와 캐시 구조를 거의 그대로 쓴다.

Cons:

- 프롬프트가 계속 길어지고 취약해진다.
- 후보별 증거 경계가 코드로 고정되지 않아 재료와 단계가 섞일 수 있다.
- 실패 원인을 테스트로 좁히기 어렵다.

### Option B: Vision-first segmented extraction

`codex-vision-keyframes`를 기본 provider로 승격하고, 프레임 기반 segment extraction을 중심으로 간다.

Pros:

- 화면 자막이나 화면 속 계량이 많은 영상에는 강하다.
- 자막이 빈약한 영상에서 fallback 가치가 있다.

Cons:

- 비용과 실행 시간이 크다.
- 자막에 명시된 계량보다 시각 추정이 앞서면 정확도가 떨어진다.
- `fTlTpSJtrEs`에서 baseline보다 ingredientF1과 stepCoverage가 낮았다.

### Option C: Evidence Packet-first hybrid

설명란, 댓글, 자막을 먼저 시간 있는 증거 단위로 정규화하고, 후보별 `EvidencePacket`을 만든 뒤 LLM에는 packet만 구조화하게 한다. 비전은 packet confidence가 낮거나 amount/step cue가 부족할 때만 보강한다.

Pros:

- 후보별 증거 경계를 코드로 고정한다.
- 자막/설명란 명시 계량을 우선할 수 있다.
- LLM prompt가 "원문 전체에서 찾아라"가 아니라 "이 packet을 정리하라"로 단순해진다.
- 비전 비용을 필요한 구간에만 쓴다.
- 실패 원인을 packet 생성, cue 추출, LLM 정규화, 후처리 단계로 나눠 테스트할 수 있다.

Cons:

- 새 모듈과 테스트가 필요하다.
- 처음에는 lab 경로에서만 운영해야 한다.
- 시간 없는 description/comment와 시간 있는 caption을 연결하는 규칙이 필요하다.

Recommendation: Option C.

## 4. Proposed Data Model

```ts
type EvidenceSource = "description" | "comment" | "caption" | "transcript" | "visual";

type EvidenceRef = {
  source: EvidenceSource;
  lineIndex: number | null;
  startMs: number | null;
  endMs: number | null;
  text: string;
};

type EvidenceCue = {
  kind: "title" | "ingredient" | "seasoning" | "amount" | "step" | "temperature" | "time" | "tip";
  basis: "source" | "visual";
  text: string;
  normalizedText?: string;
  refs: EvidenceRef[];
  confidence: number;
};

type EvidencePacket = {
  candidateId: string;
  titleHint: string;
  aliases: string[];
  timeRange: { startMs: number | null; endMs: number | null };
  titleEvidence: EvidenceRef[];
  ingredientCues: EvidenceCue[];
  stepCues: EvidenceCue[];
  amountCues: EvidenceCue[];
  visualFrameCues: EvidenceCue[];
  confidence: "high" | "medium" | "low";
  warnings: string[];
};
```

Rules:

- `EvidencePacket`은 정답 JSON이 아니라 LLM이 참고할 증거 장부다.
- 같은 cue가 여러 source에서 나오면 refs를 여러 개 붙인다.
- `startMs`가 있는 caption/transcript가 있으면 후보의 시간 범위를 먼저 고정한다.
- description timeline은 후보 시작점의 가장 높은 우선순위 힌트다.
- `visualFrameCues`는 기본적으로 비어 있고, 조건부 비전 보강 후에만 채운다.
- `basis: "source"` cue는 `basis: "visual"` cue보다 우선한다.
- `lib/server/*`가 `scripts/*`를 직접 import하지 않는다. 이미 `codex-vision-keyframes-client.mjs`에서 검증된 규칙은 공통 순수 함수로 옮기거나 lab 모듈에 작게 복사해 중복을 줄인다.

## 5. Implementation Plan

### Phase 0: Regression lock

Before implementation, lock current behavior with targeted fixtures.

Files to add or update:

- `tests/recipe-extraction-lab/evidence-packet.test.ts` or equivalent Vitest target
- existing recipe-loop fixture: `notebooks/recipe_loop_data/train/fTlTpSJtrEs/source.json`
- golden reference: `notebooks/recipe_loop_data/train/fTlTpSJtrEs/golden.json`

Checks:

```bash
node scripts/recipe-loop/run-extraction.mjs --split train --ids fTlTpSJtrEs --provider gemini --out-tag evidence-packet-baseline
node scripts/recipe-loop/grade-extraction.mjs --split train --ids fTlTpSJtrEs --run evidence-packet-baseline
node scripts/recipe-loop/grade-semantic.mjs --split train --ids fTlTpSJtrEs --run evidence-packet-baseline
```

Acceptance:

- The new tests assert the intended packet structure before production-like extraction changes.
- The initial baseline scores are recorded in artifact output, not used as a hard pass/fail gate yet.

### Phase 1: Preserve timed transcript text

Problem:

`buildSourceText()` currently joins transcript segments into one large text block. That erases time evidence.

Change:

- Preserve segment order and timestamps in source text.
- Keep the existing blob only if needed for backward compatibility during transition.

Example target shape:

```text
[SOURCE: transcript(ko)]
[00:38.320] 일단 새우부터.
[05:29.319] 할머니 들기름
[08:17.840] 고추장
```

Acceptance:

- Transcript source lines retain `startMs`.
- Existing provider calls still work.

### Phase 2: Add source evidence normalization

Add:

- `lib/server/recipe-extraction-lab/source-evidence.mjs`

Responsibilities:

- Convert description, author comments, and transcript segments into a uniform `EvidenceRef[]`.
- Normalize timestamps to `startMs` and `endMs`.
- Drop obvious promotional noise such as event, coupon, purchase certification, BGM, email, and link-only lines.
- Preserve original text in refs for traceability.

Reuse:

- Concepts from `lib/server/youtube-caption-normalizer.ts`
- Noise patterns already present in `prompt.mjs` and `codex-vision-keyframes-client.mjs`

Acceptance:

- Given `fTlTpSJtrEs`, event-heavy description lines are excluded from cooking cue extraction.
- Timeline lines remain available as title/time evidence.

### Phase 3: Add candidate packet builder

Add:

- `lib/server/recipe-extraction-lab/candidate-packets.mjs`

Responsibilities:

- Parse description timeline.
- Split title/timeline candidates by `ㅣ`, `|`, `&`, `+`, `/`, `·`, `ㆍ`, `와`, `과`.
- Build time windows from one timeline item to the next.
- Attach transcript lines by `startMs`.
- Support bundled timeline items such as `맥적&열무 들기름냉파스타`.
- Always write packet artifacts for lab runs:
  - `runs/<outTag>/evidence-packets.json`
  - `runs/<outTag>/cue-extraction-report.json`

Decision rules:

| Condition | Action |
| --- | --- |
| timeline has explicit start times | Use timeline windows as primary candidate ranges. |
| title has multiple dish names but timeline is weak | Use title candidates as weak hints. |
| candidate has no cooking cue | Mark `confidence: "low"` and do not force recipe output. |
| bundled candidate has cues for both children | Split into child packets sharing the parent time range. |

Acceptance:

- For `fTlTpSJtrEs`, packet builder returns 7 recipe candidates: `메밀 후토마끼`, `맥적구이`, `열무 들기름 냉파스타`, `등촌식 멸치칼국수`, `소곱창구이`, `항정살 마늘쫑 솥밥`, `도토리 묵사발`.
- Packet time ranges are non-overlapping except intentional bundled parent/child overlap.
- The 4 description timeline rows can produce 7 child packets when title tags, bundled separators, and local cooking cues support the split.

### Phase 4: Add deterministic cue extraction

Responsibilities:

- Extract cue candidates before LLM when they are present in source evidence:
  - title and alias cues from description timeline, title, tags, and local source snippets
  - ingredient-like tokens such as `새우`, `들기름`, `고추장`
  - amount/unit pairs such as `1 tablespoon`, `0.5 tablespoon`, `700ml`, `1:1` only when the source text contains them
  - cooking actions such as boil, rinse, grill, mix, roll, stir-fry
  - temperature/time cues such as `180 degrees`, `10 minutes`, `5 minutes` only when the source text contains them
  - `Important` or equivalent emphasis lines

Important rule:

- This stage produces cues, not final normalized recipe rows.
- If amount is qualitative only (`약간`, `적당량`, `기호껏`), keep it as cue text but do not invent numeric `amount`.
- If a golden value is not present in source evidence, record it as `missingTextEvidence`, not as a successful cue.

Acceptance:

- `fTlTpSJtrEs` packet cue extraction captures source-visible cues without inventing absent details:
  - timeline/title/tag aliases for all 7 expected child packets
  - caption-visible tokens such as `새우`, `들기름`, `고추장`
  - bundled parent ranges such as `맥적&열무 들기름냉파스타`, `등촌칼국수&소곱창구이`, `열무묵국&항정살 솥밥`
- `cue-extraction-report.json` lists important golden-only details such as `180도 10분`, `700ml`, and detailed `큰술` amounts as requiring `visualFrameCues` or manual evidence, not deterministic text cues.

### Phase 5: Replace broad prompt with packet prompt

Change:

- `buildExtractionPrompt()` should accept `EvidencePacket[]`.
- The prompt should instruct the model to normalize packet evidence, not search the whole source.
- The first packet prompt pass should run text-only with `videoUrl: null`. Current `llm.generate` passes a whole `videoUrl`, which is not packet-scoped enough for this design.

Prompt policy:

1. Do not create recipes outside provided packets.
2. Do not move ingredients or steps between packets.
3. Prefer `description/comment/caption/transcript` explicit amount over `visual-estimate`.
4. Use `visual-estimate` only when packet has visual cue and no text amount cue.
5. If no amount evidence exists, set `amount: null`, `unit: null`, `amountBasis: null`.
6. Keep recipe output JSON shape compatible with existing `extractRecipeFromSources()`.

Acceptance:

- LLM input size is smaller and packet-scoped.
- The packet prompt does not send the full YouTube video URL in the default text-only pass.
- Output still matches current lab schema:

```json
{
  "recipes": [
    {
      "title": "요리명",
      "ingredients": [],
      "steps": []
    }
  ]
}
```

### Phase 6: Conditional vision augmentation

Change:

- Keep `codex-vision-keyframes` provider, but use it as an optional augmentation step.
- Vision augmentation produces a separate artifact first, then injects selected findings into `visualFrameCues`.
- Vision runs only for packets meeting one of these conditions:
  - no transcript/caption step cues
  - amount cue coverage below a configured threshold
  - packet confidence is `low`
  - user explicitly chooses visual provider

Guardrails:

- Vision cannot override explicit text amount unless a later rule explicitly allows it.
- Vision output is stored as `visualFrameCues`, then normalized by the same packet prompt.
- Vision-only ingredients must be used in steps or dropped by postprocess.
- Avoid passing the whole `videoUrl` to the packet prompt as the scoping mechanism. Use selected frames, time windows, and visual cue artifacts instead.

Acceptance:

- For `fTlTpSJtrEs`, the text-only packet path should produce stable 7-packet boundaries, while detailed missing amounts/steps may require `visualFrameCues`.
- For caption-poor videos, `codex-vision-keyframes` remains available as fallback.
- Full baseline parity for `fTlTpSJtrEs` is evaluated after conditional vision augmentation and packet-mode postprocess, not at Phase 4.

### Phase 7: Postprocess and provenance validation

Update `extract.mjs` postprocess:

- Keep existing normalization for amount/unit.
- Split packet mode and legacy mode where behavior differs.
- Add packet boundary validation.
- Add provenance summary in `meta`.
- Guard legacy visual recovery such as `recoverLowTailVisualDefaults()` so it cannot overwrite explicit source evidence in packet mode.
- Add warnings when:
  - recipe has ingredients but no step refs
  - step mentions ingredient missing from ingredients
  - ingredient is `visual-estimate` and absent from steps
  - packet has high-confidence text cue but output omits it

Acceptance:

- `meta` includes:
  - `evidencePacketCount`
  - `packetCueCounts`
  - `visualAugmentationPacketCount`
  - `packetBoundaryWarnings`
  - `textAmountPrecedenceCorrections`

### Phase 8: Verification and rollout

Local targeted verification:

```bash
pnpm test -- --run tests/recipe-extraction-lab
node scripts/recipe-loop/run-extraction.mjs --split train --ids fTlTpSJtrEs --provider gemini --out-tag evidence-packet-v1
node scripts/recipe-loop/grade-extraction.mjs --split train --ids fTlTpSJtrEs --run evidence-packet-v1
node scripts/recipe-loop/grade-semantic.mjs --split train --ids fTlTpSJtrEs --run evidence-packet-v1
```

Broader recipe-loop verification:

```bash
node scripts/recipe-loop/run-extraction.mjs --split validation --provider gemini --out-tag evidence-packet-v1
node scripts/recipe-loop/grade-extraction.mjs --split validation --run evidence-packet-v1
node scripts/recipe-loop/grade-semantic.mjs --split validation --run evidence-packet-v1
```

Optional visual fallback verification:

```bash
node scripts/recipe-loop/run-extraction.mjs --split train --ids fTlTpSJtrEs --provider codex-vision-keyframes --keyframe-mode segmented --source-cue-packets --recipe-evidence-ledger-prompt --out-tag evidence-packet-visual-v1
```

Promotion rule:

- Do not integrate into `lib/server/youtube-import.ts` until lab metrics improve or at least do not regress against baseline on validation.
- Production integration requires separate plan and tests because `POST /recipes/youtube/extract` is a public contract path.

## 6. Success Criteria

Packet artifact milestone:

- `runs/<outTag>/evidence-packets.json` exists for lab runs.
- `runs/<outTag>/cue-extraction-report.json` exists for lab runs.
- For `fTlTpSJtrEs`, packet count reaches 7 recipe candidates from the 4 timeline rows and title/tag evidence.
- Deterministic cue extraction only claims cues present in source evidence.

Text-only packet prompt milestone:

- Recipe output remains schema-compatible with current lab output.
- No recipe is created outside the provided packets.
- Explicit source amounts, when present, outrank `visual-estimate`.
- Missing source evidence is represented as `null` amount/unit or warning metadata, not invented detail.

Minimum for full `fTlTpSJtrEs` targeted pass after conditional vision and packet postprocess:

- recipe count remains 7/7.
- ingredientF1 is not below baseline 0.793.
- stepCoverage is not below baseline 0.647.
- amountCoverage is not below baseline 0.792.
- semantic judge case scores do not regress against baseline for sampled cases.

Validation pass:

- No systematic regression in recipe count.
- Packet boundary warnings are explainable and not caused by obvious candidate mixing.
- No new dependency is added.

Production-readiness gate:

- Separate integration plan exists.
- API response shape remains `{ success, data, error }`.
- Existing YouTube import contracts are not changed without contract-evolution approval.

## 7. Non-goals

- Do not change official API/DB contracts in this plan.
- Do not add a new paid extraction provider.
- Do not make vision mandatory for every video.
- Do not solve all visual quantity estimation issues in the first pass.
- Do not modify `golden.json` to fit the new extractor.
- Do not use generic cooking knowledge to invent missing ingredients or amounts.

## 8. Risk Register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Packet builder over-splits one recipe into multiple recipes | High | Require cooking cues per child packet; merge support-only sauce/topping packets. |
| Timeline parsing misses videos without description timeline | Medium | Fall back to title candidates and caption windows, but mark confidence lower. |
| Cue extraction becomes a second brittle parser | Medium | Keep cues as evidence, not final truth; LLM still normalizes. |
| Vision fallback remains expensive | Medium | Run only on low-confidence packets by default. |
| Metrics overfit to `fTlTpSJtrEs` | High | Validate on `validation` split before promotion. |
| Production import contract accidentally changes | High | Keep changes in lab modules; production integration is separate. |
| Text-only packet plan expects evidence absent from source | High | Phase 4 accepts only source-visible cues; full baseline parity moves after visual augmentation. |
| Existing visual defaults overwrite source evidence | High | Add packet-mode guard around legacy visual recovery postprocess. |
| New lab modules duplicate `codex-vision-keyframes-client.mjs` logic | Medium | Extract shared pure functions or port only the minimal tested rules; avoid direct `lib/server` -> `scripts` imports. |

## 9. ADRs

### ADR-1: EvidencePacket-first over vision-first

Decision: Use text/time evidence as the primary extraction unit.

Rationale:

- Current `fTlTpSJtrEs` evidence shows baseline text-heavy path outperforms vision-keyframe runs on ingredientF1 and stepCoverage.
- Text sources provide explicit units and amounts that visual estimation should not override.

### ADR-2: Keep vision as augmentation

Decision: `codex-vision-keyframes` remains available, but is not the default full extractor for text-rich videos.

Rationale:

- Vision is valuable for caption-poor videos and onscreen quantity.
- Full vision extraction is more expensive and can hallucinate ingredients when text evidence exists.
- In packet mode, vision should feed `visualFrameCues`; it should not be a whole-video prompt escape hatch.

### ADR-3: No production integration until lab verification

Decision: This plan does not directly change `lib/server/youtube-import.ts`.

Rationale:

- `POST /recipes/youtube/extract` is a user-facing import path.
- Lab regression must prove value before public behavior changes.

## 10. Open Questions

1. Should `EvidencePacket` artifacts be written to `runs/<outTag>/evidence-packets.json` for every run?
   - Decision: yes for lab runs, because review and debugging become much easier.
2. Should default provider remain `gemini` while packet prompt is introduced?
   - Recommendation: yes for first pass, to isolate packet logic from provider change.
3. Should production code reuse `youtube-multi-recipe-extractor.ts` directly?
   - Recommendation: reuse ideas and test fixtures first; direct import from lab may create dependency direction confusion.
4. Should packet prompt send the full `videoUrl`?
   - Decision: no for the default packet pass. Vision should first create scoped `visualFrameCues`.

## 11. Checklist

- [ ] Add regression tests for source evidence normalization.
- [ ] Add regression tests for candidate packet builder.
- [ ] Always write `evidence-packets.json` and `cue-extraction-report.json` in lab runs.
- [ ] Preserve timed transcript lines in lab source text.
- [ ] Add deterministic cue extraction.
- [ ] Update packet-scoped prompt.
- [ ] Add conditional vision augmentation gate.
- [ ] Guard legacy visual recovery in packet mode.
- [ ] Add packet provenance metadata to `meta`.
- [ ] Run `fTlTpSJtrEs` targeted grade.
- [ ] Run validation split grade.
- [ ] Write follow-up production integration plan only if lab results justify it.

## 12. Review Log

External review completed with requested model: `gpt-5.5`.

Accepted review changes:

- Lowered Phase 4 acceptance so deterministic cue extraction only claims cues visible in source evidence.
- Moved full `fTlTpSJtrEs` baseline parity to the full pipeline after conditional vision augmentation and packet postprocess.
- Required `evidence-packets.json` and `cue-extraction-report.json` artifacts for lab runs.
- Made packet prompt text-only by default with `videoUrl: null`.
- Added a separate vision artifact path that injects scoped findings into `visualFrameCues`.
- Added packet-mode guardrails so legacy visual defaults cannot overwrite explicit text evidence.
- Added duplication control: do not directly import `scripts/*` from `lib/server/*`; extract or port minimal shared pure rules.
