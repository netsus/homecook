# 레시피북 표지 내부 origin 분리 보완 — 2026-10-17

기준 master14464a83c. 후보4bb48856c 조사에서 book list만 내부 SDK의 loopback signed URL을 NEXT_PUBLIC 공개 origin과 비교해 실패/fallback하는 공백을 확인했다. 옛 Data-origin adapter만 복원하면 브라우저에 loopback URL을 반환하므로 현재 레시피 이미지처럼 같은 앱 경로로 제공한다. PR1791의 scoped projection 보완 뒤 남은 별도 origin 문제다.

목록은 기존 owned list 승인→service-only projection→owner/reference/path/state 검증 뒤 `/api/v1/recipe-books/{id}/image`를 반환한다. 새 GET은 매번 로그인/현재 book 소유권을 먼저 재확인하고 같은 registry 검증 뒤 내부 Storage download를 수행한다.5MiB/MIME/no-store/nosniff를 유지하고 Storage URL·token·object path는 응답하지 않는다. 기존 비관리 URL/null과 null registry tuple 검사는 유지한다. reader 진입의 표지 정규화는 정확한 `/api/v1/recipe-books/<UUID>/image`만 상대경로로 추가 허용하며 외부 protocol-relative/경로이탈/query/잘못된ID는 거절한다. 공식 APIv1.2.43/SOT를 함께 갱신했다. 옛7파일 전체 merge·업로드 origin 정책 변경은 아니다.

공개HTTPS/내부loopback을 실제처럼 분리한 원 회귀는1FAIL/13PASS였다. 수정 뒤 목록+proxy+공통reader4파일57 PASS, typecheck/변경lint exit0, build exit0(기존4경고)다. 독립 리뷰 finding0/52 PASS 뒤 권장4회귀와 reader 경로 회귀1개를 더하고 최종57개 독립 PASS로 공유 표지·projection 부재·stale409/maintenance503도 확인했다. reader 경로는 수정 전1FAIL/17PASS도 재현했다. 매 요청 재인가, 비로그인/타인/권한실패 시 내부 접근 차단, wrong book/owner/path/reference/state 시 download0, oversized/MIME/download 오류를 검증했다.

`pnpm verify:anti-slop`은 기존 초과5개 때문에 exit1이다. 기준 master14464a83c의 direct checker도 같은5개/exit1이고 이번 표지 파일의 신규 finding0을 확인했다. baseline 수정0이며 전체 통과라고 표시하지 않는다. [기계 근거](data/recipe-book-cover-proxy-checks-20261017.json).

운영 DB/인증/Storage/Chrome 접근·배포·worker/manifest·키/공유설정 변경0이다. 실제 로그인 HTTP와 모바일/데스크톱 표지 요청은 운영 잠금으로 미검증이며 기존 요리화면 Chrome 증거로 확대하지 않는다. v85 잠금 해제/부모 직렬 조율 뒤 운영 흐름을 확인해야 한다.
