# 2026-10-09 레시피 상세 영양 UI와 식사기록 수정 묶음

## 변경

홈에서 여는 일반 레시피 상세의 영양 카드를 플래너·식사기록과 맞췄다. 공통 파스텔 색상(탄수화물 #94C9FF, 단백질 #FFA7C2, 지방 #FFD477), 하늘색 배경, 큰 총 kcal와 작은 단위, 탄단지3열·정수 표시를 사용한다. 중복 테두리/그림자와 과도한 굵기를 줄였다. 숫자 표시만 반올림하고 원본 수치·막대 비율과 `scalable × 선택인분 / 기준인분 + fixed` 계산은 유지한다. 기준1인분 안내, 추가 영양표, AI 추정 안내와 재시도·로딩·결측 상태도 유지한다.

앞선 [식사기록 확인창·입력·양 초과 수정](meal-log-dialog-fixes-20261009.md)을 같은 묶음으로 반영한다. 최신 master의 유튜브 자동저장과 AI 영양 관련 변경은 보존했다. 기존 작업과 겹친 현재기준 문서는 양쪽 내용을 유지해 통합했다.

## 파일·검증

- UI: `components/recipe/recipe-nutrition-card.tsx`. 색상은 기존 `lib/planner/meal-log-nutrition-presentation.ts`의 공통 토큰을 사용한다.
- 검사: `tests/recipe-nutrition-ui.test.tsx`, `tests/recipe-detail-screen.test.tsx`, `tests/e2e/recipe-nutrition-consistency.spec.ts`. 계획추가 검사는 실제 비동기 종료를 기다리는 키보드 입력으로 보완했다.
- 영양 카드12개, 식사기록 수정 관련103개 통과. 묶음 웹 검사1,276개 통과(중복 포함 별도집계이므로 단순 합산하지 않는다).
- 320px/375px/1280px 레시피 화면과 partial/AI 상태4개, 확인창/드래그/연속수정2개 브라우저 검사 통과. 모바일 고정 하단버튼에 가리지 않게 스크롤한 상태에서 실제카드를 확인했다.
- 타입 검사 통과. 새 master 경로를 반영하기 위해 Next의 생성 route types를 새로 만들었으며 앱의 타입보호를 낮추지 않았다.
- 실제 화면: `.omx/evidence/recipe-nutrition-20261009/final/`. 로컬예시자료이며 실제 iPhone/사용자계정 검증과 구별한다.
- SQL·DB·worker·의존성 변경 없음. 원본 영양정보와 권한·요청키·수정버전 보호는 유지한다.

## 배포

사용자 요청으로 배포 준비 중이다. 실제 웹/빌드/PR 결과는 완료 후 기록한다.
