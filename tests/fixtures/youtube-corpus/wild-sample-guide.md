# YouTube Corpus Wild Sample Guide

## Purpose

Wild sample은 in-corpus fixture 점수와 섞지 않는다. 파서 개선 후 실제 설명란에서 체감 품질이 좋아졌는지 별도 보고하기 위한 수동 smoke다.

## Sample Size

- 최소 5개 채널
- 최소 10개 영상
- 구조화된 설명란과 약한 구조 설명란을 분리 기록

## Collection Rules

- YouTube Data API quota를 쓰지 않고 설명란을 수동 복사한다.
- 개인정보, 연락처, 외부 링크, 협찬 문구, 상품 구매 정보는 fixture에 넣기 전에 제거한다.
- 원문을 그대로 장문 저장하지 말고 레시피 추출에 필요한 재료/조리 구조만 sanitized form으로 보존한다.
- in-corpus fixture와 같은 영상은 wild sample에 포함하지 않는다.

## Reporting

Report JSON의 `wild_sample_aggregate`에 별도 기록한다.

```json
{
  "wild_sample_aggregate": {
    "corpus_avg_f1": 0.0,
    "category_avg": {
      "structured": 0.0,
      "weak": 0.0
    }
  }
}
```
