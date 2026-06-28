# YouTube 레시피 Evidence Packet 구현 완료 요약

Status: local implementation complete, shipping pending  
Date: 2026-06-28  
Branch: `docs/youtube-recipe-html-ftltpsjtres`  
Change type: recipe-loop lab tooling / docs-governance  
Production API impact: none. `POST /recipes/youtube/extract` behavior is not changed.

## 1. What changed

계획서의 핵심 방향인 `EvidencePacket` 기반 추출 준비 로직을 lab 경로에 구현했다. 큰 prompt 하나에 모든 책임을 맡기기 전에, 먼저 source text와 transcript를 시간 있는 증거로 정리하고, 레시피 후보별 packet과 cue report를 만들도록 했다.

구현된 핵심 흐름:

```text
source.json
  -> source-evidence.mjs
  -> candidate-packets.mjs
  -> evidence-packets.json / cue-extraction-report.json
  -> packet-aware prompt
  -> extract.mjs normalization and postprocess
```

## 2. Files changed

| File | Purpose |
| --- | --- |
| `lib/server/recipe-extraction-lab/source-evidence.mjs` | description, comment, transcript를 `EvidenceRef[]`로 정규화한다. promotional noise를 제거하고 transcript `startMs/endMs`를 보존한다. |
| `lib/server/recipe-extraction-lab/candidate-packets.mjs` | timeline/title/tag context로 `EvidencePacket[]`과 `cue-extraction-report`를 만든다. |
| `lib/server/recipe-extraction-lab/prompt.mjs` | `PROMPT_VERSION`을 `iter17-evidence-packet-artifacts`로 올리고, transcript timestamp와 packet-aware prompt를 추가했다. |
| `lib/server/recipe-extraction-lab/extract.mjs` | packet bundle을 생성해 prompt와 `meta`에 연결하고, packet mode에서 source amount precedence guard를 추가했다. |
| `scripts/recipe-loop/run-extraction.mjs` | lab run마다 `evidence-packets.json`과 `cue-extraction-report.json` artifact를 저장한다. Gemini 기본 packet pass는 `videoUrl: null` text-only로 실행한다. |
| `tests/recipe-loop-evidence-packets.test.ts` | timestamp 보존, `fTlTpSJtrEs` 7 packet 생성, artifact 저장을 회귀 테스트로 고정했다. |
| `tests/recipe-loop-local-integrity.test.ts` | prompt version expectation을 `iter17-evidence-packet-artifacts`로 갱신했다. |
| `docs/engineering/youtube-recipe-evidence-packet-extraction-plan.md` | GPT 5.5 검토 결과를 반영한 최종 계획서다. |
| `docs/engineering/youtube-recipe-evidence-packet-extraction-plan.gpt55-review.md` | `gpt-5.5` 읽기 기반 검토 결과다. |
| `docs/engineering/youtube-recipe-evidence-packet-extraction-plan.html` | 계획서를 초보 개발자용 HTML로 정리한 파일이다. |

## 3. Beginner explanation

기존 방식은 영상과 텍스트를 큰 덩어리로 LLM에게 주고 "레시피를 다 뽑아줘"라고 요청하는 방식에 가까웠다. 이 방식은 여러 요리가 한 영상에 나오면 재료와 단계가 서로 섞이기 쉽다.

새 방식은 먼저 "요리별 증거 봉투"를 만든다.

- `EvidenceRef`: "이 문장은 어디서 왔고 몇 초쯤 나왔는가"를 저장한다.
- `EvidenceCue`: "재료 같다", "계량 같다", "조리 단계 같다" 같은 작은 단서다.
- `EvidencePacket`: 한 요리 후보에 관련된 `EvidenceRef`와 `EvidenceCue`를 모은 봉투다.

LLM은 이제 영상 전체를 뒤지는 대신 packet을 보고 구조화한다. 텍스트에 없는 계량은 꾸며내지 않고, `missingTextEvidence`나 warning으로 남긴다.

## 4. Important behavior

### Timestamp preservation

`buildSourceText()`는 transcript를 더 이상 한 줄 blob으로 합치지 않는다.

Before:

```text
일단 새우부터. 할머니 들기름 고추장
```

After:

```text
[00:38.320] 일단 새우부터.
[05:29.319] 할머니 들기름
[08:17.840] 고추장
```

### Packet generation

`fTlTpSJtrEs`는 description timeline이 4개 묶음이지만, packet builder는 title/tag context와 bundled separator를 이용해 7개 recipe packet을 만든다.

Expected packet titles:

1. `메밀 후토마끼`
2. `맥적구이`
3. `열무 들기름 냉파스타`
4. `등촌식 멸치칼국수`
5. `소곱창구이`
6. `도토리 묵사발`
7. `항정살 마늘쫑 솥밥`

### Artifact output

`run-extraction.mjs`는 각 run directory에 아래 파일을 저장한다.

```text
runs/<outTag>/evidence-packets.json
runs/<outTag>/cue-extraction-report.json
runs/<outTag>/result.json
```

이제 결과가 나쁠 때 다음을 분리해 볼 수 있다.

- packet 후보가 잘못 나뉘었는가
- cue가 source에서 잘못 추출되었는가
- LLM이 packet을 잘못 정규화했는가
- postprocess가 source evidence를 덮었는가

## 5. GPT 5.5 review items reflected

| Review concern | Reflected change |
| --- | --- |
| Phase 4가 source에 없는 `180도 10분`, `700ml`까지 기대했다. | deterministic cue extraction은 source-visible cue만 성공으로 인정한다. |
| 현재 `llm.generate`는 packet별 video scoping이 어렵다. | Gemini 기본 packet prompt pass는 `videoUrl: null` text-only로 실행한다. |
| 기존 `codex-vision-keyframes-client.mjs`와 중복될 수 있다. | `lib/server/*`에서 `scripts/*`를 직접 import하지 않고 lab-local pure module로 구현했다. |
| legacy visual recovery가 text precedence를 덮을 수 있다. | packet mode에서 source text에 명시 amount가 있으면 visual default가 덮지 못하게 guard를 추가했다. |

## 6. Verification

Executed:

```bash
pnpm test -- --run tests/recipe-loop-evidence-packets.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Observed results:

- `pnpm test -- --run tests/recipe-loop-evidence-packets.test.ts`는 Vitest 인자 전달 때문에 전체 test suite가 실행되었고, `248` test files / `2436` tests가 모두 통과했다.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed. Next.js production build completed successfully.

## 7. Simplifications made

- Full production integration은 하지 않았다. `POST /recipes/youtube/extract`는 변경하지 않았다.
- Vision augmentation은 전체 구현하지 않고, packet 구조와 `visualFrameCues`를 받을 수 있는 경로만 준비했다.
- `golden.json`은 runner에서 읽지 않았다. Artifact generation은 source-only로 유지했다.
- Timeline이 이미 있으면 title/tag는 새 후보를 무한히 늘리는 용도가 아니라 보조 context로 제한했다.

## 8. Remaining risks

| Risk | Status |
| --- | --- |
| 실제 Gemini 추출 품질이 baseline 이상인지 | 아직 live/API extraction grade는 실행하지 않았다. Gemini 비용/키 상태가 필요하다. |
| `visualFrameCues`를 실제 selected frame artifact와 연결하는 단계 | 후속 작업이다. |
| validation split 전체에서 packet 후보 과소/과분리 여부 | 현재는 unit/integration test와 build까지 검증했다. validation grade는 후속 shipping/CI 또는 별도 API run에서 확인해야 한다. |
| prompt 변경이 실제 LLM output 품질에 미치는 영향 | deterministic tests는 통과했지만, 모델 품질 평가는 별도 run이 필요하다. |

## 9. Next implementation step

다음 단계는 `codex-vision-keyframes`의 selected frame 결과를 packet의 `visualFrameCues`로 주입하고, `cue-extraction-report.json`에서 `missingTextEvidence`가 많은 packet만 vision augmentation 대상으로 보내는 것이다.
