# 기존 플래너 조작 복원 검증 — 2026-09-06

## 결과와 범위

`fix/restore-planner-interactions`에서 기존 조작을 복구했다. 기준 base는
`51c56a54fbb2e30aed279cf90f53df4b721fca89`이며 작업 중 origin/master를
확인한 결과 비교 감사 당시 `97469c9c`보다 앞선 상태였다.

- 요리 계획 / 식사 기록 탭과 날짜·뒤로가기 동기화 유지.
- 이전/현재/다음 주 3페이지, 가로 스크롤·방향키 주 이동과 중앙 복귀 복원.
- 모바일 7일 카드 목록, 고정 날짜 이동 바, 데스크톱 날짜×끼니 표 복원.
- 빈/채운 끼니의 기존 추가 sheet/picker를 재사용하고 실제 날짜·끼니를 전달.
- 주간 요약, 최근 계획, 장보기 기록 링크 복원.
- 복원된 추가 메뉴에는 신규 완제품 계획을 넣지 않는다. 계획 영양 합계도 복구하지 않는다.
- API·DB·권한·Meal 상태 전이·영양 계산·식사 기록 구현은 변경하지 않았다.

## 테스트

| 검증 | 결과 |
| --- | --- |
| 복원 집중 테스트 2파일 | 34/34 통과 |
| 플래너 관련 확장 검사 | 23파일 통과, 1파일 의도적 skip; 206 통과, 2 skip. 이후 장보기 링크 회귀 1건을 추가해 집중 검사를 다시 통과 |
| 기존 shell/history/legacy/추가 picker/식사 기록 UI 검사 | 10파일, 109 통과 |
| 영양 계산·snapshot·배치·식사 기록/API/UI/SQL 구조 | 23파일, 204 통과 |
| 실제 격리 PostgreSQL meal-log-core | 25/25 통과, Data API health 200, owned cleanup 성공 |
| 정적 검사 | 전체 lint, typecheck, 변경 파일 ESLint, git diff --check 통과 |
| Production build | 임시 clean runtime 복사본에서 성공, exit 0. lint는 원본 작업 디렉터리에서 별도 통과 |
| 문서 정합성 | validate:source-of-truth-sync 통과 |

마지막 build 결과는 `/tmp/planner-restoration-build-final.log`에 기록한다.
개인 `.env` 없이 현재 runtime source를 복사한 임시 디렉터리에서 Next production
build를 실행했다. 임시 복사본의 pnpm symlink에서 ESLint plugin resolution이 달라
build에는 `--no-lint`를 사용했고 원본 작업 디렉터리의 전체 lint는 별도로 통과했다.
최초 build 복사본의 누락된 테스트 helper를 포함시켜 전체 type validation을 유지했다.

## 실제 DB에서 확인한 계산

- 총 1,000g / 1,000kcal 요리에서 100g 섭취 → 100kcal 기록.
- 100g당 200kcal 완제품에서 50g 섭취 → 100kcal 기록.
- 같은 배치에 100g·200g 기록 후 앞 기록을 150g으로 수정 → 650g 잔량.
  이후 10g 추가 기록 → 640g 잔량.
- complete 250kcal + partial 50kcal + unavailable → partial 300kcal.
  영양 불명은 확정된 0으로 취급하지 않는다.
- 800g·200g 소진 후 801g 정정은 거부되고 DB 상태가 유지된다.
- 동일 수정 재시도는 소비 이벤트를 중복 생성하지 않는다.

Supabase CLI `2.110.0`, migration SHA
`39b8171e36e704a742c583fb213b6257d524fba2fd1ca4664bfa935d5508bf4a`,
canonical `pnpm test:meal-log-core:postgres`의 별도 소유 isolated project를 사용했다.
운영 DB·Cloud·linked target·실제 계정 설정은 접근하거나 변경하지 않았다.

## 브라우저 확인

Chrome에서 390×844, 320×844, 1280×900을 확인했다. in-app browser가 요청 크기를
300px로 축소해 적용하는 환경에서는 치수를 주장하지 않고 Chrome으로 재검증했다.

- 가로 스크롤: 9/7~9/13로 정확히 한 주 이동, date rail 중앙 복귀 확인.
- 세로 스크롤: 날짜 바가 viewport 안에 유지됨.
- 날짜 선택: Next의 query navigation에 `scroll:false`를 사용해 자동 top reset 제거.
  320px에서 header bottom 249px, 선택 카드 top 261px로 12px 아래에 노출.
- 빈 끼니 → 레시피 검색 → 인분 → 추가 성공 → `9/7 점심` 상세를 확인.
- 모바일 320px의 page width 320px, desktop page width 1280px, desktop 날짜 행 7개 확인.
- 실제 스마트폰 터치·키보드·스크린리더의 전체 검증을 주장하지 않는다.

fixture `mockRecipeId`는 기존 값이 UUID가 아니어서 엄격한 Meal API가 422로 거부했다.
API 검증은 변경하지 않고 임시 QA 복사본에서만 이미 정의된 `dbSmokeRecipeId`를
사용해 추가 성공을 확인했다. 원본 fixture·운영 데이터는 변경하지 않았다.
개발용 QA toolbar는 임시 화면에서 제외했고 QA에서만 뜨는 YouTube 로그인 안내는
보이는 닫기 버튼으로 닫았다.

캡처: `ui/designs/evidence/planner-interaction-restoration/`.

## 보조 리뷰에서 수정한 문제

1. 갱신/오류로 추가 화면이 사라져도 body scroll·inert가 남음 → 표시 조건과 boundary 일치.
2. 주간 로딩 실패 후 swipe lock이 남음 → 요청 성공·실패 모두 중앙 복귀와 해제.
3. 추가 메뉴와 picker 왕복 시 초점 소실 → 화면 전환 후 실제 첫 조작 요소로 이동.
4. 추가를 취소해도 옛 복귀 정보가 남음 → 실제 외부 이동·추가 성공 때만 저장.
5. Next 기본 query scroll이 날짜 카드 이동을 취소 → 즉시/대기 navigation 모두 scroll:false.
6. 복원된 장보기 상세 링크의 경로 누락 → 기존 `/shopping/lists/[list_id]`로 정렬.

실패 테스트를 먼저 확인한 뒤 수정했다. 보조 리뷰의 앞선 4건은 재검토에서 닫혔고
추가 확정 P0/P1/P2는 없었다. 이는 별도 task의 정식 Stage 5/6 승인이나 배포 승인이 아니다.

## 남은 검증 경계

- 실제 계정에서 레시피 가져오기부터 요리 완료·식사 기록까지 한 번에 수행한
  운영 브라우저 E2E 및 capability 활성 여부는 이번 결과에 포함하지 않는다.
- 이번 DB 25건에는 중량 없는 배치 섭취 거부와 배치 기록 삭제 후 잔량 복구의
  직접 수치 사례가 없다. 해당 가드/UI·SQL 구조 검증과 구분한다.
- 인증 만료 후 로그인해 추가 메뉴까지 복구하는 전체 흐름은 미검증이다.
- 기존 끼니 상세의 계획 영양 및 완제품 추가 메뉴 잔존은 이번 조작 복원에서
  변경하지 않았다. 통합 기능 정합성의 후속 확인 항목이다.
- 커밋·PR·merge·운영 배포·기능 활성화는 수행하지 않았다.
