# Pi Extractor 통합 이해 전환 계획

작성일: 2026-07-07
대상: `scripts/pi-extractor`
상태: 1단계 구현 대상 포함

## 한 줄 요약

현재 Pi extractor는 "근거 조각을 모아 레시피를 조립하는 구조"에 가깝다. 앞으로는 작은 단계부터 실제 실행 순서를 `전체 영상 이해 -> 요리 흐름 -> 레시피 초안 -> evidence audit`으로 바꾼다.

## 왜 다시 계획하는가

이전 반복에서 여러 안전 문제는 줄었다.

- forbidden read 방지
- visual target 폭증 방지
- frame evidence contract
- raw trace 폭증 방지
- 후보별 source packet
- transcript evidence 정규화

하지만 `fTlTpSJtrEs` 같은 다중 레시피 영상에서는 여전히 Claude golden 대비 만들기 단계와 요리 흐름이 약하다. 이유는 계획 이름은 "통합 이해"였지만, 코드 실행은 아직 대부분 아래 순서에 머물러 있기 때문이다.

```text
source packet
-> candidate ledger
-> timeline event
-> candidateSourcePacket
-> visual target
-> recipe draft
-> final audit
```

이 순서는 안전하지만, 모델이 먼저 "이 영상에서 실제로 어떤 요리들이 어떤 흐름으로 만들어졌는지"를 사람처럼 잡기 전에 후보와 근거 조각을 고정한다.

## 목표

이번 방향의 목표는 점수를 한 번에 크게 올리는 것이 아니다. 목표는 코드 구조 안에 진짜 통합 이해 단계가 들어가도록 만드는 것이다.

```text
공개 source + timeline event
-> video understanding narrative
-> recipe draft
-> visual 보충
-> evidence audit
```

`video understanding narrative`는 정답지가 아니다. 모델이 레시피를 쓰기 전에 만드는 "영상 이해 메모"다.

## 핵심 원칙

1. 후보를 너무 빨리 확정하지 않는다.
2. timeline event를 최종 이해로 착각하지 않는다.
3. narrative는 evidence를 대체하지 않는다.
4. final result에는 계속 evidence audit을 적용한다.
5. visual estimate는 빈칸 보충용이지 기본 추론 엔진이 아니다.
6. 한 PR에서는 작은 행동 변화 하나만 넣고 smoke로 확인한다.

## 이번 PR에서 할 1단계

### 구현 범위

새 opt-in flag를 추가한다.

```bash
--holistic-enable-integrated-understanding
```

이 flag가 켜져 있고 `holistic-draft` 모드일 때만 새 단계를 실행한다.

```text
video-timeline
-> video-understanding
-> holistic-draft
```

생성 파일:

- `video-understanding-prompt.txt`
- `video-understanding-command.json`
- `video-understanding-raw-response.json`
- `video-understanding.json`

### `video-understanding.json`의 역할

이 파일은 레시피 결과가 아니라, draft 전에 읽는 이해 메모다.

예상 구조:

```json
{
  "kind": "video-understanding",
  "dishStories": [
    {
      "candidateId": "storyboard-2-1",
      "title": "맥적",
      "plainStory": "이 구간은 고기를 썰고 양념해 굽는 흐름이다.",
      "mainIngredients": ["고기", "간장", "들기름"],
      "stepOutline": ["고기를 썬다", "양념한다", "굽는다"],
      "sourceRefs": ["description:5", "event:e4", "transcript:320s"],
      "uncertainties": ["고기 부위는 확실하지 않다"]
    }
  ],
  "globalStory": "영상은 여러 퇴근 후 집밥을 이어 보여준다.",
  "crossDishNotes": [],
  "uncertainties": []
}
```

### draft prompt에 넣는 방식

`holistic-draft-prompt.txt`에 아래 블록을 추가한다.

```text
[VIDEO_UNDERSTANDING]
...
```

그리고 prompt에 다음 규칙을 넣는다.

- 먼저 `VIDEO_UNDERSTANDING`을 읽고 요리 흐름을 잡는다.
- 그 다음 `CANDIDATE_SOURCE_PACKETS`와 `HOLISTIC_SOURCE_PACKET`으로 evidence를 확인한다.
- `VIDEO_UNDERSTANDING`은 방향키일 뿐, final evidence ref가 아니다.
- 재료, 양, 단계에는 기존 source/event/frame evidence를 붙인다.

## 이번 PR에서 하지 않는 것

- full train 전체 재추출
- Claude golden에 맞춘 제목별 하드코딩
- visual target cap 완화
- evidence audit 제거
- final result에 narrative 전용 필드 추가
- 오디오 분석 추가

## 성공 기준

### 코드 기준

- 기존 timeline-ledger 경로가 깨지지 않는다.
- flag가 꺼져 있으면 기존 흐름과 동일하다.
- flag가 켜져 있으면 `video-understanding` stage가 `holistic-draft` 앞에 생긴다.
- raw trace는 계속 KB 단위로 축약 저장된다.

### 테스트 기준

```bash
node --check scripts/pi-extractor/lib/holistic.mjs
node --check scripts/pi-extractor/run-pi-extraction.mjs
node --check scripts/pi-extractor/run-pi-train-extraction.mjs
pnpm exec vitest run tests/pi-extractor-runner.test.ts --testNamePattern "integrated understanding|timeline-ledger|sanitizes Pi raw"
pnpm exec vitest run tests/pi-extractor-runner.test.ts
```

### smoke 기준

1차 smoke는 fixture 기반으로 한다.

- golden/result/grade를 읽지 않는다.
- `video-understanding.json`이 생성된다.
- `holistic-draft-prompt.txt`에 `[VIDEO_UNDERSTANDING]`이 있다.
- draft prompt가 raw frame dump를 직접 노출하지 않는다.

실제 Pi smoke는 이 PR 이후 별도 iter에서 실행한다. 이유는 이번 PR의 목표가 "성능 개선 증명"이 아니라 "구조를 통합 이해 방향으로 돌리는 첫 발"이기 때문이다.

## 다음 반복 계획

### Iter A: understanding 품질 관찰

대상:

- `5NSTRKouSWs`
- `fTlTpSJtrEs`

확인:

- `video-understanding.json`이 사람에게 읽히는 요리 흐름인지
- 다중 레시피에서 sibling 구간을 자연스럽게 설명하는지
- draft가 evidence 조각 나열보다 story outline을 따라가는지

### Iter B: recipe draft가 understanding을 실제로 쓰는지 측정

비교:

- integrated understanding off
- integrated understanding on

지표:

- semantic judge 평균
- fTl recipe별 최저 점수
- 단계 커버리지
- visual target 수
- raw trace 크기

### Iter C: narrative가 나쁘면 버리는 gate 추가

`video-understanding`이 너무 빈약하거나 candidate와 맞지 않으면 draft에 넣지 않는다.

예:

```text
understanding.dishStories.length === 0
-> draft prompt에 VIDEO_UNDERSTANDING 미주입
```

### Iter D: candidate-first 완화

장기적으로는 candidate를 먼저 고정하는 대신, `video-understanding`이 요리 단위를 제안하고 candidate ledger가 이를 받아들이는 구조로 이동한다.

현재:

```text
candidate -> timeline -> understanding -> draft
```

목표:

```text
source + representative frames -> understanding -> candidate/story -> draft
```

## 위험과 대응

| 위험 | 설명 | 대응 |
| --- | --- | --- |
| narrative가 새 hallucination source가 됨 | 이해 메모가 근거 없이 요리를 꾸밀 수 있음 | narrative 자체를 final evidence로 인정하지 않음 |
| 비용 증가 | Pi 호출이 1회 늘어남 | opt-in flag로만 실행 |
| 단계가 더 복잡해짐 | stage가 하나 더 늘어 디버깅 표면 증가 | 산출물 파일을 명확히 분리 |
| 점수가 바로 안 오름 | 첫 단계는 구조 변경이라 성능 향상이 작을 수 있음 | fixture로 구조를 고정하고 실제 smoke는 다음 iter에서 판단 |

## 결론

이번 계획의 핵심은 "통합 이해"라는 말을 prompt에 쓰는 것이 아니다. 실제 코드 실행 순서에 `video-understanding`이라는 이해 전용 단계를 넣고, 레시피 draft가 그 이해 메모를 먼저 읽도록 만드는 것이다.

작게 시작하지만 방향은 분명하다. 이제부터는 증거 조립기를 더 정교하게 만드는 반복이 아니라, 레시피를 쓰기 전에 영상 전체를 이해하는 단계를 실제 pipeline에 넣는 반복으로 간다.
