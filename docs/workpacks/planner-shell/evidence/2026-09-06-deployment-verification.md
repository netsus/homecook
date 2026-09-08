# 출시 전 UI 배포 준비 검증

사용자가 누적 플래너 UI 수정과 브랜드 색상 변경 후 배포를 요청했다. `docs/engineering/prelaunch-web-deployment.md`의 검토한 커밋 배포 경로를 사용한다. 이 기록은 정식 Stage authority 승인을 대신하지 않는다.

## 최종 변경과 단순화

- 브랜드 포인트는 `#00A1FF`. 식사 기록 일일 영양 숫자는 실제 폰트 두께 900, 개별 음식 영양 숫자는 800이다. 공용 typography 클래스의 두께 재정의를 고려해 명시적 숫자 클래스를 사용했다.
- 기존 주간 UI·준비중 소셜로그인 차단 변경은 앞선 `2026-09-06-weekly-refresh-verification.md`와 관련 날짜별 기록을 따른다.
- 장보기 테스트의 옛 플래너·마이페이지 탭 기대를 요리 계획·프로필 메뉴 이동으로 갱신했다. 식사 문구 제거 검사는 화면 본문에 한정해 새 식사 기록 탭을 잘못 실패 처리하지 않는다.
- 배포 검증은 canonical `/beta?ad_variant=a`를 직접 요청한다. 예상 밖 redirect 거부, timeout, 빌드 manifest 해시·정적 파일 검증은 유지한다.

## 배포 전 검증

- `pnpm test:product`: 261개 파일, 3,078개 테스트 통과. 환경 의존 14개 파일·177개 테스트 생략. `/tmp/deploy-product-tests-green.log`.
- 배포 도구 HTTP 회귀 포함 54개 테스트 통과. 최종 auth·landing·배포 범위 독립 리뷰 147개 테스트 통과, 신규 P1/P2 발견 없음. `/tmp/deploy-final-review-tests.log`.
- 전체 ESLint·TypeScript·문서 기준 정합성·diff 검사 통과.
- 앞선 브라우저 320/375/1280px 검사 21개 통과와 WebKit 모바일 검증 기록은 주간 UI 보고서에 보존했다.

## 배포 조건과 남은 한계

- 기존 서버 환경을 보존하고 로컬 미리보기용 설정·더미 DB 인증은 포함하지 않는다. 이메일 접수 비활성 상태를 유지하며 `NEXT_PUBLIC_PRELAUNCH_UI=false`로 준비중 보호를 끄지 않는다.
- 운영 데이터 초기화·DB migration·worker·네트워크 변경은 포함하지 않는다.
- 실제 배포 완료는 서버의 새 빌드와 공개 사이트 확인 이후 별도로 기록한다. 이번 테스트 결과만으로 배포 완료나 실제 계정 전체 저장 흐름 성공을 주장하지 않는다.

## 실제 배포 완료

- 배포 SHA: `990064ce8fd7d7d84b1095fe0f22830bc231732c`.
- 빌드 ID: `prelaunch-990064ce8fd7-HDIpLO`.
- 배포 브랜치: `fix/prelaunch-planner-release-20260906`. 검증한 통합본 `cb974066`과 앱·컴포넌트·라이브러리·상태·타입·공개 에셋·package/lockfile가 동일하다. 이 별도 배포 브랜치에서만 무관한 개발 도구 2개를 기존 서버 버전으로 보존해 웹 배포 범위를 유지했다.
- 기존 서버 전용 `9f429bea`의 성장정보 조회 복구를 통합 보존했다. 기존 DB의 전용 RPC 존재와 service_role 실행 권한을 읽기 전용으로 확인했다. SQL 원본은 기존 서버의 별도 migration 커밋에 보존되어 있으며, 이번 배포가 새 DB의 스키마 재구축을 보장하지는 않는다.
- 배포 도구의 Git 파일목록은 NUL 구분으로 읽도록 수정해 한글·공백·개행 경로를 정확히 분류한다. 실제 Git 회귀 포함 55개 테스트 통과. 허용 목록은 완화하지 않았다.
- 서버 plan: web 48, API 4, DB 0, support 399. 자체 제품 테스트 3,078개 통과 후 production build, 임시 포트·manifest·정적 파일 확인, 웹 교체 모두 성공했다.
- 서버 최종 상태: loaded=true, rollbackAvailable=true, recoveryPending=false. 기존 환경파일 전체 해시와 LaunchAgent 환경 키별 해시가 배포 전후 일치했다. 이메일 접수는 0, 준비중 보호는 기본 true를 유지한다. DB·worker·네트워크 변경은 없다.

## 공개 사이트 후검증

- 실제 비로그인 브라우저 375/1280px: 7일 식사 기록, 일일 영양 4개 타일, 숫자 색상 `rgb(0,161,255)`와 두께 900, 요리계획 전체 kcal, 상단 준비 배너, 가로 넘침 없음 확인.
- 로그인 안내 페이지와 소셜 버튼 숨김 확인. 같은 출처의 로그인 시작 POST는 `503 AUTH_FLOW_UNAVAILABLE`로 차단했다.
- 랜딩 a/b/c 모두 실제 초기화 후 hero 화면 표시·HTTP 200. `/beta`와 d는 307로 a에 정규화된다. 이메일 신청은 제출하지 않았다.
- 공개 빌드 manifest는 Cloudflare를 경유한 응답과 서버 파일 해시가 일치했다.
- 최초 배너 검사에서는 부드러운 스크롤이 끝나기 전에 위치를 측정했다. 즉시 최상단 이동으로 검사 타이밍을 바로잡은 뒤 두 크기 모두 통과했다. 제품 코드 수정은 필요하지 않았다.
- 공개 브라우저 결과: `ui/designs/evidence/prelaunch-planner-ui/deployed/public-smoke.json` 및 같은 폴더 스크린샷.
- 서버 비공개 증거: `/Users/cwj/.homecook/prelaunch-web/rehearsals/planner-release-990064ce-92f7dc44-1adc-4c5c-8d99-4c339520c59b/result.json`.

실제 회원의 기록 추가·수정·삭제와 물리 iPhone 기기 검증은 이번 공개 후검증 범위에 포함하지 않는다. 운영 공개 접속과 준비중 보호를 확인했으며 정식 출시 또는 이메일 접수 활성화를 의미하지 않는다.
