# 2026-09-28 식사 기록 후속 — 미배포

현재 작업 브랜치에 다음 5개 항목을 누적했다. 이번 작업에서는 운영 데이터 변경·머지·배포를 하지 않았다.

1. 식사 기록 날짜 클릭과 스크롤에 따른 날짜 동기화는 같은 화면의 주소/선택 상태만 갱신한다. 이전 router 이동은 서버 페이지를 다시 읽고 로딩 경계로 화면을 바꿀 수 있었다. 식사 기록 주간 데이터는 기존 클라이언트 조회가 담당하므로 날짜 변화에 서버 페이지 요청을 만들지 않는다. 계획/기록 탭 전환의 기존 이동은 유지한다. 사용자가 스크롤을 시작하면 대기 중이던 초기 위치 맞춤도 취소한다.
2. 식사 상세에 기록 삭제 버튼을 추가했다. 기존 삭제 확인 → revision/동일 요청 키를 가진 삭제 → 해당 날짜 재조회 → 목록 복귀를 재사용한다. 소유권, 충돌 처리와 요리한 음식의 섭취량 되돌림은 그대로다. 먹은 양 아래 반복 설명을 삭제했다.
3. 공통 AppBackButton의 아이콘을 공유한다. 식사 기록/끼니/계획 고정 레시피/장보기/남은 요리/법적 문서와 레시피북 선택 화면의 다른 화살표를 같은 꺾쇠로 맞췄다. 상세 모달의 포커스 복원을 위해 버튼 ref도 전달한다.
4. 요리계획 상태 요약 아래의 링크는 `캘린더 보기 | 이번 주 장보기 기록 N개` 순서로 표시한다. 링크 목적지와 복귀 날짜는 바꾸지 않았다.
5. 식사 기록을 처음 읽는 동안 7개 날짜 카드를 유지하고 기록 본문에 스켈레톤을 표시한다. 반복 ‘기록을 불러오는 중’ 문구는 제거했다. 이미 읽은 날짜의 내용은 새로 읽는 동안에도 유지한다.

## 구현 근거와 범위

[Next.js 공식 Native History API 안내](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api)의 pushState/replaceState와 useSearchParams 연동을 사용한다. 식사 기록 내부 날짜 갱신에만 적용하며, 진행 중인 다른 탭 이동이 있으면 기존 이동 순서 처리를 따른다. API 응답·DB 스키마·인증 검사는 변경하지 않았다.

주요 파일:
- `components/planner/planner-week-screen.tsx`: 날짜 동기화·사용자 스크롤 우선·버튼 순서.
- `components/planner/meal-log-screen.tsx`: 상세 삭제/설명/기록 스켈레톤.
- `components/shared/app-back-button.tsx`: 공통 SVG·버튼·링크와 ref.
- `components/{shopping/shopping-detail-screen,planner/meal-screen,planner/meal-recipe-snapshot-screen,planner/recipe-book-detail-picker,leftovers/leftovers-screen,legal/legal-document-page}.tsx`: 뒤로가기 표시 재사용.

## 확인

- 식사 상세 삭제·헤더/스켈레톤·날짜/키보드/초기 스크롤·공통 뒤로가기 17개 통과.
- 기존 요리계획 날짜/스크롤/장보기 기록/빠른 탭 이동 선택 검사 4개 통과.
- 375×812 모바일과 데스크톱에서 날짜 선택 후 추가 스크롤 위치 유지, 날짜 변경으로 발생하는 planner 서버 페이지 요청 0건, 주간 조회 7회 유지, 날짜 표시/본문 로딩/상세 삭제 버튼 확인: 브라우저 흐름 2개 통과.
- 타입 검사·변경 파일 ESLint 확인. 실제 iPhone Safari 재확인은 남아 있으며 위 브라우저 결과는 로컬 테스트 데이터 기준이다.
