# recipe_loop_data

유튜브 레시피 추출 강화 루프의 골든셋 데이터. 분할·노출 정책은 `manifest.json`이 단일 소스다.

- `train/` — 루프에 케이스별 상세 공개
- `validation/` — 매 ITER 집계 점수만 공개
- `holdout/` — 루프 중 채점 금지, 최종 1회만
- `candidates/` — 교체용 spare

영상 폴더 구성: `source.json`(스냅샷), `golden.json`(정답지).

## golden.json 스키마 (v1)

```json
{
  "schemaVersion": 1,
  "videoId": "YUdJBeOdrMY",
  "draftedBy": "claude:description+captions",
  "reviewStatus": "draft",
  "recipes": [
    {
      "title": "노오븐 라따뚜이",
      "servings": null,
      "ingredients": [
        {
          "name": "가지",
          "nameAliases": ["eggplant"],
          "amount": "1",
          "unit": "개",
          "amountBasis": "stated-description",
          "optional": false,
          "groupLabel": null,
          "evidence": "description"
        }
      ],
      "steps": [
        { "order": 1, "instruction": "가지와 애호박을 5mm 두께로 슬라이스한다.", "evidence": "caption" }
      ]
    }
  ],
  "graderNotes": ["설명란과 자막의 분량이 다르면 설명란 기준으로 작성"]
}
```

## 작성 규칙

1. **소스 우선순위**: 설명란(작성자가 직접 쓴 레시피) > 작성자 댓글 > 자막. 충돌 시 설명란 기준, `graderNotes`에 기록.
2. **재료**
   - `name`은 한국어 표준명(앱 재료 사전 기준 표기). 원문 표기·외국어·ASR 변형은 `nameAliases`에.
   - `amount`/`unit`은 **최대한 채운다**. 우선순위: 텍스트 명시(설명란/댓글/자막) > 영상 발화 > 화면 자막 > 시각 추정.
     시각 추정은 영상 속 비율·용기 크기로 합리적 추정치를 적고, 정말 판단 불가할 때만 `null`.
   - `amountBasis`로 근거를 표기: `"stated-description"` | `"stated-caption"` | `"stated-comment"` | `"spoken"` | `"onscreen"` | `"visual-estimate"` | `null`.
     파이프라인의 분량 추정(visual quantity) 채점 시 `visual-estimate`는 더 관대한 허용 오차로 채점한다.
   - `amount`는 문자열: `"1/2"`, `"2~3"`, `"약간"`, `"약 200"` 같은 표기 허용. 단위는 소스 표기 그대로(`큰술`, `T`, `g`...).
   - 양념장·소스 등 묶음은 `groupLabel`로 구분 (예: `"양념장"`).
   - "기호에 따라", "있으면" 같은 재료는 `optional: true`.
   - 물·소금처럼 언급 없이 당연히 쓰이는 것은 소스에 등장할 때만 포함.
3. **만들기(steps)**
   - 명령형 한국어 한 문장씩, 핵심 동작 단위. 영상 진행 순서대로 6~15개 권장(짧은 영상은 더 적게).
   - 인사말·잡담·시식 멘트 제외. 불·시간·상태 판단 기준("양파가 투명해질 때까지"), 조리기구 설정(에어프라이어 온도/시간 등)은 반드시 포함.
   - **자막·설명란이 빈약하면 Gemini 시각 추출로 단계를 뽑는 것을 기본으로 한다** (2026-06-12 검수 방침: 고객에게 주는 정보의 정확성·직관성이 API 비용보다 우선).
   - 재료 투입 순서가 맛에 영향을 주는 단계(양념 먼저/나중 등)는 영상의 실제 순서를 따른다.
4. **다중 레시피 영상**: 영상이 실제로 조리 과정을 보여주는 요리마다 `recipes[]` 항목 분리. 짧게 스치는 요리는 `graderNotes`에 표시.
   - **설명란 타임라인·제목의 요리 목록과 대조해 누락을 확인한다** (2026-06-12 교훈: 자막에 안 나오는 요리가 타임라인엔 있었음).
   - 시판품을 활용하는 요리(예: 사 온 곱창 + 직접 만든 부추무침)도 조리 과정이 있으면 포함한다. "구매 제품 제외" 같은 규칙을 시각 추출 프롬프트에 넣을 때는 과잉 제외에 주의.
5. **ASR 노이즈**: 자막 인식 오류는 요리 상식으로 보정해 표준명으로 적되, 확신이 없으면 `graderNotes`에 원문과 함께 기록.
6. **검수 흐름**: 초안 `reviewStatus: "draft"` → 사용자 검수 반영 후 `"approved"`. 루프는 approved만 신뢰한다.
