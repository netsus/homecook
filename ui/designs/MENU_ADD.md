# MENU_ADD

> 기준 문서: 화면정의서 v1.5.0 §7 / 요구사항기준선 v1.6.3 §1-4 / 유저flow맵 v1.3.0 §③-a
> 생성일: 2026-04-24

## Layout Summary

- mobile baseline 375px 기준 신규 화면이다.
- narrow 320px sentinel에서도 검색 입력창, placeholder 액션, 직접등록 링크가 한 화면 안에서 읽혀야 한다.
- primary CTA는 검색 결과 선택 이후 이어지는 검색 경로 진입이며, 현재 화면에서는 상단 검색 입력창이 가장 강한 행동이다.
- scroll containment는 앱바/검색 입력 상단 구조를 유지하고, 하단 placeholder 영역은 세로 스크롤 안에서만 움직이도록 잡는다.
- anchor: 독립 신규 화면이며 기존 anchor screen을 직접 재설계하지 않는다.

## Screen Structure

1. 상단 앱바: 뒤로가기 + `식사 추가`
2. 검색 입력 영역: 레시피 이름 검색, 최근 입력 placeholder 없음
3. 검색 path 안내문: 검색해서 추가하는 흐름을 한 줄로 설명
4. 비활성 action grid:
   - 유튜브
   - 레시피북
   - 남은요리
   - 팬트리
5. 직접등록 링크: `직접 등록은 18번 슬라이스에서 열림`

## Mobile Notes

- mobile baseline 375에서는 검색 입력창과 비활성 action grid 사이 간격을 16px로 유지한다.
- narrow 320에서는 action grid 라벨이 두 줄로 내려가더라도 터치 타겟 44px은 유지한다.
- primary CTA 역할을 하는 검색 입력창은 첫 viewport 안에 완전히 보여야 한다.
- scroll containment 기준상 page-level horizontal scroll은 허용하지 않는다.
- anchor 문맥에서는 `MEAL_SCREEN -> MENU_ADD -> RECIPE_SEARCH_PICKER` 흐름만 연결하고 다른 add path는 이번 슬라이스에서 열지 않는다.
