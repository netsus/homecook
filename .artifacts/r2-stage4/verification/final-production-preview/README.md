# Stage 4 최종 production 빌드 미리보기 검증

최신 화면 소스 `d0fb62f7052f08221ecad1edce64974641f4f962acce85dcf65244fdb6e07b04`를 단독 `corepack pnpm build`로 빌드한 뒤 cache를 제외한 출력 복사본에서 검증했다. 운영 배포가 아니다. 기존 3117 서버와 다른 3118 loopback 서버이며 public/rate/lead collection은 꺼져 있고 explicit memory preview만 사용한다. 환경 파일과 DB credential은 복사하지 않았다.

처음 fast gate 빌드의 복사 시점을 놓친 사실은 `freeze-missed.json`에 남겼다. 그 빌드는 production 근거로 사용하지 않았다. 리더의 전체 fast gate EXIT0 확인·단독 빌드 승인 뒤 수행한 이번 `build.log`가 최종 근거다.

## 결과

- `build.log`: production build EXIT0.
- `copy.json`: buildId `GDqNrPtQfgXeRgRDuMMUP`, compiled page SHA256 `7720ff3a44f281c0eaaad92677eaaa09b6328eeb08c572a14beeae149430160c`, 당시 HEAD `c00fa23f53cb18550424abb96c2964a46796e3dc`. HEAD에 아직 담기지 않은 변경은 기록된 소스 해시로 식별한다.
- `compiled-tree-parity.json`: 원본/복사본 server와 static 680개 파일의 tree SHA256이 `69e8b90e32ad94ed0aa9e74bba5f2e21f7ece81c8808fefb432e72f86cb1d384`로 일치한다.
- `headers.txt`: 실제 HTTP200, 정확한 `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.
- `report.json`, `e2e.log`: 31/31 통과, 39.3초, 실패·건너뜀·flaky 0. 두 주제 각각 Back/Forward 검사를 포함한다.
- `screenshot-manifest.json`, `results/`: 최신 68개 PNG. 2주제×4viewport×(정상 7상태+로컬 동의 오류)=64개, 실제 200% 글자 4개다. 모든 캡처 지점에서 axe 위반 0, 가로 넘침 없음, 44px target 검사를 통과했다.
- 두 주제의 단독 3활동·6자유순서, 키보드 focus/복귀, reduced-motion, 320px에서 실제 200% 글자 크기를 검증했다. 네 크기 전체 흐름에서 외부 호출/쓰기 요청/페이지·console·실패 요청 오류/IndexedDB/localStorage/sessionStorage 기록이 모두 0이었다.
- `result.json`: 7개 소스 해시가 복사/검증 전후 동일하다. 기존 보고의 “8개 소스”는 개수 오기이며 실제 copy.json의 key는 7개다.

RECOVERY 이미지 이름의 `local-consent-validation-not-server-error`를 유지한다. 서버 오류 RECOVERY와 이번 수정의 실제 API 실패 동작 근거는 별도 real UI 담당자의 8개 이미지·검증이며 이 preview로 대체하지 않는다. 실제 provider·운영 DB·실기기 OS·메일·배포를 검증했다는 의미가 아니다.

390px MENU와 LEAD_DONE 실제 PNG를 직접 확인했고 Next 개발 표시가 없다. 구현 보조의 시각 확인은 독립 final authority 승인을 대신하지 않는다.

## 살아 있는 검토 URL 및 종료 인계

- http://127.0.0.1:3118/beta/r2/recording
- http://127.0.0.1:3118/beta/r2/homeflow

소유 wrapper exec session은 `80871`, child PID는 `16715`다. `server-ownership.json`에 temp 위치·시작시각·포트가 있다. 승인된 검토 인계용으로 유지했으며 리더가 종료 시점을 소유한다. 이 child가 종료되면 wrapper가 자기 temp의 소유 marker를 확인하고 복사본만 삭제하여 `cleanup.json`을 기록한다. 기존 3117·제3자 프로세스·원본 `.next`·운영 데이터는 수정하거나 종료하지 않았다.

실행 명령은 `HOMECOOK_ROUND2_PREVIEW_E2E=1 HOMECOOK_ROUND2_SERVER_KIND=production HOMECOOK_R2_EVIDENCE_RUN_ID=final-production-20260911-0322 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3118 corepack pnpm exec playwright test --config playwright.marketing-round2.config.ts --output=.omx/artifacts/r2-stage4/final-production-preview/results`였다. 설정/제품 소스 추가 변경은 0이며 이번 기록은 `.omx` 검증 산출물뿐이다.
