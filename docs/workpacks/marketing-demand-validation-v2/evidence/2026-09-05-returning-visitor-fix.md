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
