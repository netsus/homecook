# Pi Extractor 통합 이해 Audit Bridge 계획

작성일: 2026-07-08 KST
대상: `scripts/pi-extractor`
상태: 구현 대상

## 한 줄 요약

이전 단계는 Pi가 레시피를 쓰기 전에 `video-understanding`이라는 "영상 이해 메모"를 만들게 했다. 이번 단계는 그 메모를 바로 믿지 않고, source와 대조한 `understanding audit`을 만들어 draft가 "이해 -> 검증 -> 수정된 이해 -> 레시피 작성" 순서로 움직이게 한다.

## 왜 필요한가

현재 구현은 통합 이해 방향으로 첫 발을 뗐지만, 아직 증거 조립기와 크게 달라 보이지 않는 문제가 남아 있다.

현재 흐름:

```text
source packet
-> video-understanding
-> source-backed gate
-> holistic draft
-> evidence audit
```

이 구조는 안전하지만, `video-understanding`이 draft에 들어가는 조건이 "지원되는 ref가 있느냐"에 너무 치우쳐 있다. 그러면 모델이 먼저 이해한 큰 흐름을 다루기보다, 다시 근거 조각을 통과시키는 장치처럼 보일 수 있다.

목표 흐름:

```text
source packet
-> video-understanding narrative
-> understanding audit
-> revised understanding brief
-> holistic draft
-> evidence audit
```

핵심은 `video-understanding`을 final evidence로 쓰는 것이 아니다. Pi가 먼저 세운 "요리 흐름 가설"을 따로 보존하고, 그 가설이 source와 어디가 맞고 어디가 약한지 표시한 뒤, draft가 그 수정된 가설을 보고 레시피를 쓰게 하는 것이다.

## 이번 구현의 목표

이번 PR의 목표는 점수 개선을 단번에 증명하는 것이 아니라, 통합 이해의 중간층을 코드에 작게 고정하는 것이다.

1. `video-understanding`의 각 story를 source packet과 대조한다.
2. 대조 결과를 `video-understanding-audit.json`에 저장한다.
3. draft prompt에는 usable story일 때만 `VIDEO_UNDERSTANDING`과 `VIDEO_UNDERSTANDING_AUDIT`을 별도 블록으로 넣는다.
4. draft prompt가 "story를 그대로 믿기"가 아니라 "audit을 보고 story를 수정해서 사용"하도록 한다.
5. multi-candidate 영상은 여전히 무리하게 주입하지 않는다. 대신 `video-understanding`과 audit은 log-only로 실행해서 왜 주입하지 않았는지 남긴다.

## 구현 범위

### 1. `holistic.mjs`

추가 함수:

```js
auditVideoUnderstandingAlignment(videoUnderstanding, holisticSourcePacket)
```

역할:

- story별 `candidateId`, `title`, `plainStory`, `sourceRefs`를 기록한다.
- source packet 안에서 실제로 지원되는 ref만 `supportedRefs`로 남긴다.
- `mainIngredients` 중 story의 supportedRefs가 가리키는 entry text 또는 같은 candidateSourcePacket text에서 확인되는 항목만 `supportedMainIngredients`로 분리한다.
- 확인되지 않는 항목은 `unsupportedMainIngredients`로 남긴다.
- `stepOutline`도 완전한 evidence로 확정하지 않고, source text에 단어가 겹치는 정도만 `stepAlignment`로 기록한다.
- 이 결과는 final evidence가 아니라 draft용 이해 검토 메모다.

예상 shape:

```json
{
  "kind": "video-understanding-audit",
  "storyAudits": [
    {
      "candidateId": "whole",
      "title": "양파 볶음",
      "draftRole": "orientation",
      "supportedRefs": ["description:2", "event:e1"],
      "unsupportedRefs": ["description:999"],
      "supportedMainIngredients": ["양파"],
      "unsupportedMainIngredients": ["감자"],
      "stepAlignment": [
        {
          "step": "양파를 썬다",
          "status": "source-aligned",
          "matchedRefs": ["event:e1"]
        }
      ],
      "revisionNotes": ["감자는 source에서 확인되지 않으므로 draft에서 제외하거나 uncertainty로 둔다."]
    }
  ]
}
```

### 2. `selectUsableVideoUnderstanding`

현재 gate는 유지하되, 반환값에 `audit`을 추가한다.

중요한 정책:

- accepted story가 있어도 audit은 항상 남긴다.
- rejected story도 audit에 남긴다.
- multi-candidate에서는 `video-understanding` 단계와 audit은 실행하되, draft 주입은 계속 꺼두고 audit reason에 `multi_candidate_understanding_injection_disabled`를 남긴다.
- audit은 "이해를 더 잘 쓰기 위한 메모"이지, final result에 새 필드를 추가하는 작업이 아니다.
- `forceLogOnly` 옵션을 둬서 runner가 안전상 draft 주입을 금지한 경우에도 audit 로그는 남길 수 있게 한다.

### 3. `run-pi-extraction.mjs`

새 산출물:

- `video-understanding-audit.json`

변경:

- `video-understanding-usage.json`과 함께 audit도 저장한다.
- draft prompt 생성 시 usable understanding이고 injection이 허용된 경우에만 `VIDEO_UNDERSTANDING`과 `VIDEO_UNDERSTANDING_AUDIT`을 함께 넘긴다.
- manifest에 `holisticVideoUnderstandingAudit` 요약을 남긴다.
- multi-candidate fallback에서는 `video-understanding`과 audit은 log-only로 실행하지만, draft prompt에는 understanding block을 넣지 않는다.
- raw understanding은 `candidateSourcePackets`나 `candidateTimelineIndex`에 섞지 않는다. source packet은 source packet으로만 유지하고, 이해 메모는 별도 prompt block으로만 전달한다.

### 4. `buildHolisticDraftPrompt`

추가 입력:

```js
understandingAudit
```

추가 prompt 규칙:

- `VIDEO_UNDERSTANDING`은 먼저 읽는다.
- 그 다음 `VIDEO_UNDERSTANDING_AUDIT`을 읽고, source와 안 맞는 부분은 draft에서 수정한다.
- `unsupportedMainIngredients`는 재료로 확정하지 않는다.
- `stepAlignment.status === "weak"`인 단계는 확정 단계가 아니라 uncertainty 또는 visualNeeds 후보로 둔다.
- final evidence에는 여전히 source ref, event ref, frame ref만 쓴다.

## 이번 구현에서 하지 않는 것

- multi-candidate understanding을 곧바로 draft에 주입하지 않는다.
- final `result.json` schema에 새 필드를 추가하지 않는다.
- score를 맞추기 위한 영상 ID별 하드코딩을 넣지 않는다.
- visual target cap을 크게 늘리지 않는다.
- golden/result/grade/이전 추출 결과를 추출 중에 읽지 않는다.
- culinary inference를 final result에 새 evidence tier로 승격하지 않는다.

## 성공 기준

### 구조 기준

- flag가 꺼져 있으면 기존 흐름이 변하지 않는다.
- flag가 켜져 있으면 `video-understanding-audit.json`이 생긴다.
- draft prompt에 `[VIDEO_UNDERSTANDING_AUDIT]`가 포함된다.
- 단, multi-candidate fallback처럼 log-only인 경우 audit 파일은 생기지만 draft prompt에는 `[VIDEO_UNDERSTANDING]`과 `[VIDEO_UNDERSTANDING_AUDIT]`가 없어야 한다.
- audit은 raw frame dump를 포함하지 않는다.
- multi-candidate 영상은 여전히 무리하게 understanding을 주입하지 않는다.
- `holistic-draft-source-packet.json`에는 `videoUnderstandingHints`나 `candidateSourcePackets[].understanding`을 넣지 않는다.

### 테스트 기준

```bash
node --check scripts/pi-extractor/lib/holistic.mjs
node --check scripts/pi-extractor/run-pi-extraction.mjs
pnpm exec vitest run tests/pi-extractor-runner.test.ts --testNamePattern "integrated understanding|video understanding audit"
pnpm exec vitest run tests/pi-extractor-runner.test.ts
pnpm lint
pnpm typecheck
```

행동 고정 테스트:

- `usable`: 지원되는 source ref가 있는 understanding은 audit을 만들고 draft prompt에 별도 block으로 들어간다.
- `weak-but-audited`: 지원되지 않는 understanding도 audit 파일은 남기지만 draft에는 주입하지 않는다.
- `multi-candidate-log-only`: multi-candidate fallback은 `video-understanding`과 audit을 log-only로 실행하고 draft에는 주입하지 않는다.
- `no-source-packet-contamination`: raw understanding이 `candidateSourcePackets` 안에 들어가지 않는다.

### 품질 판단 기준

이번 구현은 "성능이 바로 Claude처럼 좋아졌다"가 성공 기준이 아니다. 성공 기준은 다음이다.

- 코드 흐름이 `이해 메모 -> 검토 메모 -> 수정된 이해로 draft`에 가까워졌는가
- 이해 메모가 final evidence처럼 오용되지 않는가
- 이해가 약할 때 안전하게 빠지는가
- 다음 iter에서 실제 Pi smoke를 비교할 수 있는 로그가 충분한가

## 치명적 리스크와 대응

| 리스크 | 왜 문제인가 | 대응 |
| --- | --- | --- |
| audit이 또 다른 evidence assembler가 됨 | 모든 단어를 ref로만 통과시키면 통합 이해가 사라진다 | audit은 story를 지우는 장치가 아니라 수정 메모로만 사용한다 |
| unsupported를 너무 강하게 막음 | Pi가 만든 큰 흐름이 전부 버려질 수 있다 | final evidence가 아니라 draft orientation에서만 낮은 강도로 사용한다 |
| prompt가 길어짐 | 비용과 혼란이 늘 수 있다 | audit은 story별 요약만 넣고 raw source 전체 중복은 피한다 |
| multi-candidate 개선이 늦어짐 | 제일 어려운 영상에서 바로 효과가 작을 수 있다 | 이번 단계는 안전한 bridge이며, 다음 iter에서 multi-candidate story split을 별도 단계로 다룬다 |

## 새 세션 리뷰 후 반영할 항목

이 문서는 구현 전에 별도 critic 세션에서 다음 기준으로 검토받는다.

- 치명적 버그 가능성
- 과한 설계 여부
- 통합 이해가 아니라 증거 조립으로 후퇴하는 지점
- 테스트가 실제 행동을 고정하는지

타당한 피드백은 이 섹션 아래에 반영 기록으로 남긴다.

### 반영 기록

- P1 반영: multi-candidate fallback에서도 `video-understanding`과 `video-understanding-audit.json`은 log-only로 생성한다. draft prompt 주입은 계속 금지한다.
- P1 반영: raw understanding을 `candidateSourcePackets`/`candidateTimelineIndex`에 넣지 않는다. 이해 메모는 별도 prompt block으로만 전달한다.
- P2 반영: audit의 ingredient/step 검사는 `supportedRefs` entry text와 같은 candidateSourcePacket text로 제한한다. 전체 source packet fuzzy scoring은 하지 않는다.
- P2 반영: 테스트 기준에 `usable`, `weak-but-audited`, `multi-candidate-log-only`, `no-source-packet-contamination` 행동을 명시한다.
