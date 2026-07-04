# Ingredient Image Generation Batches

Generated at: 2026-07-02T08:22:13.377Z
Source: local Supabase DB `public.ingredients`, `public.ingredient_synonyms` synced to remote + `public/assets/ingredients/plush-v2/manifest.json`

## Summary

- DB ingredients: 865
- DB synonyms: 625
- Manifest image entries: 853
- Manifest exact DB standard-name matches: 845
- DB ingredients already covered by actual pantry sticker lookup: 845
- Generated WebP-only targets excluded from generation backlog: 10
- Duplicate/synonym groups found among DB standard names: 9
- Duplicate variant DB names excluded from generation: 10
- Non-covered duplicate variants excluded from generation: 7
- Generation targets after exclusions: 14
- Batch size: up to 100, similar-type grouping first
- Batch count: 5

## 기준

- “이미지 적용됨”은 `getPantryStickerSrc()`와 같은 기준입니다: manifest exact match 또는 띄어쓰기/기호 정규화 match.
- 배치 목록 정리에서는 manifest 적용 항목과 현재 생성 산출물(`/public/assets/plush-v2/*.webp`)이 명확히 대응되는 항목을 생성 완료로 보고 제외합니다.
- DB 동의어만 있고 manifest 키가 없는 표준재료는 실제 팬트리 이미지 적용으로 보지 않습니다.
- DB 동의어가 다른 표준재료 이름을 가리키는 경우는 중복 후보로 보고 대표 1개만 배치에 남깁니다.
- `크림`은 소스 이미지가 아니라 `생크림` 계열 이미지로 적용되도록 manifest를 보정한 상태입니다.
- 배치는 정확한 100개 고정보다 유사군 유지가 우선입니다. 현재 모든 배치는 100개 이하입니다.

## Manifest Entries Not Current DB Standard Names

- 김치국물 (manifest-only derived display key)
- 배추김치 (manifest-only derived display key)
- 신김치 (manifest-only derived display key)
- 카놀라유 (manifest-only alias key)
- 오리엔탈 드레싱 (manifest-only alias key)
- 해물육수(코인) (표시 alias: 해물육수)
- 다시다 (manifest-only generated display key)
- 참치액 (manifest-only generated display key)

## Duplicate/Synonym DB Ingredient Groups Excluded From Batches

### 1. 간장

- 묶음: 간장, 국간장
- 배치 기준 대표: 간장
- 이미 적용된 이름: 간장, 국간장
- 배치에서 제외: 국간장
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 2. 고추

- 묶음: 고추, 풋고추
- 배치 기준 대표: 고추
- 이미 적용된 이름: -
- 배치에서 제외: 풋고추
- 근거: DB 동의어가 다른 표준재료 이름을 가리킴

### 3. 귀리

- 묶음: 귀리, 오트밀
- 배치 기준 대표: 귀리
- 이미 적용된 이름: -
- 배치에서 제외: 오트밀
- 근거: DB 동의어가 다른 표준재료 이름을 가리킴

### 4. 대파

- 묶음: 대파, 파
- 배치 기준 대표: 대파
- 이미 적용된 이름: 대파
- 배치에서 제외: 파
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 5. 쌀

- 묶음: 쌀, 찹쌀, 흑미
- 배치 기준 대표: 쌀
- 이미 적용된 이름: 쌀
- 배치에서 제외: 찹쌀, 흑미
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 6. 오이

- 묶음: 오이, 청오이
- 배치 기준 대표: 오이
- 이미 적용된 이름: 오이
- 배치에서 제외: 청오이
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 7. 카놀라유

- 묶음: 식용유, 카놀라유
- 배치 기준 대표: 카놀라유
- 이미 적용된 이름: 식용유, 카놀라유
- 배치에서 제외: 식용유
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 8. 크림

- 묶음: 생크림, 크림
- 배치 기준 대표: 크림
- 이미 적용된 이름: 생크림, 크림
- 배치에서 제외: 생크림
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

### 9. 후추

- 묶음: 통후추, 후추
- 배치 기준 대표: 후추
- 이미 적용된 이름: 후추
- 배치에서 제외: 통후추
- 근거: 이미지 적용된 이름을 대표로 우선 선택, DB 동의어가 다른 표준재료 이름을 가리킴

# Generation Batches

유사한 재료가 같은 이미지 생성 컨텍스트에 들어가도록 재료군을 먼저 고정한 뒤 배치를 다시 묶었습니다. 정확히 100개로 자르는 것보다 재료군 응집도를 우선하며, 현재 모든 배치는 100개 이하입니다.

## Batch 1 - 김치/절임/양념류 (6개)

- 재료군: 소스/장/육수 3, 당류/디저트 3
- 카테고리: 양념 6
- 목록: 조미료, 허니머스타드 소스, 육수, 젤리, 초코바, 푸딩

## Batch 2 - 열매채소/콩/잡곡 원물 (2개)

- 재료군: 쌀/잡곡/밥류 2
- 카테고리: 곡류 2
- 목록: 즉석밥 작은 거, 초밥용 밥

## Batch 3 - 유제품/견과/조리보조 (1개)

- 재료군: 유제품/크림류 1
- 카테고리: 유제품 1
- 목록: 따뜻한 우유

## Batch 4 - 육류/알/가공육 (1개)

- 재료군: 알/계란류 1
- 카테고리: 육류 1
- 목록: 스크램블드에그

## Batch 5 - 해산물/해조류/젓갈 (4개)

- 재료군: 해산물 가공/젓갈/육수 3, 해조류/김 1
- 카테고리: 해산물 4
- 목록: 참치캔, 멸치 육수, 어묵 국물, 다시마 육수
