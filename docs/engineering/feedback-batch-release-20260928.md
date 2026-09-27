# 2026-09-28 누적 피드백 운영 반영

사용자의 배포 요청에 따라 후속 수정 묶음을 운영에 반영했다. 앞선 2026-09-28 수정 기록의 ‘미배포’는 작업 당시 상태이며 이 기록이 우선한다.

- 통합 앱/SQL 소스: `7dade32ca9f214a70856bb65ccd57c50c991397e`
- 웹: `f8824662e90f268b922962b1c6f3d3934aee1575` → **`8d9dc57efe223b8e14c41db0597b062f954ab18e`**
- 빌드: **`prelaunch-8d9dc57efe22-Hp7VRx`**
- 실제 실행: `/Users/cwj/.homecook/prelaunch-web/releases/8d9dc57efe22-Hp7VRx/checkout`
- DB: **197 → 198**. `20260928010000_meal_log_recent_available_batches.sql` 한 건 반영.
- PR: [#1592](https://github.com/netsus/homecook/pull/1592)

## 수정 묶음

개인 복제/직접 등록 저장, 한글 입력·키보드·스크롤, 완료 후 식사 기록과 남은 요리 단일 목록, 최신 팬트리 재조회, 북의 실제 개수와 최신 요리 세션 진입, 탈퇴 요청 키, 식사 기록 날짜 탐색·상세 삭제·로딩/뒤로가기를 함께 배포했다.

작업 기록:
- [첫 13개 후속](feedback-followup-20260928.md)
- [남은 요리·북·탈퇴](feedback-library-cleanup-20260928.md)
- [식사 기록 탐색·상세](feedback-meal-log-navigation-20260928.md)

## 검증과 실제 반영

- 관련 웹 검사 **764개**, 모바일/데스크톱 브라우저 fixture 흐름 **22개**, 타입 검사 통과. 배포·백업 경계 검사 **34개** 추가 통과. 독립 코드 및 통제 DB 스크립트 검토에서 차단 사항 없음.
- 배포 후보 앱 파일은 통합 소스와 byte 차이0. 배포 도구가 후보에서 같은764개 검사를 다시 통과한 뒤 production 컴파일·타입·정적 페이지 생성·별도 포트·실제 운영 포트의 build manifest/정적 파일 GET을 확인했다.
- 기존과 같은 Next 내장 ESLint의 `eslint-plugin-react-hooks` 해석 경고가 있었다. 컴파일·타입·빌드는 성공했고 별도 변경 파일 ESLint는 통과했다. 내장 ESLint까지 성공했다고 주장하지 않는다.
- DB는 정확한 대상 이미지·volume·system ID, 새 논리 백업, 실제 스키마/역할의 격리197→198→rollback197을 검증했다. 대상 함수 본문만 바뀌고 owner/ACL/search_path 및 나머지 함수·카탈로그는 보존됐다.
- 첫 운영 dry-run에서 원장 소유자 계정 차이로 거절되어 전체 rollback됐다. 이후 기존 운영 방식처럼 함수 DDL은 postgres, 원장 기록·검증은 원장 소유 관리자 계정으로 분리했다. 권한은 추가하지 않았다. 수정된 dry-run/실제 적용 모두 PASS, 원장198·R2/scope/마케팅 보존 확인.
- 실제 로컬 운영 HTTP: 홈200, 공개 레시피 API200, 비로그인 개인 API401, 새 build manifest200 및 파일 해시 일치.
- 외부 HTTPS는 로그인된 실제 Chrome에서 홈 목록·식사 기록·날짜 변경·남은 요리의 새 화면과 데이터 조회를 확인했다. 익명 Python HTTP 요청은 edge403이므로 외부 명령행 검사를200으로 기록하지 않는다.
- `deploy:dev:status`: 새 버전 loaded=true, recoveryPending=false, rollbackAvailable=true. 표시되는 DB changed=false는 웹 도구의 already-applied 모드 결과이며, 별도 통제 절차의 SQL1건 반영을 의미하지 않는 값이다.

## 백업·복원 보완

기존 전체 플랫폼 증거가24시간을 넘었고, 최신 스키마의 `private.manual_recipe_publication_images`가 백업 분류에서 누락돼 정상 보호에 의해 중단됐다. 영속 공개 이미지 저널 하나만 포함 목록에 추가했으며 임의 private 테이블은 계속 거부한다.

신규 암호화 백업, 서로 다른 외장 매체의 인증 사본, 실제 격리 복원/키 복구, 새 readiness를 확인했다. 기존 config의 `FULL_LOCAL_BACKUP_READINESS_PATH`와 resume inventory의 config 해시만 갱신했다. launch 설정·서비스 ID·데이터를 보존했고 격리 자원은 정리했다.

- 새 논리 dump SHA256: `e5a30fd853d875e647d9ef96bbc8af329b8fb92edf42478bfb21c5fe2dd4b7f7`
- 전체 암호화 archive SHA256: `e4d9b0cd766ddc377d295adff3857eb369bae29f74b7c572479845b5991e70eb`
- source 검토 manifest SHA256: `12ebf26292879ec7226bb00af75cccb52decfa4e828471ba41ab19f2f995383a`
- 예상 함수 정의 SHA256: `473d6be07f5ee78c8c7e48fa912cc6ad1017da1e6dfbfc10e7e8282c3606b3d0`
- 비공개 증거: `/Users/cwj/.homecook/operations/feedback-batch-20260928/`
- 배포 로그: `/Users/cwj/.homecook/prelaunch-web/deploy-1790534707746.log`

## 남은 확인

실제 iPhone Safari의 키보드·주소창 변화 및 사용자 본인의 저장/탈퇴 최종 확인은 남아 있다. 운영 계정을 테스트 목적으로 탈퇴시키거나 새 공개 레시피를 만들지 않았다. 기존 전체 fixture suite의 알려진 불일치는 선택 검사의 통과와 구별한다. 웹 문제 시 기존 웹으로 복구할 수 있으며 DB 자동 복원/초기화는 수행하지 않는다.
