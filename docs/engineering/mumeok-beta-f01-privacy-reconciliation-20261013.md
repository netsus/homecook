# F01 기존 미커밋 개인정보 안내 정리

상태: 최신 master 기준 로컬 안내 정리. 커밋·PR·웹 배포·운영 설정 변경은 총괄이 별도로 처리한다. 원본 변경 작성자는 확인되지 않았다. C05의 모델 참여 목적·기간·선별 정책은 이 작업의 범위가 아니다.

## 원본 보존과 기준

- 원본 checkout은 `codex/gabia-direct-prelaunch`, HEAD `f970bc1d1f1e981d8947e852a9b51ada4a74570a`다. 원본 tracked 5개와 untracked 2개를 총괄이 저장소 밖 `~/.homecook/operations/mumeok-beta-v9-f01-20261013-_fv2tqbx`에 보존하고 해시를 검증했다. 보존 디렉터리는 0700, 파일은 0600이며 HEAD·staged/unstaged patch·status·manifest를 함께 남겼다.
- 이 작업은 별도 `codex/mumeok-beta-f01-privacy` 작업트리에서 master `b257148d06737be703a7eea407d102384849bb25`를 기준으로 진행한다. 원본 checkout에는 쓰지 않는다.
- 최신 master와 원본 HEAD의 개인정보 페이지·해당 테스트는 같았다. 공식 문서의 기존 가비아 addendum도 master에는 없어 필요한 내용만 추가한다. CSoT 전체를 옮기면 최신 유튜브 canonical·worker·DB219 기록이 사라지므로 원본 전체 파일을 덮어쓰지 않는다.

## 7개 파일 분류와 채택 이유

| 원본 자료 | 분류 | 처리 |
|---|---|---|
| `app/privacy/page.tsx` | 필요·운영 설명 미반영 | 옛 Cloudflare 전체 전송·DDoS·거부 시 전체 서비스 제한 설명을 현재 일반 접속/로그인과 Turnstile 신청 기능으로 구분한다. 기존 목적·보유기간·법적 근거·시행일 설정은 바꾸지 않는다. |
| `tests/launch-readiness-legal-seo.test.tsx` | 네트워크 회귀 필요·날짜 변경 불필요 | 수정 안내와 전체 서비스 중단 오표시 방지를 검사한다. 원본의 9/8→10/12는 테스트 fixture 변경이며 실제 시행일 변경이 아니다. 필요한 네트워크 검증만 채택하고 날짜 fixture는 유지한다. |
| `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | 사실 필요·전체 복사는 최신 기록과 충돌 | 현재 master의 모든 문단을 유지한 채 F01의 미배포 안내·보존 기록을 추가한다. 원본의 옛 배포 상태를 최신 상태로 덮어쓰지 않는다. |
| `docs/요구사항기준선-v1.7.36.md` | 필요 | 10/12 직접 접속·Turnstile 안내 addendum을 추가하고 당시 운영 기록과 10/13 재확인을 연결한다. |
| `docs/화면정의서-v1.5.40.md` | 필요 | PRIVACY의 실제 네트워크 처리 설명을 같은 범위로 맞춘다. 기존 로그인/callback 동작은 변경하지 않는다. |
| `docs/engineering/gabia-direct-domain-20261012.md` | 직접 접속은 이미 운영 반영·역사 기록은 별도 보존 | 당시 기록을 삭제하지 않고 작성자 미확정·기록 시점 안내를 붙여 보존한다. 과거 typecheck 실패와 DNS 전파 대기는 현재 판정으로 복사하지 않으며 현재 검사 결과는 이 문서에 별도로 기록한다. |
| `.diagnostics/youtube-description-quantity-20261012/diagnosis.json` | 별도 유튜브 진단·DNS/개인정보 무관 | JSON 문법 유효성을 확인했고 원본/백업으로만 보존한다. 이 브랜치로 복사하거나 DNS/개인정보 커밋·PR에 포함하지 않는다. 내부 내용·개인 식별값은 공개하지 않는다. |

## 현재 읽기 전용 재확인

확인 시각: **2026-10-13 11:14:22 UTC**. 공개 DNS 조회와 자격증명 없는 공개 GET만 수행했다. DNS·Cloudflare·가비아·Caddy·서비스 설정, 계정/권한, DB, 운영 프로세스는 변경하지 않았다.

| 항목 | 직접 확인 |
|---|---|
| `mumeok.kr` NS | `ns.gabia.co.kr`, `ns1.gabia.co.kr`, `ns.gabia.net` |
| `@`/`app`/`auth` A | 세 이름의 응답 주소가 동일하다. 실제 주소 값은 이 문서에서 반복하지 않는다. |
| `https://mumeok.kr/login` | HTTPS 검증을 통과하고 308 → `https://app.mumeok.kr/login` |
| 공개 앱 홈/로그인/개인정보 | 각각 HTTP 200 |
| 공개 Auth health | HTTP 401. 이 응답만으로 실제 사용자 로그인 완료를 판정하지 않는다. |
| 위 GET 응답의 `cf-*` 헤더 | 0개. DNS와 기존 운영 조사도 함께 대조한 경로 확인이며 헤더 부재만으로 모든 내부 설정을 증명하지 않는다. |
| 공개 `/privacy` 본문 | 옛 “사이트 전송, HTTPS 연결” 문구가 있고 새 “일부 신청 화면의 Turnstile 사람 확인” 문구는 없다. 안내 변경은 아직 운영 미반영이다. |

총괄의 같은 날짜 읽기 전용 운영 조사에서 웹 `d22217ddc791df79e72c055516bd5cffd6bb69c0`, Caddy 직접 ingress, Cloudflare tunnel unloaded를 보고했다. 이는 이 작업의 새 로그인·Turnstile 동작·배포 합격을 뜻하지 않는다.

Turnstile의 메타데이터 범위는 [Cloudflare 공식 Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)의 client IP·TLS fingerprint·User-Agent·sitekey/associated origin 설명을 확인했다(2026-10-13 조회). 원본 안내의 브라우저·네트워크·보안정보에 사이트 키·접속 출처를 명시하여 전체 사이트 요청 내용과 구분한다. 현재 두 서버 verifier는 검증 토큰과 필요한 검증 파라미터만 보내고 이메일·설문 답변을 siteverify 요청에 넣지 않는다. 새 목적·보유기간·처리근거를 결정하지 않는다.

## 로컬 검증과 한계

- 수정 전 새 회귀 assertions: 해당 파일 15개 중 1개 실패, 14개 통과(exit 1). 실패는 현재 페이지에 Turnstile 한정 안내가 없는 증상을 재현했다.
- 수정 후 `pnpm exec vitest run tests/launch-readiness-legal-seo.test.tsx`: **15개 통과, 실패·건너뜀 0, exit 0**. 페이지 렌더링에서 새 Turnstile 범위와 일반 사이트/로그인 이용 가능 안내, 기존 개인정보 기간·연락처·법적 문서 링크를 함께 확인했다.
- `pnpm exec eslint app/privacy/page.tsx tests/launch-readiness-legal-seo.test.tsx`: **exit 0**, 오류·경고 출력 없음.
- `pnpm typecheck`: **exit 0**. 10/12 기록의 과거 누락 모듈 실패를 현재 결과로 옮기지 않는다.
- `pnpm verify:anti-slop`: fixture 검증·도구 타입 검사·baseline 검사 **exit 0**, 제품 703파일의 신규 위반 **0**. 기존 baseline을 갱신하지 않았다.
- `git diff --check`: **exit 0**. 최신 master의 CSoT 본문과 원본 DNS 운영 기록 본문이 온전히 남아 있는지 별도로 대조했다.
- 원본 7개 파일은 현재 원본과 0600 보존본의 SHA-256이 전부 같았다. 원본 브랜치와 미커밋/untracked 상태를 백업 status와 같은 명령 형식으로 대조했다. 원본 변경은 제거·stage·commit·reset하지 않는다.
- 이 작업은 새 개인정보 목적·기간·법률 적합성·소셜 로그인 실제 완료·Turnstile 실제 제출을 검증하지 않는다. 현재 날짜 fixture를 정책 시행일로 해석하지 않으며 운영 환경값도 변경하지 않는다.
- 웹 배포 전 운영 페이지는 옛 안내 상태다. 모바일/데스크톱의 최종 화면과 배포 후 공개 본문 일치는 총괄의 수정 묶음 검증에서 확인한다. 10/12 기록의 과거 typecheck 실패/16검사는 이 브랜치의 검사 결과가 아니다.
- 기존 `scripts/lib/prelaunch-web-deploy.mjs:277`의 R2 readiness 보호 목록에 `app/privacy/`가 포함된다. 따라서 F01은 일반 T1/T2 화면 묶음처럼 기존 R2 readiness를 단순 승계할 수 없다. 별도 PR 검토와 필요한 최신 개인정보·수집 경계 증거를 준비한 뒤 총괄이 배포 경로를 결정한다. 이번 작업에서 배포 guard·readiness·운영 설정을 수정하거나 우회하지 않았다.

## 원본의 남은 상태

원본 tracked 5개는 미커밋 상태로, 운영 기록과 진단 JSON은 untracked 상태로 남긴다. 별도 브랜치가 필요한 안내만 정리했다고 원본 내용을 삭제하거나 작성자가 해결한 것으로 표시하지 않는다. 진단 자료의 후속 판단은 별도 유튜브 범위이며 신규 추출·모델·P5 실행을 포함하지 않는다.


## 2026-10-14 후속: 수집 중지 상태의 홈 진입 안내

R2 collector를 명시적으로 끄면 기존 recording 페이지는404이고 homeflow는 저장 없는 체험으로 남는다. 홈의 광고 배너가 닫힌 설문으로 연결되지 않도록 서버 Home에서 `MUMEOK_ROUND2_ENABLED`가 정확히 `false`인 경우만 홈의 R2 진입 배너를 숨긴다. 모바일 둘러보기의 두 광고 카드와 데스크톱 광고 회전 영역에만 적용하며 일반 레시피·검색·태그·테마·메뉴는 유지한다. true/미설정의 기존 표시를 바꾸지 않는다. 이 표시용 prop은 데이터 수집 권한이 아니며 실제 차단은 기존 서버 collector의 disabled 검사가 수행한다.

- 제품 추가 변경은 `app/page.tsx`, `components/home/home-screen.tsx` 두 파일이며 관련 회귀는 기존 `tests/home-screen.test.tsx`에 추가했다. 운영 설정은 아직 변경하지 않았다.
- 새 mobile/desktop 회귀2개는 수정 전 R2 링크가 남아 실패했고 수정 후 기존 홈·개인정보76검사가 통과했다. 타입·변경 파일lint·diff 검사도 통과했다.
- 독립 실제 Next fixture에서 false/true 각각320/375/1440을 확인했다. false는 R2 링크0, true는 기존2개; 검색·초기화·테마·새로고침·일반 메뉴와 가로넘침0을 확인했다. 실제 API/DB 대신 fixture를 사용했고 이 결과는 운영 검증이 아니다.
- 기존 배포 도구의 closed 경계 변경은 별도 도구 브랜치·독립 리뷰로 준비 중이다. 최초 웹 후보는 개인정보+위 두 홈 파일과 정확히 검토한 문서/테스트만 포함하고 도구 파일을 섞지 않는다. 기존 active proof를 새 활성화 증거로 고쳐 쓰지 않는다.
- 첫 전환 실패 후 기존 웹으로 닫힌 상태를 유지하며 보상하는 경우, 기존 웹에는 홈 숨김 코드가 없어 닫힌 설문으로 향하는 기존 배너가 잠시 다시 나타날 수 있다. 임의로 이전 checkout을 수정하거나 수집을 재개하지 않고 같은 검토 후보로 재시도한다.
- 사용자 승인 범위는 현재 control의 수집·신청 중지뿐이다. 두 운영 env flag의 false 변경 및 closed 배포 정책 적용은 최종 대상·영향·복구 방법 확인 후 별도 승인이 필요하다. C05 기간·동의 정책 결정과 신규 자료 활용은 포함하지 않는다.
