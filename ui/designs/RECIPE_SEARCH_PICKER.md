# RECIPE_SEARCH_PICKER

> 기준 문서: 화면정의서 v1.5.0 §8 / 요구사항기준선 v1.6.3 §1-4 / 유저flow맵 v1.3.0 §③-a
> 생성일: 2026-04-24

## Layout Summary

- mobile baseline 375px 기준 검색 결과 리스트 컴포넌트다.
- narrow 320px sentinel에서도 결과 카드 제목, 요약 정보, 선택 버튼이 무너지지 않아야 한다.
- primary CTA는 각 검색 결과 카드의 선택 행동이며, 선택 후 planned servings 입력 모달로 이어진다.
- scroll containment는 검색 입력 상단과 결과 리스트 영역을 분리하고 결과 리스트만 길어질 때 세로 스크롤되도록 유지한다.
- anchor: 독립 신규 컴포넌트이며 기존 anchor screen을 직접 수정하지 않는다.

## Result Card Structure

1. 레시피 제목
2. 간단한 보조 설명 또는 태그
3. 기본 인분/저장 정보 등 얕은 메타
4. 선택 액션

## Mobile Notes

- mobile baseline 375에서는 결과 카드 내부 여백을 16px로 유지한다.
- narrow 320에서는 제목 2줄까지 허용하고 선택 버튼은 항상 한 줄로 남긴다.
- primary CTA는 카드 전체 탭보다 선택 액션이 더 분명하게 읽혀야 한다.
- scroll containment 기준상 검색 결과가 길어져도 page-level horizontal overflow는 없어야 한다.
- anchor 문맥에서는 `MENU_ADD` 내부 검색 path를 닫는 역할만 담당한다.
