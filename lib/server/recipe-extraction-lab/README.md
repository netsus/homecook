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
  { llm: createCachedLlmClient(), useVisual: true },
);
// → { recipes: [{ title, ingredients:[{name,nameAliases,amount,unit,amountBasis,optional,groupLabel}], steps:[string] }], meta }
```

`deps.llm`은 기본적으로 `scripts/recipe-loop/lib/llm-client.mjs`의 캐시 래핑 Gemini 클라이언트다. 동일 입력+프롬프트는
디스크 캐시를 읽어 재호출하지 않으므로, 프롬프트가 바뀐 ITER만 실제 LLM 비용이 발생한다.

recipe-loop 실험에서는 `scripts/recipe-loop/run-extraction.mjs --provider codex-vision`으로
`scripts/recipe-loop/lib/codex-vision-client.mjs`를 선택할 수 있다. 이 경로는 Gemini를 fallback으로 쓰지 않고,
YouTube 영상 프레임 추출 → Codex CLI 이미지 배치 분석 → 최종 `{ recipes: [...] }` JSON 생성 순서로 동작한다.
캐시와 실패 로그는 `notebooks/recipe_loop_data/cache/codex-vision/` 아래에 남긴다.

## 현재 baseline (iteration 0)

기본 경로는 단일 Gemini 호출로 텍스트 소스(설명란+댓글+자막) + 영상 시각 분석(`file_uri`)을 함께 주고 구조화 레시피를 받는다.
후처리: 만들기 단계에 등장하지 않는 `visual-estimate` 재료를 제거(오검출 방지).

## 루프가 강화할 지점 (M2 교훈 기반)

- 다중 레시피 누락 방지: 설명란 타임라인(`\d+:\d+`)·제목 숫자와 추출 레시피 개수 대조
- 분량 추정 정확도(특히 시각추정 케이스)
- ASR 노이즈 보정 (설명란/발화 교차검증)
- 재료 투입 순서 정확도
- 시각 오검출 필터링(미사용 재료 + 텍스트 소스 교차검증)
