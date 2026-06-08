# RECIPEBOOK_DETAIL -- 레시피북 상세

> 기준 문서: 화면정의서 v1.5.12 / 요구사항 v1.7.5 / 유저플로우 v1.3.12 / API v1.2.15
> 기존 구현 슬라이스: `17b-recipebook-detail-remove`
> 추가 설계 슬라이스: `recipebook-diary-port`
> 생성일: 2026-06-08

---

## 화면 개요

`MYPAGE`의 레시피북 목록에서 책 하나를 선택했을 때 진입하는 레시피북 상세 화면이다. 기존 역할은 레시피북 안의 레시피 목록을 조회하고, 책 타입에 따라 저장 제거 또는 좋아요 해제를 수행하는 관리 화면이다.

이번 diary port는 화면을 더 "레시피북"처럼 보이게 하지만, 기능 계약은 바꾸지 않는다.

- **권한**: 로그인 필수
- **진입**: `MYPAGE` 레시피북 책 선택
- **라우트**: `/mypage/recipe-books/{book_id}`
- **목록 API**: `GET /api/v1/recipe-books/{book_id}/recipes`
- **이탈**:
  - 뒤로가기 → `MYPAGE` 레시피북 탭
  - 레시피 카드 클릭 → 기존 `RECIPE_DETAIL`

## 핵심 원칙

1. 이 화면은 Track 1에서 full reader가 아니다.
2. 레시피 상세 내용은 기존 `RECIPE_DETAIL`에서 본다.
3. web wide 화면은 왼쪽 목차/책 정보 rail과 오른쪽 recipe area로 분리한다.
4. mobile은 desktop split을 축소하지 않고 표지/요약 + 목록 흐름을 사용한다.
5. 책장/목차/page 느낌은 보조 감성 요소이며 유일한 navigation 수단이 아니다.
6. `GET /api/v1/recipes/{id}`를 숨은 preview source로 호출하지 않는다.

## Desktop Layout

```
+--------------------------------------------------------------------------------+
| Header / App shell                                                              |
+--------------------------------------------------------------------------------+
|                                                                                |
|  +--------------------------+  +---------------------------------------------+ |
|  | Book rail                |  | Recipe area                                 | |
|  |                          |  |                                             | |
|  |  +--------------------+  |  |  정성 가득한 한식 모음                     | |
|  |  | book cover preview |  |  |  12개의 레시피                             | |
|  |  +--------------------+  |  |                                             | |
|  |                          |  |  [검색/정렬이 기존 계약 안에 있으면만 사용] | |
|  |  목차                    |  |                                             | |
|  |  - 전체 레시피           |  |  +---------------------------------------+  | |
|  |  - 목록 상단             |  |  | recipe card                           |  | |
|  |  - 책 정보               |  |  +---------------------------------------+  | |
|  |                          |  |  +---------------------------------------+  | |
|  |  책 정보                 |  |  | recipe card                           |  | |
|  |  saved/custom/liked      |  |  +---------------------------------------+  | |
|  |  recipe_count            |  |                                             | |
|  +--------------------------+  +---------------------------------------------+ |
|                                                                                |
+--------------------------------------------------------------------------------+
```

### Desktop 기준

- 전체 콘텐츠는 wide viewport에서 충분한 max-width를 가진다.
- 왼쪽 rail은 240~320px 범위의 stable width를 가진다.
- 오른쪽 recipe area는 최소 640px 이상을 목표로 하고, 1440px 화면에서 좁게 눌리지 않는다.
- rail은 목차와 책 정보를 담되, 중요한 action은 recipe area에서도 접근 가능해야 한다.
- rail 목차와 mobile section chip은 예시 UI다. 실제 구현은 현재 API 응답과 기존 정렬/metadata 안에서만 구성한다.
- recipe card list는 기존 카드 semantics와 remove/unlike action을 유지한다.
- 책 배경/종이 질감은 subtle surface, border, shadow 정도로 제한한다.

## Mobile Layout

```
+---------------------------------------+
| <  레시피북 상세                       |
+---------------------------------------+
|                                       |
|  +---------------------------------+  |
|  | book cover / summary            |  |
|  | 레시피북 이름                   |  |
|  | 12개의 레시피 · saved           |  |
|  +---------------------------------+  |
|                                       |
|  [전체] [목록] [책 정보]             |
|                                       |
|  +---------------------------------+  |
|  | recipe card                     |  |
|  | name / meta / remove action     |  |
|  +---------------------------------+  |
|                                       |
|  +---------------------------------+  |
|  | recipe card                     |  |
|  +---------------------------------+  |
|                                       |
+---------------------------------------+
```

### Mobile 기준

- 모바일은 목차 rail을 쓰지 않는다.
- 상단 표지/요약 영역은 접히거나 스크롤 아웃될 수 있다.
- 섹션/필터 chip은 한 줄 horizontal rail을 허용하되 page-level overflow를 만들지 않는다.
- recipe card와 action touch target은 최소 44px이다.
- 320px에서 title/meta/action이 겹치면 action을 card 하단으로 내린다.

## 상태 정의

### Loading

- desktop: rail skeleton + recipe list skeleton
- mobile: cover skeleton + card skeleton
- skeleton은 ready 상태와 같은 width/height를 사용해 layout shift를 줄인다.

### Empty

- 책 안에 레시피가 없을 때 "아직 담긴 레시피가 없어요" 안내를 표시한다.
- 저장/좋아요/직접 추가 owning flow를 바꾸는 CTA는 넣지 않는다. 필요한 경우 기존 탐색/추가 경로로 이동한다.

### Error

- 목록 조회 실패 시 error copy와 retry action을 제공한다.
- 책 자체가 없거나 권한이 없으면 기존 not-found/unauthorized 정책을 유지한다.

### Unauthorized

- 로그인 안내 후 return-to-action으로 `/mypage/recipe-books/{book_id}` 복귀를 유지한다.

### Read-only / Action Policy

- `saved/custom`: 기존 제거 action 유지.
- `liked`: 좋아요 해제 action 유지.
- `my_added`: 제거 불가 정책 유지.
- 시스템 책 수정/삭제는 `MYPAGE`에서 노출하지 않는다.

## Recipe Card 기준

- 카드 전체 클릭 영역은 `RECIPE_DETAIL` 이동이다.
- 제거/좋아요 해제 버튼은 카드 클릭과 이벤트가 충돌하지 않아야 한다.
- thumbnail, title, source/type, servings/time 같은 기존 목록 metadata만 사용한다.
- 상세 ingredients/steps를 이 화면에서 새로 조회하지 않는다.
- 긴 제목은 2줄 말줄임, metadata는 1줄 말줄임을 기본으로 한다.

## Accessibility

- rail 목차는 `nav` 또는 `aside`로 의미를 분리한다.
- 현재 섹션은 `aria-current` 또는 selected state를 제공한다.
- recipe list는 `role="list"` / card는 `article` 또는 `listitem`을 사용한다.
- remove/unlike 버튼은 `aria-label`에 레시피 이름과 동작을 포함한다.
- keyboard 사용자는 rail, list, action을 순서대로 이동할 수 있어야 한다.
- page/book effect가 없어도 모든 이동과 action이 가능해야 한다.

## 구현 금지

- full page-turn reader 구현 금지.
- hidden `GET /api/v1/recipes/{id}` preview 호출 금지.
- view_count를 증가시키는 데이터를 목록 preview처럼 사용 금지.
- 새 API endpoint 또는 DB 필드 추가 금지.
- 저장 가능 recipebook type 확장 금지.
- 삭제된 `DELETE /recipes/{id}/save` endpoint 복원 금지.

## QA Blockers

- desktop 1440에서 recipe area가 640px 미만으로 좁아진다.
- 모바일에서 desktop rail이 그대로 축소되어 가로 overflow가 생긴다.
- recipe card 클릭과 remove/unlike action이 충돌한다.
- 목록 화면 진입만으로 recipe detail view_count가 증가한다.
- empty/error/unauthorized 상태가 책 표지 visual만 남기고 복구 action을 잃는다.
- page-turn/book animation이 keyboard/screen reader navigation을 막는다.

## Contract Evolution Candidates

| 후보 | 현재 상태 | 필요 조건 |
| --- | --- | --- |
| Read-only reader preview data path | 없음. 현재 상세 API는 조회수 의미가 있다. | 요구사항/화면정의서/API/DB 영향 검토와 사용자 승인 |
| Page-turn full reader | scope 밖. 기존 상세로 이동한다. | read-only data path 승인 후 별도 FE slice |
