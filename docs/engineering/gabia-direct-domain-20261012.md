# 가비아 직접 DNS 전환 — 2026-10-12

기록 구분: 원본 미커밋 운영 기록을 보존한 역사 자료다. 원본 작성자는 확인되지 않았다. 아래 확인·검사·남은 점검은 2026-10-12 당시 보고이며 현재 재검증으로 소급하지 않는다. [2026-10-13 읽기 전용 재확인·안내 정리](mumeok-beta-f01-privacy-reconciliation-20261013.md)를 별도로 따른다.

## 변경

- `mumeok.kr` 권한 네임서버를 `ns.gabia.co.kr`, `ns1.gabia.co.kr`, `ns.gabia.net`으로 변경했다. 가비아 DNS의 `@`, `app`, `auth` A 레코드는 기존 운영 서버를 가리킨다. 기존 Cloudflare DNS에는 세 레코드를 모두 DNS only로 남겨 네임서버 캐시가 남은 동안에도 같은 원본에 도달하게 했다. Cloudflare 계정과 zone은 나중에 다시 사용할 수 있도록 보존했다.
- 운영 Caddy에 `mumeok.kr`의 HTTPS 308 이동을 추가하고 요청 경로를 `https://app.mumeok.kr`에 보존한다. 앱과 Auth의 Caddy upstream은 그대로 두고, 직접 접속자가 위조한 `CF-Connecting-IP`가 내부 인증 요청에 전달되지 않도록 제거한다. 변경 전 Caddyfile은 저장소 밖 `~/.homecook/operations/gabia-direct-20261012/Caddyfile.before`에 보관했다.
- 공개 앱·Auth origin 및 소셜 로그인 callback은 바꾸지 않았다. 일부 신청 화면의 Cloudflare Turnstile은 계속 사용하므로 개인정보 안내에서 그 처리 범위만 유지한다.

## 확인

- 네임서버 변경 전 가비아 DNS에서 세 A 레코드가 같은 원본을 가리키고, DNSSEC DS 레코드가 없음을 확인했다. 가비아 관리 화면은 네임서버 변경을 `설정 완료`로 표시했다. `.kr` 상위 DNS의 위임도 가비아 세 네임서버를 반환했다. 기존 재귀 DNS의 네임서버 캐시는 전파 중일 수 있다.
- Caddy 변경 후보를 `caddy validate`로 검사하고 reload 뒤 직접 HTTPS 앱 `200`, Auth health `401`을 확인했다. 새 루트 인증서 발급 후 `https://mumeok.kr/`과 `/login`은 인증서 검증을 통과하며 앱의 같은 경로로 `308` 이동했다.
- 공개 앱 홈과 로그인은 Cloudflare 응답 헤더 없이 `200`, Auth health는 `401`이었다. 공개 홈 첫 응답은 전환 직후 Mac에서 약 38~96ms 범위였다. 이전 공개 홈 2회 중앙값 3.82초와 측정 조건·표본 수가 다르므로 장기 개선율로 해석하지 않는다.
- Google·Kakao·Naver Auth 시작은 각 제공자에 `302`로 이동했고 세 제공자의 callback은 모두 기존 `https://auth.mumeok.kr/auth/v1/callback`이었다. 사용자 본인이 카카오 로그인을 실제로 완료했다.

## 남은 점검

- 가비아 안내에 따라 재귀 DNS의 네임서버 변경 전파에는 최대 48시간이 걸릴 수 있다. 이 기간 두 DNS zone 모두 같은 운영 A 레코드를 유지한다.
- Cloudflare 프록시가 제공하던 WAF·DDoS 방어는 현재 없다. 직접 공개된 Caddy의 HTTPS, Auth-only proxy, 기존 앱 권한·세션 보호를 유지한다. 광고·고객 유입 전 보호와 CI·출시 점검을 다시 결정한다.
- R2 마케팅 수집의 과거 Cloudflare ingress 증거 계약은 직접 연결과 맞지 않아 별도 재검증 전 사용하지 않는다. Turnstile 사용 화면과 Google·Naver의 실제 로그인 완료는 이번 전환에서 직접 재현하지 않았다.
- 개인정보 안내 소스와 공식 문서는 새 경로에 맞게 수정했지만 운영 웹에는 아직 반영하지 않았다. 배포 중인 커밋에서 `pnpm typecheck`가 이번 변경과 무관한 누락된 과거 스크립트 모듈·export 참조로 실패한다. 개인정보 관련 테스트 16개와 변경 파일 ESLint는 통과했다. 빌드를 강행하거나 타입 보호를 낮추지 않고 다음 검증 가능한 웹 배포 묶음에 안내 변경을 포함한다.
