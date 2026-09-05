# 재방문 시작 오류 수정

사용자 요청: 공개 `/beta`의 시작 버튼 오류를 수정하고 Playwright로 전체 흐름 검증.
추가 선택: 신청 화면까지 정상화하고 이메일 접수는 비활성 상태 유지.

## 재현

새 브라우저의 `view → quiz_started → quiz_completed → result_viewed`는 200이었다.
같은 브라우저에서 새로고침하면 `view`는 `state=result_viewed`를 반환하지만,
프론트가 다시 `quiz_started`를 보내 409가 발생했다. 재시작 버튼도 같은 세션을
재사용해 오류가 반복됐다. 기존 E2E mock은 역순 요청도 성공시켜 이 결함을 놓쳤다.

## 수정 범위

- 서버에서 이미 완료한 단계는 재전송 없이 화면으로 재체험한다.
- 재설문의 Q3 결과는 기존 규칙으로 화면에 표시하며 최초 저장 답변·통계는 유지한다.
- 신규 단계만 서버에 기록하고 서버의 역순 거부·첫 저장 보존 규칙은 유지한다.
- 초기화 및 전송 중 저장 정보 손실, 결과에서 Q4로 돌아가기, 공유 결과 재시작을 수정한다.
- 공개 `/beta`에서는 로그인 전용 YouTube 알림 요청을 실행하지 않는다.
- API, DB 스키마, 이메일 접수 설정은 변경하지 않는다.

## 검증

- RED: 재방문·뒤로가기·snapshot·queue 8개 실패, Q4 복귀 및 공유 시작 저장 실패를 각각 확인.
- 관련 단위·회귀 124개 통과, lint·typecheck 통과.
- 실제와 같은 단계 제한을 적용한 모바일/데스크톱 Playwright 30개 통과.
- 독립 검토: 새 P1/P2 지적 없음.
- 공개 서버 반영 후 실제 API 검증은 아래 opt-in 명령으로 수행한다. 이메일은 제출하지 않는다.

```bash
HOMECOOK_MARKETING_PUBLIC_SMOKE=1 \
  pnpm exec playwright test --config tests/marketing-public-playwright.config.ts
```

Mac의 hosts가 공개 주소를 loopback으로 바꾸는 경우 실제 공개 DNS 주소를
`MARKETING_PUBLIC_CONNECT_IP`에 지정한다. HTTPS 인증서 검증은 유지한다.

## 공개 서버 최종 검증 (2026-09-05 19:45 KST)

- 최종 실행 commit: `101856539aa5a0c172ffab961442040c3ee88529`.
- 빌드: `prelaunch-101856539aa5-K1INdM`, 공개 HTTPS build manifest 일치 확인.
- 실제 API Playwright: **6 passed / 0 failed / 0 skipped / 0 flaky**.
- 네 Q3 결과별 전체 흐름, 완료 후 재방문, 같은 쿠키의 새 탭, Q4 복귀, 320px·1280px 반복 흐름을 통과했다.
- 실제 API를 검사한 네 결과 케이스에서 API 실패·page error·console error·실패 요청·비공개 알림 요청 모두 0이었다.
- 이미지 디코딩 완료까지 기다리는 검사에서 신청 캐릭터의 priority 이미지가 요청되지 않는 추가 결함을 발견했다. 해당 이미지 한 곳만 `loading="eager"`로 바꾸고 동일 공개 검사를 재통과했다. 최종 스크린샷은 애니메이션 완료 상태와 로드된 이미지로 저장했다.
- 이메일 접수는 사용자 선택대로 비활성 상태이며 실제 이메일 제출은 하지 않았다. 모의 API의 제출 성공 검증과 실제 신청 화면까지의 검증은 구분한다.
- DB 스키마·worker·도메인 설정 변경 없음. 웹 앱만 교체했다.

결과 JSON: `tests/.artifacts/beta-live-flow/public-results.json`.
스크린샷: `tests/.artifacts/beta-live-flow/public-results/`.
최초 재현 자료: `.artifacts/beta-live-flow/before/`.

수정 소스는 `fix/beta-returning-session-flow`에 커밋했으며 아직 master에 병합하지 않았다.
배포는 고객 0명·광고 미집행의 출시 전 개발 경로에서 검토한 정확한 수정 commit으로 수행했다.

## 최신 master 통합

- 최신 기반: `a882404d` (PR #1517). 위 공개 서버 검증은 과거 배포 head의 기록이며 이번 통합본의 실서버 검증으로 재사용하지 않는다.
- #1517의 실제 Turnstile 위젯/controller, 만료·오류 후 reset, 개인정보 보유 기간 안내와 QA widget mock을 보존했다.
- 기존 서버/API/DB/접수 활성화 설정은 변경하지 않았다.
- 재방문 Playwright 파일을 `slice-marketing-returning-session.spec.ts`로 배치해 일반 CI 회귀 명령의 `slice-*.spec.ts` 검색에 포함한다.
