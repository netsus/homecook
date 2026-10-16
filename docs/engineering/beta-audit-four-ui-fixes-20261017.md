# 베타 감사 후 UI 4건 수정 — 후보와 운영 확인 기록

## 2026-10-17 운영 재검증과 F01 조회 보완

사용자 묶음 반영 요청으로 PR [#1731](https://github.com/netsus/homecook/pull/1731)이 master `96fb4cb5f48083b765dc9e21b3a8231712d17509`에 머지됐고 공식 `homecook-deploy` 경로로 웹 build `prelaunch-96fb4cb5f480-MG8UqZ`가 반영됐다. 배포 선택 검사 1451 PASS / 133 SKIP 및 typecheck/build 성공. DB232와 추출 worker `3e58467499c63ba20c3b3191d9dd7dec77a7aa44`(v74/verifier47, gen49)는 유지했다.

운영 Chrome 375px에서 장보기 메뉴 `보기`, 단일 하단 탭을 확인했으나 **F01 원분수 표시는 여전히 실패했다.** 실제 레시피북 상세 GET의 재료 SELECT가 `quantity_input`을 누락했다. 앞선 후보 화면 fixture에는 metadata가 들어 있어 이 연결 누락을 검출하지 못했다. 아래 로컬 후보 확인 기록을 운영 성공 근거로 읽으면 안 된다.

이번 후속 보완은 레시피북 조회에 원수량·출처·제품/영양 버전 필드를 포함하고 기존 authenticated `readRecipeProductLabels`와 수량 snapshot 검증을 적용한다. 제품 표시명 누락도 같은 projection 경로에서 회복한다. 계정·북 소유권·멤버십·YouTube 특수 경로는 유지하고, 보이지 않는 제품과 잘못된 수량 근거는 기존 API 오류 래퍼로 차단한다. DB/권한/worker 변경은 없다. 실제 SELECT 열만 반환하는 회귀 fixture에서 수정 전 4 FAIL / 3 PASS, 수정 후 7 PASS 및 관련 기존 12검사 PASS. **이 후속 보완의 운영 성공 여부는 재배포 후 실제 Chrome으로 별도 확인해야 한다.**

## 최초 로컬 후보 기록

기준 master `67e6d0c2be2eeef3831b45855755d9dada4925f4`. 운영 웹은 감사 때와 같은 `3e58467499c63ba20c3b3191d9dd7dec77a7aa44` / build `prelaunch-3e58467499c6-zl8qD7`, DB232다. 이번 변경은 미배포이며 기존 감사 Library `libfile_0d907661feb081918ef1f45b9dc0f176`의 확인 결함 4건만 다룬다.

| 결함 | 수정 | 보호 범위 |
|---|---|---|
| 레시피북 원분수 요약 반올림 | 수량 metadata가 있으면 기준 인분의 원문을 표시하고 환산/변환 시 기존 3자리 표시 formatter 사용 | 저장 원문·수치·영양 계산·제품/영양 버전 불변, 과거 metadata 없는 표시 유지 |
| 빠른 편집의 계정 초기화 경합 | 초안 소유자 최초 읽기 완료 전 수량 재확인 버튼 loading/disabled | 계정·세대 검증과 명시적 재확인 유지, 자동 읽기/저장 없음, 실제 최초 읽기 실패는 계속 차단 |
| 장보기 메뉴의 허위 0회 | 미조회/일부 목록 길이를 건수로 쓰지 않고 `보기` 표시 | 상단 누적 planner 상태 통계와 장보기 목록 건수를 같은 것으로 취급하지 않음, API 불변 |
| 하단 탐색 DOM 중복 | AppShell 공통 탭을 유지하고 상세 ready/skeleton의 내부 탭 제거 | loading/ready/empty/error/guest 모두 탭1개·링크5개, desktop WebTopNav 유지 |

## 확인

- 주작업 표적 6파일113검사 PASS, 조회 projection 표적1파일 추가 PASS. 독립 diff 리뷰 승인과 별도3파일12검사 PASS. 같은 검사가 수정 전 코드에서9개 실패하여 네 원인을 검출했다. 초기 테스트 fixture의 필수 필드/접근성 이름/React 테스트 환경 오류는 교정 후 최종 검사에 포함했다.
- TypeScript `--noEmit` 성공. 변경 파일 ESLint 오류0, recipebook의 기존 `showToast` 의존성 경고1개 유지. `git diff --check` 성공. 전체 테스트/운영 빌드는 실행하지 않았다.
- 사용자 Mac Chrome에서 후보 localhost의 실제 화면 코드를 QA 응답으로 확인했다. 375×900 원분수·장보기 진입/복귀·계정 읽기20초 지연·명시적 재확인·밀도 없는 g 거부·L→mL·취소, ready/empty/error/guest의 단일 하단 탐색, 1440×1000 북/편집/3인분 환산·원문·탐색을 확인했다.
- 후보는 격리된 모형 API이며 운영 DB/인증 자격증명과 연결하지 않았다. 실제 운영의 개선 성공, OAuth/DB 권한/요청 복구 전체를 이번 후보 확인으로 주장하지 않는다. 새 운영 QA 기록/추출/외부 AI 호출0이다.

## 운영 반영과 남은 경계

사용자 묶음 반영 시 `docs/engineering/prelaunch-web-deployment.md`의 `pnpm deploy:dev` 경로를 사용한다. 영향은 네 UI/표시 파일의 웹 재빌드/교체다. DB migration·인증/권한·worker 정책·gen49/자격증명 변경은 필요하지 않으며 실행하지 않았다. 기존 배포 권위가 새 웹 commit을 허용하는지는 반영 시 별도 확인하고 보호를 우회하지 않는다. 운영 반영 후 원 QA 레시피북/첫 편집/마이페이지/상태별 탐색을 다시 확인해야 한다.

날짜 문맥·회사 배지 후보, 보류한 최근 단위 기억/C05, 무게 추정 확대, 네이버 가입, 추출기 로컬 커밋 `93de94d970a90ce1d28d0de72283b9e924c0ba19`는 포함하지 않았다.
