# community-prepared-food-catalog Stage 4 실제 브라우저 검증

- 검증일: 2026-07-18
- 환경: local Supabase + `HOMECOOK_ENABLE_QA_FIXTURES=0` 실제 route/DB
- 브라우저: 사용자가 열어 둔 Chrome의 실제 로그인 세션
- 외부 write: production/staging/provider 0건
- 원상복구: 사용자가 테스트 계정과 데이터는 복구하지 않아도 된다고 승인함

## 자동 검증

- 명령: `pnpm exec playwright test tests/e2e/slice-community-prepared-food-catalog.spec.ts --project=mobile-chrome`
- 결과: 9 passed, 0 failed
- 범위: source filter/badge, g/mL 기본 100과 step 1, relation 없는 serving/package 추정 금지, 공동 등록, owner 수정·삭제, 신고, `401` return-to-action, 오류 재시도, dialog keyboard/focus, 320/390/1280 overflow와 44px target, 선택 직후 sticky 수량/추가 CTA 노출, PLANNER_WEEK anchor 회귀

## 실제 사용자 흐름

1. 사용자 A가 `익명 보존 QA 오트밀 20260718`을 사용자 등록 완제품으로 만들었다.
   - 기준: 100g
   - 열량: 380 kcal
2. 사용자 B가 같은 제품을 검색했다.
   - `사용자 등록` badge와 신고 action을 확인했다.
   - 다른 사용자의 제품에는 수정·삭제 action이 없었다.
3. 사용자 B가 아침 식단에 123g을 추가했다.
   - 열량 467.4 kcal, 탄수화물 82.4g, 단백질 16g, 지방 8.6g, 나트륨 6.2mg으로 표시됐다.
4. 사용자 A가 제품 영양을 수정한 뒤에도 이미 저장된 사용자 B의 version pin은 바뀌지 않았다.
5. 사용자 A의 회원 탈퇴를 실제로 실행했다.
   - 개인 데이터와 로그인 세션이 삭제되고 홈으로 이동했다.
   - 공개한 사용자 등록 완제품은 `owner_user_id=null`, `visibility=public`, `source_type=manual`로 남았다.
   - 제품 version/profile의 작성자 정보는 비워졌다.
6. 사용자 B로 다시 로그인해 익명화 결과를 확인했다.
   - 같은 제품을 계속 검색할 수 있었다.
   - `사용자 등록` badge와 신고 action만 있고 수정·삭제 action은 없었다.
   - 기존 123g 식단과 467.4 kcal pin이 그대로 남았다.
7. authority 수리 뒤 실제 Chrome을 320×568 viewport로 다시 확인했다.
   - 결과가 있는 목록의 상시 신규 등록 CTA는 0개였다.
   - 선택 직후 수량 input은 높이 44px, 추가 CTA는 높이 48px였다.
   - 추가 CTA의 아래쪽 좌표는 486px로 568px viewport 안에 처음부터 보였다.

## 로컬 데이터 오류와 안전한 처리

첫 탈퇴 시도는 영양 source의 `reviewed_by` 외래키 때문에 500으로 실패했다. 조사 결과 제품 코드 문제가 아니라, 내부 운영자 전용 영양 검수 작업에서 일반 테스트 사용자 ID가 검수자로 잘못 재사용된 로컬 데이터 문제였다.

- 공식 DB 계약은 승인 결정에 `reason + reviewed_by + reviewed_at` 전체를 요구한다.
- 이 계약을 약화하거나 `reviewed_by`를 null로 만드는 코드 변경은 하지 않았다.
- 로컬 DB에 이미 존재하던 전용 검수자 중 로그인 계정이 아니며 제품·식단을 소유하지 않는 actor로 잘못된 참조 2,472개만 단일 관리자 transaction에서 재귀속했다.
- 재귀속 후 대상 사용자의 검수 참조는 0, audit triplet 위반은 0이었다.
- 같은 탈퇴 흐름을 다시 실행해 200 응답과 익명 제품/pin 보존을 확인했다.

## 성능과 DB 근거

- 공공 완제품 약 28만 행이 있는 실제 로컬 DB에서 목록 SQL은 약 28ms였다.
- 실제 Chrome route 응답은 인증과 Next.js 처리까지 포함해 대체로 349~559ms였다.
- 공동 catalog 성능 follow-up은 PR #1045로 별도 리뷰와 current-head CI green 후 병합됐다.
- raw provider row, secret, auth query, cookie, private filesystem path는 화면·로그·보고서에 기록하지 않았다.

## 화면 증거

- `ui/designs/evidence/community-prepared-food-catalog/2026-07-18/320/`
- `ui/designs/evidence/community-prepared-food-catalog/2026-07-18/390/`
- `ui/designs/evidence/community-prepared-food-catalog/2026-07-18/1280/`
- `ui/designs/evidence/community-prepared-food-catalog/2026-07-18/playwright-auto/`

주요 실제 DB 증거는 `anonymous-product-readonly-after.png`, `anonymous-product-pin-after.png`, `settings-after.png`, `settings-delete-dialog-after.png`다.

최종 exact viewport 증거는 다음 파일 묶음이다.

- 선택 수량/추가 CTA: `food-product-selected-{320,390,1280}.png`
- 열린 계정 삭제 dialog: `settings-delete-dialog-{320,390,1280}.png`
- current-slice PLANNER_WEEK 최초 진입: `planner-week-after-{320,390,1280}.png`
- current-slice PLANNER_WEEK 완제품 행 스크롤 상태: `planner-week-row-after-{320,390}.png`

각 묶음은 320×568, 390×844, 1280×900의 CSS pixel 크기로 저장됐고 page-level horizontal overflow가 없었다. PLANNER_WEEK 최초 진입 캡처는 `scrollY<=1`, 스크롤 캡처는 실제 완제품 행이 header와 bottom navigation 사이에 보이는 geometry를 자동 검사한다. PLANNER_WEEK 변경 전 기준은 `ui/designs/evidence/prepared-food-planner-entry/after/PLANNER_WEEK-{320,390,desktop-1280}.png`다.

## 결과

- 실제 DB/browser blocker: 0
- 자동화 실패: 0
- 공식 계약 임의 변경: 0
- 독립 design authority: PASS, blocker 0
- 남은 범위: Stage 6 current-head 검증
