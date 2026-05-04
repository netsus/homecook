# Claude Design Correction Prompt

아래 파일들을 업로드합니다.

- `index.html`
- `homecook-baemin-prototype.html`
- `app.jsx`
- `screens/wave1.jsx`
- `screens/planner.jsx`
- `screens/pantry.jsx`
- `screens/mypage.jsx`
- `screens/extras.jsx`
- `baemin-full-port-ledger.md`
- `IMPORT_REVIEW.md`

요청:

Wave 1 새 화면을 더 늘리지 말고, 현재 산출물을 포팅 가능한 상태로 정리해줘.

반드시 해줘:

1. `index.html`에 들어간 Wave 1 변경을 split source files에도 반영해줘.
   - `app.jsx`
   - `screens/planner.jsx`
   - `screens/pantry.jsx`
   - `screens/mypage.jsx`
   - `screens/extras.jsx`
   - 필요하면 `screens/wave1.jsx`

2. `homecook-baemin-prototype.html`도 Wave 1 실행본으로 동기화해줘.
   - 최종적으로 `index.html`과 같은 화면/라우팅을 보여야 해.

3. `MENU_ADD` 진입을 연결해줘.
   - mobile planner empty slot `+ 식사 추가` 클릭 시 `MenuAddScreen`으로 이동
   - desktop planner `+ 식단 추가` 클릭 시 기존 `PlannerAddPopup` 고정 recipe가 아니라 `MenuAddScreen`으로 이동
   - date/slot이 있으면 `MenuAddScreen`에 전달

4. 오른쪽 quick flow panel에 Wave 1 핵심 바로가기를 추가해줘.
   - `MENU_ADD`
   - `SHOPPING_DETAIL`
   - `LEFTOVERS`
   - `SETTINGS`
   - `MYPAGE_TAB_RECIPEBOOK`
   - `MYPAGE_TAB_SHOPPINGLISTS`

5. `INGREDIENT_FILTER_MODAL`을 처리해줘.
   - 가능하면 HOME 검색 영역에서 여는 modal/sheet로 추가
   - 어렵다면 이번 Wave 제외라고 코드 주석/핸드오프에 명확히 표시

6. 신규 route page의 desktop 처리를 명확히 해줘.
   - 별도 desktop layout을 만들면 좋고,
   - 시간이 부족하면 desktop shell 안 mobile-style fallback임을 `HANDOFF.md`나 주석에 명확히 적어줘.

제약:

- 기존 배민 스타일 토큰과 톤은 유지
- 공식 기능 의미는 바꾸지 말 것
- 새 기능을 더 만들지 말고, 연결/동기화/핸드오프 정리만 할 것
- 결과물은 실행 가능한 HTML과 split source가 서로 같은 상태여야 함
