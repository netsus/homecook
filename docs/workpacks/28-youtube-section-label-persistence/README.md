# 28. YouTube Section Label Persistence

## 목적

YouTube 설명란에서 추출한 재료/단계 섹션 라벨을 등록 후에도 DB, 레시피 상세, 요리모드에서 유지한다. 예시는 `빵 반죽`, `커스터드 필링`, `쿠키 토핑`, `빵 성형`, `마무리`다.

## 공식 계약

- 요구사항: `docs/요구사항기준선-v1.7.3.md`
- 화면정의: `docs/화면정의서-v1.5.10.md`
- 유저 Flow: `docs/유저flow맵-v1.3.10.md`
- DB: `docs/db설계-v1.3.9.md`
- API: `docs/api문서-v1.2.13.md`
- Source of truth: `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`

## 범위

- `POST /recipes/youtube/extract` 응답의 `ingredients[].component_label`, `steps[].component_label`
- `POST /recipes/youtube/register` body의 ingredient/step `component_label`
- `recipe_ingredients.component_label`, `recipe_steps.component_label`
- recipe detail response와 UI
- standalone cook-mode / planner cook-mode response와 UI
- same-label prefix 중복 표시 방지

## 비목표

- `POST /recipes` manual create body 확장 없음
- manual recipe authoring UI에 섹션 입력 추가 없음
- shopping aggregation 변경 없음
- `ConsumedIngredientSheet` grouping 없음
- legacy row backfill 없음
- `recipe_sections` 테이블 없음

## 구현 메모

- `component_label`은 섹션 heading authority다.
- 새 YouTube 등록 데이터에서 `display_text`, `instruction`은 같은 `[섹션명]` prefix를 포함하지 않는다.
- mixed legacy row에서 `component_label`과 같은 leading `[섹션명]` prefix가 있으면 detail/cook-mode render에서 중복 표시를 억제한다.
- `component_label`이 없는 legacy prefix-only row는 기존 표시를 유지한다.

## 검증

- extract → review state → register body → server parser → RPC → DB label survival
- recipe detail / standalone cook-mode / planner cook-mode read propagation
- recipe detail / cook-mode UI adjacency heading rule
- manual create no-change
- shopping aggregation no-change
- Claude read-only conformance review
