# 2026-09-28 실사용 후속 수정 — 미배포

사용자 요청: 오류와 개선을 같은 작업 브랜치에 모으고 배포하지 않는다.
브랜치: `codex/mumeok-feedback-batch-20260928`. 운영 웹/DB 변경, 머지, 배포는 하지 않았다.

## 수정 범위

| 번호 | 요청과 적용 |
|---|---|
| 1 | 중복 전역 `app/loading.tsx` 삭제. 계획 고정 레시피도 문구 패널 대신 스켈레톤. 느린 전송/서버 실패와 확정 세션 거절의 기존 503/409 구분을 회귀 확인. |
| 2 | 딸기우유푸딩의 구성별 동일 재료를 보존하면서 영양 계산 행 ID의 `:row:`를 `-row-`로 변경. DB missing_reasons validator에 맞춰 저장. |
| 3 | 완료 후 제목 아래 한 줄, 식사 기록하기 버튼 하나. 서버 성공 응답에만 요리명/인분과 실제 팬트리 차감 결과 토스트. 같은 세션의 재확인 응답은 중복 알림하지 않음. |
| 4 | 끼니 상세 추가 행동은 헤더 우측 +. 하단/빈 상태의 중복 추가 버튼 삭제. |
| 5 | 모바일 요리 및 장보기 생성 대기 중 문서 스크롤 잠금과 진입 위치 초기화. 요리 내용 스크롤은 유지하며 다른 화면 진입 시 잠금 해제. |
| 6 | 재료 선택 중복 검색 제목 숨김. 키보드가 열린 동안 선택 목록·추가 footer를 숨기고 키보드를 닫으면 기존 선택 복원. |
| 7 | IME 조합 중 dirty→clean→dirty 변화로 history.back이 실행되던 효과 정리. 실제 뒤로가기/이탈 때만 최신 변경 상태를 검사. |
| 8 | 자동·수동 선택 조리법을 설명창 색상 테두리/왼쪽 표시와 선택 이름으로 표시. 입력 중 강제 스크롤 없음. |
| 9 | 직접 등록 공개 준비의 내부 영양 근거 조회를 기존 제한된 내부 reader로 변경. 레시피/수량 소유권 조회는 사용자 client 유지. 상단 안내는 ‘공개 레시피로 저장돼요.’ 한 줄. |
| 10 | 식사 기록의 빈 끼니 카드와 헤더 구분선 제거. 음식이 있는 행의 구분은 유지. |
| 11 | 남은 요리에서 기존 계획 생성 화면 삭제. 기존 먹은 음식 추가 sheet로 실제 batch를 선택하고 식사 기록 저장 API 사용. 날짜/끼니/먹은 양을 확인하며 같은 저장 요청의 키를 재사용. |
| 12 | 식사 기록 제품·재료 검색창을 결과 스크롤 영역 밖에 두고 실제 보이는 viewport 높이/위치 반영, 글자 16px. 대기 스켈레톤과 검색 결과 없음 안내 구분. |
| 13 | 소진/다 먹음 음식은 목록과 최근 후보에서 제외. 성공한 소진/섭취/복원 응답 뒤 열린 선택을 무효화하고 재조회. 오래된 응답이 삭제한 항목을 되살리지 않도록 요청 세대 검사. |

## 저장 실패 원인과 권한

- 개인 복제: 서로 다른 구성에서 같은 재료를 사용하면 계산 행 ID를 구분해야 한다. 이전 구분자 `:row:`가 DB 영양 snapshot의 허용 문자와 맞지 않았다. 원본 재료 ID·구성·수량은 바꾸지 않고 계산용 ID만 수정했다.
- 직접 등록: `ingredient_nutrition_profiles` 등 내부 근거 테이블은 RLS가 켜져 있고 authenticated 조회 정책이 없어 일반 사용자 조회가 빈 배열을 반환한다. 운영 읽기 전용 진단에서 승인 활성 profile 1,598개와 authenticated 가시 행 0개를 확인했다. DB의 실제 guard와 REST 내부 reader로 만든 guard는 일치했다. 기존 내부 `recipe-future-propagation` reader를 영양 근거에만 사용하며 개인 레시피 소유권과 최종 DB guard는 유지한다.
- 신규 SQL은 최근 음식 후보 필터 한 개다. 운영에는 적용하지 않았다. 기존 완료 음식/식사 기록은 삭제하지 않는다.

## 주요 변경 파일

- `lib/server/recipe-content-snapshot-future-propagation.ts`, `recipe-nutrition-service.ts`, 레시피 등록/공개 route: 저장 복구.
- `components/recipe/manual-recipe-create-screen.tsx`, `personal-recipe-editor-shell.tsx`, 재료 picker: 입력/선택/설명.
- `components/cooking/snapshot-v2-cook-mode-{screen,view}.tsx`, 공통 모바일 fullscreen hook, `app/globals.css`: 완료 결과와 스크롤.
- `components/planner/meal-screen.tsx`, `meal-log-{screen,add-sheet}.tsx`, `components/leftovers/leftovers-screen.tsx`: 추가 위치·식사 기록 흐름.
- `lib/cooked-batch-events.ts`, cooking/leftovers/meal-log API client: 성공 후 목록 무효화.
- `supabase/migrations/20260928010000_meal_log_recent_available_batches.sql`: 최근 소진 후보 제외.

## 검증 및 한계

- 관련 12개 테스트 파일 162개 통과 후, 오래된 응답 차단 회귀 한 건을 추가했다. 해당 식사 기록/남은 요리/공개 준비 3개 파일 58개 통과.
- 직접 등록 IME·초안 이탈·저장/재개 5개, 끼니 헤더/추가 연결 3개 선택 검사 통과.
- 격리 PostgreSQL에서 실제 딸기우유푸딩 12행 payload가 기존 validator를 통과하고 이전 ID 형식은 거절됨을 확인. 최근 후보 함수에 새 migration 적용 후 정상 1개만 반환, 옛 eaten/새 depleted 제외 확인. 임시 DB는 종료·삭제, 운영 쓰기 없음.
- 데스크톱/모바일 브라우저 fixture 검사 8개 통과. 375px 직접 등록의 한글 조합/자동 선택 색상/하단 만들기 버튼, 완료 화면의 단일 행동, 제품 검색을 확인. 모바일 외부 scrollY=0·화면 높이·이탈 후 잠금 해제 추가 검사 통과.
- 타입 검사 통과. 변경 파일 ESLint 확인.
- 예전 전체 직접 등록 테스트는 현재 이미지 UI와 맞지 않는 기존 26개 실패가 있다. 이번 변경을 검증하는 선택 검사와 구별하며 전체 suite 통과를 주장하지 않는다. 이번 수정의 실제 iPhone 키보드/커서 동작 및 운영 로그인 저장은 미배포 상태이므로 아직 재확인하지 않았다.
- 운영 웹 빌드·배포·백업/복원은 이번 작업 범위에 포함하지 않았다. 후속 묶음 반영 때 신규 SQL과 웹을 함께 적용해야 최근 후보 필터까지 동작한다.
