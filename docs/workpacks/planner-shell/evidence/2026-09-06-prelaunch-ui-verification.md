# 출시 전 UI 정리 결과 — 2026-09-06

## 완료한 사용자 요청

| 항목 | 반영 결과 |
| --- | --- |
| 1. YouTube 준비 안내 | 신규 추출 진입/시트에 준비 안내. 기존 추출 결과 조회·저장·종료는 보존 |
| 2. 비로그인 플래너 | 개인 API를 호출하지 않는 공개 예시. 추가/수정/삭제는 로그인 모달 |
| 3. 반복 튜토리얼 | 준비 기간 안내 토스트 억제. `/beta` 및 하위 경로는 앱 알림 subtree 제외 |
| 4. 준비 배너 | 앱 준비 안내. Planner에서는 스크롤해도 표시하고 고정 헤더와 겹치지 않게 실측 |
| 5. 메뉴 중복 버튼 | 주간 음식 카드의 장보기/요리하기/상세 줄 제거. 음식 카드 자체 상세 진입은 유지 |
| 6. 데스크톱 | 왼쪽 작은 활성 탭, 버튼 모양의 이번 주, 사이드바 3색 요약, 왼쪽 중복 요약 숨김 |
| 7. 모바일 | 사용자 두 번째 이미지 기준의 날짜 한 박스, 오늘 파랑/흰 글씨, 굵은 음식명·kcal·단백질, 오른쪽 작은 파란 + |
| 8. 식사 기록 | 날짜 카드의 4개 영양 타일, 실제 양, 펼침 탄단지 그래프/서버 총칼로리, g 입력 보호 |
| 9. 계획 영양 | 개별 계획에 고정된 snapshot·계획 인분을 일괄 읽어 RSC props로 카드/모바일·데스크톱 끼니 상세에 표시 |

## 변경 파일과 단순화

- `components/planner/planner-week-screen.tsx`, `planner-week-board.tsx`,
  `planner-week-navigation.tsx`, `planner-shell-segments.tsx`: 기존 주간 이동과
  추가 흐름을 유지하며 중복 카드 동작을 제거했다.
- `components/planner/planner-login-dialog.tsx`, `lib/planner/guest-planner-preview.ts`,
  `stores/planner-store.ts`: 공개 예시를 개인 store와 분리하고 오래된 응답을 폐기한다.
- `components/planner/meal-log-screen.tsx`, `meal-log-nutrition-chart.tsx`,
  `meal-log-add-sheet.tsx`: 기존 day/entry 값을 표시하며 상세 정보와 관리 동작은 펼침으로 정리했다.
- `components/planner/meal-screen.tsx`, `meal-pinned-nutrition.tsx`,
  `lib/server/planner-nutrition-summary.ts`, `planner-meal-nutrition-view.ts`,
  `types/planner-meal-nutrition.ts`, 두 Planner page: 기존 고정 영양 계산과
  bulk reader를 재사용했다. 현재 recipe를 항목별로 다시 조회하지 않는다.
- `lib/prelaunch.ts`, `components/shared/prelaunch-notice.tsx`, `app/layout.tsx`,
  YouTube 진입 페이지·화면·시트, `growth-toast-stack.tsx`: 준비 모드를 공통화했다.
- 관련 테스트와 공식 요구사항/화면/Flow/SOT 및 기존 workpack addendum을 갱신했다.

공개 API/DTO 형식, DB schema, RPC, 권한과 도메인 상태 전이는 변경하지 않았다.
신규 패키지를 추가하지 않았다. 실제 식사 기록의 영양 합계는 계속 서버 값이 기준이다.

## 검증 결과

- 최종 통합: 21개 파일 **267/267 통과**.
- 최신 달력/초기 날짜 배치: **37/37 통과**.
- 마지막 표시·공지·일별 그래프 회귀: **26/26 통과**.
- 전체 `pnpm typecheck`, `pnpm lint`, `validate:source-of-truth-sync`, `git diff --check` 통과.
- 개인 환경 파일 없이 격리된 source 복사본에서 Next production build 통과.
  복사본의 pnpm symlink plugin resolution 때문에 build는 `--no-lint`, 전체 lint는
  원본 작업 디렉터리에서 별도로 실행해 통과했다.
- 코드 보조 리뷰에서 게스트 전환 시 프로필 잔존 및 legacy 팝업 잠금 잔존 2건을
  확인했다. 각각 회귀 실패를 확인한 뒤 개인 컴포넌트 unmount로 수정했고 재검토에서 닫혔다.
- SSR reader는 실제 `auth.getUser()` 검증과 소유자 조건, 최대 7일 범위를 유지한다.
  E2E 로그인 힌트는 이 개인 서버 조회의 권한으로 사용하지 않는다.
- 인분이 바뀌면 옛 수치를 숨기고 mutation 성공 후 RSC를 갱신한다.

실행 로그는 `/tmp/prelaunch-all-final.log`, `/tmp/prelaunch-typecheck-final.log`,
`/tmp/prelaunch-lint-final.log`, `/tmp/prelaunch-build-final.log`, `/tmp/prelaunch-sot-final.log`다.

## 브라우저 증거

`ui/designs/evidence/prelaunch-planner-ui/manifest.json`과 인접 캡처를 참고한다.

- 320px 페이지 가로 넘침 없음. 390px 식사 기록에서 세 끼 이름·양·영양이 표시됨.
- 데스크톱 DOM 폭/본문 폭 모두 1280px. 탭 폭 약 227px, 왼쪽 16px.
  중복 요약 `display:none`, 사이드바 3개 색상 점 확인.
- 비로그인 계획 추가 및 식사 기록 수정에서 로그인 모달과 원래 날짜 복귀 URL 확인.
- 펼침 그래프 중앙은 서버 제공 1,607kcal이며 탄단지 열량 비율과 구분한다.
- YouTube 새 추출 진입에서 입력/시작 요청 없이 준비 안내를 확인했다.
- 개인용 입력/서버 데이터 대신 명시된 공개 예시로 로컬 UI를 확인했다.

## 검증 한계와 운영 경계

- 로컬 미리보기의 실제 계정 로그인·저장·추출 워커는 연결하지 않았다.
  공개 예시를 실제 계정 end-to-end 성공으로 보고하지 않는다.
- `/beta`의 앱 팝업 제외는 component 경계 테스트로 확인했다. 격리 미리보기의
  marketing API가 연결되지 않아 정상 Hero부터 전체 랜딩 흐름까지의 브라우저 검증은 하지 못했다.
- 제품/재료의 g 기록은 기존 exact 변환 근거가 있어야 한다. 근거가 없으면
  추정 환산하지 않고 기존 API 오류/정보 준비 상태를 유지한다.
- 개별 계획 영양이 없거나 조회에 실패하면 준비 중으로 표시한다.
  일반 레시피 상세의 현재본을 과거 계획 영양으로 대체하지 않는다.
- 준비 모드 해제는 `NEXT_PUBLIC_PRELAUNCH_UI=false` 후 재빌드다.
- 커밋, PR, merge, 운영 배포, capability 활성화는 수행하지 않았다.
  이 기록은 독립 Stage 5/6 승인 또는 production activation 기록이 아니다.
