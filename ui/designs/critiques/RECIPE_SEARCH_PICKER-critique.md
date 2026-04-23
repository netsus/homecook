# RECIPE_SEARCH_PICKER critique

> 검토 대상: `ui/designs/RECIPE_SEARCH_PICKER.md`
> 검토일: 2026-04-24
> 검토자: design-critic

## Summary

- mobile baseline 375 기준으로 검색 결과 카드 위계는 충분히 명확하다.
- narrow 320에서도 제목 2줄 허용과 선택 버튼 고정 방침이 현실적이다.
- primary CTA를 결과 선택으로 고정한 점이 planned servings 모달 진입과 자연스럽게 이어진다.
- scroll containment는 리스트 길이가 길어져도 안정적인 패턴이다.
- anchor 표현은 독립 신규 컴포넌트라는 경계를 분명히 남긴다.

## Minor Notes

- empty 상태 카드와 error 상태 카드는 결과 카드와 시각 톤을 충분히 구분하는 편이 좋다.
- narrow 320에서 메타 정보가 길어지면 한 줄 고정보다 우선순위 낮은 정보 삭제가 더 안전하다.
