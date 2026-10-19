# 마이페이지 장보기 상세 선택 복원 — 2026-10-20

## 범위와 원인

기준 소스는 `ae7e4ab102cdec7b6035c4d8cb366a1276095b58`이다. 별도 `codex/mypage-shopping-selection-restore-20261020` 작업트리에서 수정하며 기존 checkout과 병행 dirty 변경을 보존한다. 아직 커밋·원격 반영·배포하지 않았다.

기존 `openShoppingDetail`은 URL에 `shoppingListId`를 넣지만 선택은 전체 history item React state에만 보관했다. mount effect는 tab만 복원했고 popstate는 ID가 없을 때 닫기만 처리했다. 따라서 새 mount/직접 진입/forward에서 ID가 URL에 남아도 선택이 사라졌다. URL 동기화는 역사적 `b6a8653d7876e784c871ca10f282380e232afa0e`에 이미 있으며, 조사한 `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`와 `3ebbf2871`의 이 컴포넌트 blob은 같았다. 최근 Anti Slop 타입 정리의 회귀로 귀속하지 않는다.

## 수정 계약

- 선택 상태를 상세 컴포넌트가 실제 사용하는 `string | null` ID로 좁힌다. 첫 history page 조회로 대상을 찾거나 별도 저장소를 만들지 않는다.
- 초기 React state는 브라우저 URL을 읽지 않는다. 기존 mount effect와 popstate가 shopping tab의 ID를 읽으며 빈 문자열은 null로 정규화한다.
- 상세 직접 진입 동안 최초 history auto-load는 생략한다. 닫으면 기존 effect가 목록을 읽고, 상세 완료의 명시적 history refresh는 유지한다.
- close/장보기 탭 재선택/다른 탭 이동은 URL의 선택 ID를 제거한다. URL 변경은 기존 query/hash/history.state를 보존하고 상세를 열 때 overview → detail back entry를 유지한다.
- 데스크톱과 모바일 직접 URL 모두 기존 `ShoppingDetailScreen`을 재사용한다. 모바일 기록 카드의 standalone 링크, API/권한/소유권/read-only/상태 전이는 변경하지 않는다.

## 검증 기록

- 제품 변경 전 신규 direct URL(첫 페이지 밖 ID)·fresh mount 회귀: 2 FAIL / 76 이름필터 SKIP. 모두 `shopping-detail-embedded` 부재로 실패했다.
- Vitest 첫 명령은 기존 사용자 캐시 임시 디렉터리 생성 EPERM으로 시작하지 못했고 허용된 escalation 실행으로 위 RED를 얻었다. 실행 환경 오류를 제품 실패로 세지 않는다.
- 최초 보완 후 기존 열기·완료 read-only 포함 선택 4 PASS. 추가 전체 실행은 85 PASS / 1 FAIL였으며 새 unauthorized fixture의 mock 이름 오타를 정정했다.
- 모바일 직접 URL의 별도 RED: 1 FAIL / 87 이름필터 SKIP. 모바일 분기 보완 후 실제 DOM은 `shopping-detail-mobile`이므로 새 fixture의 desktop test-id/닫기 버튼 기대를 모바일 UI와 맞췄다. 후속 전체 실행의 89 PASS / 1 FAIL은 이 fixture 기대 오류였다.
- 확장 13 suite 첫 실행은 160 PASS / 37 FAIL이었다. 1건은 새 모바일 fixture의 닫기 후 전체 제목 기대와 실제 카드의 분리 표시 차이였고, 카드 test-id/기존 standalone href로 정확히 검사하도록 정정했다. 나머지 36건은 수정하지 않은 `shopping-detail.frontend` fixture의 `next/navigation.usePathname` mock 누락이었다. 부모가 UI 미수정 `ae7e4ab10`에서 해당 suite의 6 PASS / 36 FAIL과 같은 원인을 독립 재현했다. 정확한 상세 pathname export 한 줄만 보완했고 기존 권한/read-only/완료 기대값은 바꾸지 않았다.
- lint 첫 실행은 기존 `handlePlannerAddSubmit`의 미사용 `showToast` 의존성 1 warning으로 `--max-warnings 0`을 통과하지 못했다. 원래 HEAD에도 같은 의존성이 있었다. 부모 승인으로 사용하지 않는 의존성 한 줄만 제거했고 플래너 실행 본문·입력·권한은 그대로다.

### 최종 로컬 결과

- 관련 전체 13 suite **197 PASS / 0 SKIP / 0 FAIL**. `mypage-screen` 90건(기존 76 + 신규 14), `shopping-detail.frontend` 42건을 포함한다.
- 변경된 제품/두 테스트 파일 ESLint `--max-warnings 0`, `git diff --check` 통과.
- 전체 비증분 `tsc --noEmit --incremental false`는 모바일 복원 포함 구현 후 통과했고 최종 불필요 의존성 한 줄 제거 후 재실행도 exit 0이다.
- `pnpm run verify:anti-slop`: fixture 음성 검사·도구 타입·현재 116 / baseline 207 / 신규 0 통과. 이 작업의 진단 감소로 계상하지 않는다. 검사 설정·규칙·baseline은 변경하지 않았다.
- 고정 제품 SHA-256: `6373c78ede382c78cd5fc92365ba359d37da01dedc3a11fcf79bec8e42afe891`.

실행 명령:

```sh
corepack pnpm exec vitest run tests/mypage-page.test.ts tests/mypage-desktop-scroll.test.ts tests/return-context.test.ts tests/mypage-growth-profile.test.tsx tests/mypage-progress-card.test.tsx tests/shopping-detail.frontend.test.tsx tests/mypage-achievement-album.test.tsx tests/mypage-recipebook-create-style.test.ts tests/mypage-screen.test.tsx tests/mypage.backend.test.ts tests/mypage-linked-auth-providers.test.tsx tests/shopping-history-calendar.test.ts tests/mypage-gamification-card.test.tsx
corepack pnpm exec tsc --noEmit --incremental false
corepack pnpm exec eslint components/mypage/mypage-screen.tsx tests/mypage-screen.test.tsx tests/shopping-detail.frontend.test.tsx --max-warnings 0
corepack pnpm run verify:anti-slop
git diff --check
```

검증 대상은 mount/reload, first-page 밖 ID, back/forward 및 다른 tab popstate, 명시 닫기/탭 재선택/탭 변경 후 재마운트, query/hash/history state 보존, 빈 ID, SSR 초기 HTML, 기존 상세 401 redirect/404·500 error/read-only, 모바일 직접 진입과 닫기다.

### Root 격리 브라우저·최종 소스 확인

root도 고정 제품 SHA256 `6373c78e…afe891`의 관련13suite197 PASS·전체 비증분 타입·제품/세 테스트 ESLint max-warnings0·verify Anti116/new0·diff를 재실행했다. author-free reviewer도 같은197 PASS/타입/lint/Anti와 제품·SQL/API 비변경·탐색 보존을 독립 확인했다. 최종 UI 소스의 실행 동작 변경은 위 선택 복원이고 좋아요 타입 정리와 파일 충돌은 없다.

새 `tests/e2e/mypage-shopping-selection-restore.spec.ts`를 운영3100과 다른 **127.0.0.1:35417**의 QA fixture 서버에서 실행했다. 실제 인증 토큰/브라우저 프로필/운영 데이터를 쓰지 않으며 미등록 API는503으로 막고 예상외 요청0을 검사한다.

- 최초375px에서 목록만 보이는 실패 screenshot을 확보했다. 구현 중1440px의 원문 `두부 1모` 단일 텍스트 기대는 기존 UI가 이름/수량을 나누는 사실과 달라 테스트만 `두부`와`1모` 각각 검사하도록 교정했다.
- 데스크톱만 복원된 초안의375px 실패로 모바일 전용 렌더 분기를 별도 확인했고, 기존 상세의 모바일 레이아웃을 재사용했다. 모바일 카드 클릭은 원래 standalone URL로, 직접 mypage URL은 복원된 상세로 가는 두 경로를 구분한다.
- 첫 탐색2 PASS 후 raw console의 fixture503을 발견했다. 누락된 planner 통계 GET/빈 action-notifications polling 응답만 기존 정상 계약으로 채우고 예상외 API/console error0을 추가 강제했다. planner만 보완한 중간 실행2FAIL은 남은 action-notifications fixture 누락을 드러냈다. 제품을 바꾸거나 콘솔을 숨기지 않았다.
- 최종 고정 소스·완성된 fixture의375px/1440px **2 PASS(exit0)**. screenshot 전 networkidle을 기다린 동일 최종 경로도 **2 PASS(11.8초)**다. 직접 URL/첫 페이지 밖 ID/reload/명시닫기 후 reload/뒤·앞으로/기존 모바일 카드 경로/read-only를 확인했다. 가로 넘침0, pageErrors0, failedRequests0, consoleErrors0, 예상외 API0, 장보기 write0이다.
- full-page와 상세영역 screenshot 각2개 및 raw console/page-error/request 로그는 `.artifacts/playwright-review/mypage-shopping-selection-settled/`에 보존했다. root가 네 screenshot을 읽어 선택한 상세·read-only 안내·이름/수량·뒤로/목록 제어·모바일 하단 메뉴가 보이고 잘림이 없음을 확인했다. 이전 실패와 중간 성공 artifact는 다른 폴더로 보존했다. pixel-perfect golden 비교나 전체 시각 회귀를 수행했다는 뜻은 아니다.

운영 QA·새 인증 데이터 생성·운영 DB 조회/쓰기·배포는 이 후보 검증에서 실행하지 않았다. RTL/jsdom과 격리 로컬 브라우저를 실제 운영 인증 검증으로 부르지 않는다. 부모의 이전50bc QA 종료 인계 후 다음 순차 앱 배포가 가능하지만 이 후보의 실제 ref/build·배포 후 인증 결과는 별도 확인해야 한다. 기존 권한3건·보류 `444fe1f6f`·과거 실패를 해결했다고 주장하지 않는다.
