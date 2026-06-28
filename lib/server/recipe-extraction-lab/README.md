# recipe-extraction-lab

유튜브 레시피 추출 강화 루프의 **구현 대상 모듈**. 루프(계획→구현→검증→채점→진단)가 ITER마다
이 디렉터리만 수정해 추출 품질을 끌어올린다. 프로덕션 `lib/server/youtube-import.ts`와 분리돼 있고,
루프 합격 후 본체 통합은 별도 작업으로 진행한다.

## 파일

- `prompt.mjs` — 추출 프롬프트 빌더 (`PROMPT_VERSION`, `buildExtractionPrompt`, `buildSourceText`). 루프가 주로 수정하는 곳.
- `extract.mjs` — `extractRecipeFromSources(input, deps)`. 소스 입력 + LLM 클라이언트로 구조화 레시피를 추출하고 후처리한다.

## 인터페이스

```js
import { extractRecipeFromSources } from "./extract.mjs";

const result = await extractRecipeFromSources(
  {
    video: { videoId, title, description, tags },
    transcript: { segments: [{ text, startMs, ... }], language } | null,
    authorComments: ["...", ...],
    youtubeUrl: "https://www.youtube.com/watch?v=...",
  },
  { llm: createCodexVisionKeyframesClient(), useVisual: true },
);
// → { recipes: [{ title, ingredients:[{name,nameAliases,amount,unit,amountBasis,optional,groupLabel}], steps:[string] }], meta }
```

`deps.llm`은 recipe-loop runner에서 기본적으로 `scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs`의 GPT 5.4 keyframes 클라이언트다.
동일 입력+프롬프트+프레임 선택 결과는 디스크 캐시를 읽어 재호출하지 않으므로, 프롬프트나 증거 묶음이 바뀐 ITER만 실제 LLM 비용이 발생한다.

recipe-loop 실험에서는 `scripts/recipe-loop/run-extraction.mjs --provider codex-vision-keyframes`가 기본 경로다.
필요하면 `--provider codex-vision`으로 단순 프레임 배치 분석 경로를 선택할 수 있다. 두 경로 모두 다른 모델 provider로 fallback하지 않는다.
기본 경로는 YouTube 링크에서 프레임을 고르고, 텍스트 source/evidence packet과 keyframe 근거를 GPT 5.4에 넘겨 최종 `{ recipes: [...] }` JSON을 생성한다.
캐시와 실패 로그는 `notebooks/recipe_loop_data/cache/codex-vision-keyframes/` 또는 `notebooks/recipe_loop_data/cache/codex-vision/` 아래에 남긴다.

## 현재 baseline (iteration 0)

기본 경로는 GPT 5.4 keyframes 추출이다. 텍스트 소스(설명란+댓글+자막)를 EvidencePacket으로 나누고,
선택된 영상 프레임 근거를 보강해 구조화 레시피를 받는다.
후처리: 만들기 단계에 등장하지 않는 `visual-estimate` 재료를 제거(오검출 방지)하고, 명시 source 수량이 있으면 시각 추정값으로 덮지 않는다.

## 루프가 강화할 지점 (M2 교훈 기반)

- 다중 레시피 누락 방지: 설명란 타임라인(`\d+:\d+`)·제목 숫자와 추출 레시피 개수 대조
- 분량 추정 정확도(특히 시각추정 케이스)
- ASR 노이즈 보정 (설명란/발화 교차검증)
- 재료 투입 순서 정확도
- 시각 오검출 필터링(미사용 재료 + 텍스트 소스 교차검증)
