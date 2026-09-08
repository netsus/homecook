# 현재 운영 기준 개인정보처리방침 정리

## 범위

사용자는 비어 있는 개인정보처리방침을 채우고 필요하지 않은 부분은 제거하도록 승인했다. 운영자·담당·연락처는 기존 2026-09-08 확인값을 유지한다.

## 확인한 실제 운영

- 앱·Auth·DB·Storage는 서버 Mac의 self-hosted full-local Supabase를 사용하므로 Supabase, Inc.를 수탁자나 국외 이전자로 적지 않는다.
- 공개 사이트는 Cloudflare Tunnel·HTTPS·보안 경계와 Turnstile을 사용한다. Cloudflare 공식 DPA는 고객을 controller, Cloudflare를 processor로 정의하고 global network에서 metadata가 미국·EU 등에 처리될 수 있음을 밝힌다.
- 개인정보 문의는 mumeok@naver.com으로 받으므로 네이버 주식회사를 문의 이메일 수신·보관 수탁자로 공개한다.
- 현재 개인정보의 제3자 제공은 없다. 소셜 로그인은 출시 준비 중 차단되어 있으며 Google·Kakao·Naver를 현재 제3자 제공 대상으로 적지 않는다.
- 탈퇴 RPC는 개인 저장정보를 삭제하고 운영·감사 record의 직접 account identifier를 제거한다. 공개·공유 content가 보존되면 작성자와 분리한다. 재가입 generation과 삭제 재처리 방지에 필요한 최소 identifier·hash tombstone은 영구 보존한다.
- marketing session, 설문, 유입과 신청 이메일의 보유기간은 campaign 종료 후 180일이다.

## 화면 정리

- 네 개의 빈 제3자 제공 row는 제3자 제공 없음 한 문단으로 바꿨다.
- 환경값이 없던 위탁·국외이전·파기·법적근거 row를 실제 Cloudflare·Naver 처리와 코드의 탈퇴 동작으로 교체했다.
- 개인정보 보호책임자와 고충처리 section은 권리 행사와 개인정보 문의 하나로 합쳤다.
- 빈 법령 보존기간, Supabase 내부 구현명, 빈 backup 주기, 직접등록 recipe 내부 처리기준은 제거했다.
- Cloudflare reverse proxy가 request content를 통과시키는 범위와 Turnstile 자체가 form input을 읽지 않는 범위를 분리했다. 공식 하위 처리자 위치와 변경 가능한 공식 목록 link, 국외 처리 거부 방법·영향을 함께 표시한다.
- 구현되지 않은 만 14세 age gate 문구는 제거했다. TERMS의 빈 탈퇴 잔존 row는 작성자 분리 content와 영구 최소 hash tombstone 설명으로 교체했다.
- env가 빠진 법적 문서 meta row도 빈 값으로 렌더하지 않는다.

## 근거와 한계

- 개인정보 보호법 제30조, 제15조, 제28조의8과 개인정보보호위원회 2026 처리방침 작성지침을 확인했다.
- Cloudflare DPA·Turnstile 문서와 네이버 개인정보처리방침을 provider 사실의 근거로 사용했다.
- Cloudflare 하위 processor·network 국가는 바뀔 수 있으므로 provider 고지를 정기 확인해야 한다.
- 네이버 문의메일 보유기간은 문의 처리와 필요한 후속 대응이 끝날 때까지로 제한한다. 목적 달성 뒤에는 아래 파기 원칙을 적용한다.
- 이 구현 task의 검토는 정식 legal advice나 독립 final authority를 대신하지 않는다.

## 구현 검증

- TDD에서 빈 legal row·불필요한 내부 구현문구·실제 위탁자·국외 이전·영구 tombstone 검사를 먼저 실패시킨 뒤 구현했다.
- launch/legal·guide focused Vitest 3개 파일 28개 통과.
- product Vitest 261개 파일, 3,091개 테스트 통과. 기존 환경 의존 14개 파일·177개 테스트는 생략.
- 전체 TypeScript, ESLint, source-of-truth sync와 diff 검사 통과.
- Chromium 375px·1280px에서 PRIVACY와 TERMS의 빈 dd 0, 가로 overflow 0을 확인했다. Cloudflare 전체 request transit, Naver 문의메일, 영구 최소 hash tombstone 표시와 구현되지 않은 아동 age gate 문구 제거도 확인했다.
- 보조 독립 리뷰의 Cloudflare 처리범위·영구 tombstone·TERMS 빈 row·age gate·Naver 보유기간 findings를 수정했고, 재검토에서 P1/P2 0을 확인했다. 이는 정식 final authority가 아니다.
- 로컬 화면 증거: /tmp/privacy-final-375.png, /tmp/privacy-final-1280.png.

## 출시 전 운영 배포

- 배포 exact SHA: `f79e23acd20968b44b884ad2bf801ece34300c8e`.
- build ID: `prelaunch-f79e23acd209-Pt7wB3`.
- 서버 자체 product test 3,091개 통과 뒤 production build, 임시 port와 asset 확인 후 웹 교체 성공.
- 최종 상태: loaded=true, rollbackAvailable=true, recoveryPending=false, database=null.
- Environment files, LaunchAgent values, and Caddy configuration hashes were unchanged.
- MARKETING_LEAD_PROTECTION_READY remained 0; no database, worker, Docker, or network changes were made.
- Public Chromium checks at 375px and 1280px returned HTTP 200 with empty dd 0 and horizontal overflow 0. No API requests, database test rows, or email submissions were created.
