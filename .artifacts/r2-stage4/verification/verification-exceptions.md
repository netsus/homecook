# 검증 실행 예외 (최종 인계에 포함)

- 첫 literal `verify:frontend`는 lint/typecheck/제품7822PASS+516환경skip/build를 마친 뒤 Lighthouse에서 실패했다. 이후 기본 포트3100이 9/8부터 실행된 별도 prelaunch server(next15.5.21)임을 확인했다. 이전 Lighthouse 결과를 이번 candidate 측정으로 사용하지 않는다. 기존 프로세스/checkout/DB에 쓰거나 종료하지 않았다.
- 포트3120 점유0 확인 후 원래 lighthouserc.js의 URL·서버 port만 바꾼 task-owned 설정으로 동일 3회×2URL/기존budget을 재실행하여 PASS. `.omx/artifacts/r2-stage4/lighthouse-isolated.log`. 원형 설정과 budget을 완화하지 않았다.
- 이후 Playwright 전체 회귀/접근성/visual/security는 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3120`와 기본 reuse=false로 실행한다. 기존3100에 재사용flag를 주지 않는다. 각 종료/결과는 최종summary에 기록한다.
- Next dev는 private Cache-Control을 `no-store, must-revalidate`로 덮는다. .next productionbuild 복사본을 별도3117에서 실행해 exact `private, no-store`/`no-referrer`를 실제 검증했다.
- 초기 UI 캡처에서 대비3.41을 발견해 R2 scoped brand#00A1FF로 수정했다. 후속 axe 전수0. 1회 개발 HMR 시점393pxradio detach/화면MENU복귀 실패는 로그·trace보존, 수정없이동일검사rerunPASS이며 무조건 flaky로 면제하지 않는다.
- source snapshot/head/hash 차이를 구분한다. 대부분 증거는 커밋 전 실행이며 source manifest로 candidate 내용을 잠근다. 최종build와현재head검토 근거는 별도manifest에 연결한다.
- actual provider/실기기/광고/메일/운영DB·배포/activation은 실행하지 않는다. preview API/provider/DB0과 actualNext→isolatedDB경로는 다른 증거다.
