# R2-S5-001 보조 브라우저 검증

- 결과: 10조건 PASS. recording/homeflow × NETWORK_ERROR/503 × 이메일 편집/동의 off-on 8조건과, 두 주제의 이미 접수된 응답 유실 후 token 없는 접수 확인 2조건이다.
- 관찰: 실제 브라우저 클릭 92건과 route-mocked 요청/응답 관찰 104건(lead 34건)을 `cases.json`에 남겼다. 원문 payload 대신 시각·버튼명·당시 표시 상태·API action·응답 상태·동일 원본 여부만 기록했다. 이메일/토큰/쿠키/키/원 UUID는 기록하지 않는다.
- UI 검증: 이전 요청 event/email 불변, 편집 입력 미전송, 새로 연결되어도 자동 lead 전송 없음, token 없는 접수 확인, 422 후 원본 입력 복원 및 동의 해제, 새 동의/보안 확인 후 같은 요청 재시도, 실제 성공 응답 이전 완료 화면 없음.
- 시각 검증: 두 주제 × 320×568/390×844 × 100/200% 글자 확대 8조건. `geometry.json`과 전체/CTA PNG 16장. root 글꼴은 16→32px, 복구 본문은 14→28px이며 정적 글자 잘림 0, 가로 넘침 0, 두 CTA 중앙/하단 hit 모두 통과했다. 입력 필드의 기본 가로 스크롤은 정적 글자 잘림과 구분한다.
- 직접 본 이미지: `recording-320-200-edited-recovery.png`, 그 CTA 이미지, `homeflow-390-100-edited-recovery.png`. 기존 `ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-ap-002/R2_RECORDING_RECOVERY-390x844-200percent.png`를 시각 계열 참고로 읽었다. 최종 보존본의 가짜 이메일은 검은 capture-only overlay로 가렸으며 앱 소스나 검증 측정에는 영향이 없다.
- 범위: 실제 Next + 실제 Round2Landing/client/view/CSS/widget adapter. 복사한 `app/beta/r2/[topic]/page.tsx`만 fixture props를 공급하도록 바꿨으므로 server page/runtime config, 실제 API/DB/provider, 실제 기기 검증으로 해석하지 않는다. 기존 actualDB 증거와 합산하지 않는다. 독립 Stage5 승인 아님.
- 소스: `source-manifest.json`에 복사본 SHA256. server page 외 6개 파일은 완료 시 작업 트리와 일치함을 검증했다. 실행 스크립트 SHA256은 `48fabe06a90e50574b610fde4fb34f6a1d2343abf100372a3110783b6b64b034`이다.
- 환경: 외부 요청 0, pageerror 0, DB/provider 접근 0. 3126 소유 서버는 종료됐고 포트가 비었음을 확인했다. 다른 3100/3118/3124 서버는 접근·변경하지 않았다. 임시 복사본 위치와 종료 정보는 `ownership.json`이다.
- 실행: `node tests/marketing-round2-lead-edit.browser.mjs`가 새로운 소유 복사본을 만든다. `--reuse-owned=<이미 만들어진 임시 복사본>`은 같은 복사본을 재검증한다. 루트 개발 서버/빌드나 기존 .next를 사용하지 않는다.
- 스크립트 ESLint 통과. 검증 진입점은 opt-in `.mjs`이므로 자동 기본 E2E 발견 범위를 늘리지 않는다.
