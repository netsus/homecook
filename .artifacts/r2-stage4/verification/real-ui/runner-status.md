# R2 실제 Next UI/API/DB 검증 인수 메모

소유 보조 작업: `r2_real_ui_smoke`. 제품/기존 runner 변경 없이 신규 3파일만 작성했다.

- 실행: `node scripts/verify-marketing-round2-ui-isolated.mjs`
- 새 pinned isolated project만 만들고 원형 Next 페이지·POST handler·Supabase SDK·실제 PostgreSQL을 사용한다.
- Next CLI 대신 NODE_ENV=test인 테스트 전용 custom server를 사용한다. GET props나 API handler를 치환하지 않는다. 소스 사본의 별도 `.next`만 사용한다.
- 브라우저 Turnstile widget 및 서버 Siteverify transport만 mock이다. 외부 provider 요청, 운영 DB 쓰기, 배포는 0이다.
- 새 fixture의 정상화된 실제 경로만 owner-only storage로 사용한다. 독립 브라우저 case가 종료된 시점에 fixture rate counter만 초기화한다.
- 실제 429 검증에서는 초기화나 시간 조작 없이 실제 제한과 다음 시간창을 기다린다.

## 최종 증거

- `result.json` + `../real-ui-run7.log`: 최신 client 수정 포함 실제 Next UI/API/DB 전체 24조건 PASS. API 194회, DB 23참여, provider mock 15회. 외부 요청과 page error는 0. 기존 v2 accepted fixture 1행의 checksum도 변하지 않았다.
- 전체 24조건: 두 주제 각각 3단독·6완료순서·reload, 두 탭·두 주제 유지, 실제 410 뒤 명시적 재시작과 다른 쿠키 보존, 실제 409 뒤 새 동의·신청 성공, commit 응답 유실 뒤 동일 event 재시도/중복 0, 실제 429 뒤 36초 대기·복구, 저장소 차단 뒤 기존 cookie_resume.
- `../real-ui-recovery/result.json` + `../real-ui-recovery-run8.log`: 같은 제품 소스의 두 오류 흐름 추가 PASS. 실제 recording 409/입력 보존, homeflow commit 응답 유실/예시 3번째 장면 보존. 각각 320×568, 390×844, 393×852, 1280×900 viewport의 full-page PNG 8장.
- 캡처 전용 재실행: `node scripts/verify-marketing-round2-ui-isolated.mjs --recovery-only`. 별도 새 DB를 만들고 결과를 `real-ui-recovery/`에 보존한다. 전체 gate를 수행한 것으로 표시하지 않는다.
- `../real-ui-recovery/screenshot-manifest.json`: PNG 실제 너비·full-page 높이·SHA256. Next 개발 표시(N)는 도구 오버레이로 보일 수 있으며 제품 컴포넌트가 아니다. 대표 두 장에서 실제 오류/보존 입력이 렌더링된 것을 육안 확인했으며 디자인 authority 승인으로 취급하지 않는다.
- `target-red.log`→`target-green.log`: 잘못된 포트 0을 허용하던 검증기 경계의 실제 assertion RED→GREEN. 운영 namespace·외부 URL·미확정 버전/해시를 포함해 10개 통과.
- `lint.log`: 소유 3파일 lint 통과. 전체 저장소 tsc는 준비 단계에서 통과했으며 최종 전체 제품검증은 root 책임이다.
- 두 `source-manifest.json`은 Next 실행에 사용한 실제 source snapshot의 SHA256을 기록한다. 마지막 client 3파일의 확정 해시와 전체 실행 snapshot이 일치함을 확인했다: client `e6555b6657b2435d31d6ac92765b938b948cc06c9d3041770f56ec4011125362`, storage `39476ebc6a575f507aaff05d84e85f5d055864b667e7d83cb1f4b441f97c6bcc`, session `b0dc08faae1c78d586881a2db2c8820c93994084db014c251ec38a8dc4092c2e`.

최종 run7과 run8 모두 exit 0이고 owned Next/Chromium/DB 정리까지 완료했다. 3443 listener 부재도 확인했다. 실제 provider·실기기·운영 activation은 ManualOnly다. DB 쓰기는 새 `hcg_*` fixture에 한정했고 운영 target은 선택하거나 변경하지 않았다.

## 테스트 환경 보정 이력

초기 시도에서는 임시 경로의 `/var` alias를 실제 `/private/var`로 정규화하지 않아 owner-only 검증이 거부했다. 이후 realpath를 사용했다. 비동기 response observer가 이전 응답을 읽던 문제와 bootstrap 복구 전에 동의를 체크하던 테스트 타이밍 문제도 정확한 응답·복구 완료 대기로 수정했다. Next cold compilation은 성능 측정이 아니므로 초기 연결 assertion만 30초, 탐색은 60초 대기로 구분했다. 캡처 전용 실행은 읽기 전용 GET의 실제 405 응답으로 API route를 먼저 컴파일한다. 제품 경계나 완료 조건을 완화하지 않았다. 과거 `scenario-failure.json`/`failure.png`는 이 보정 과정의 진단 자료이며 최종 판정은 위 PASS 보고서 두 개다.
