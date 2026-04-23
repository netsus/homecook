# MENU_ADD critique

> 검토 대상: `ui/designs/MENU_ADD.md`
> 검토일: 2026-04-24
> 검토자: design-critic

## Summary

- mobile baseline 375 구조는 검색 입력이 첫 시선에 잡혀서 목적이 분명하다.
- narrow 320에서도 검색창, 비활성 placeholder 버튼, 직접등록 링크 순서가 유지된다.
- primary CTA를 검색 입력으로 본 해석은 이번 슬라이스 범위와 잘 맞다.
- scroll containment는 상단 앱바 고정 + 본문 세로 스크롤 구조로 충분하다.
- anchor 표현은 독립 신규 화면이라는 점을 분명히 해 anchor-screen 변경으로 오해되지 않는다.

## Minor Notes

- placeholder 버튼은 실제 CTA처럼 보이지 않게 톤을 낮춰야 한다.
- narrow 320에서 버튼 라벨 줄바꿈이 생기면 아이콘과 라벨 간격을 먼저 지키는 쪽이 안전하다.
