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
