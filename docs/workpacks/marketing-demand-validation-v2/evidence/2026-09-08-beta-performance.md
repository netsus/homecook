# `/beta` in-app browser 성능 최적화

## 기준 측정

운영 `/beta`를 mobile simulated network(RTT 150ms, 1.6Mbps, CPU 4x)로 Lighthouse 3회 측정했다.

- median performance score: 78
- median FCP: 1,657ms
- median LCP: 5,152ms
- median TBT: 56ms
- CLS: 0
- LCP image request delay: 약 1,454ms

기존 화면은 `view` API가 끝날 때까지 loading screen만 렌더해 Hero image discovery가 늦었다. result character와 later-stage food/macro/mascot PNG는 파일당 약 0.45~2.56MB였다.

## 변경

- server-resolved Hero/shared result를 initial component props로 전달해 최초 HTML에 실제 화면을 렌더한다.
- `view` 연결 중 Hero를 유지하고 CTA만 disabled/aria-busy로 둔다.
- character 6개, Hero C food 1개, macro 3개를 resized WebP로 추가했다. 10개 합계는 약 297KB다.
- symbol, doodle, channel avatar, scale, product, beta wordmark도 direct WebP로 제공한다.
- 다음 화면 preloads는 API 완료 직후가 아니라 quiz start 뒤 시작한다.

## 로컬 production 비교

- API success를 PII-free local proxy로 응답한 동일 throttling 3회 median: performance 92, FCP 1,057ms, LCP 3,328ms, TBT 58ms, CLS 0, initial transfer 419,374 bytes.
- 운영 baseline 대비 score +14, FCP -600ms, LCP -1,824ms다. local after 측정은 public tunnel TTFB를 포함하지 않으므로 최종 public 동등 조건 측정으로 다시 확인한다.
- `view` 응답을 2.5초 지연한 cold browser에서 Hero 105ms, CTA enable 2,649ms로 Hero가 API보다 먼저 보였다.
- CTA 전 image request는 symbol과 visible Hero food만 발생했다. quiz 시작 뒤 common journey WebP를 warm하고 Q3 선택 시 해당 result character를 high priority로 warm한다.
- 원본 핵심 PNG 10개 12,993,682 bytes를 WebP 290,034 bytes로 줄여 97.8% 감소했다. 원본은 design provenance를 위해 보존하지만 runtime에서 요청하지 않는다.

## 검증

- focused Vitest 3개 파일 57개 통과.
- product Vitest 262개 파일, 3,094개 테스트 통과. 기존 환경 의존 14개 파일·177개 테스트는 생략했다.
- ESLint, TypeScript, source-of-truth sync, diff check와 final production build 통과.
- 보조 review에서 shared-result SSR 직후 CTA가 attribution 초기화보다 먼저 실행될 수 있는 race를 발견했다. server가 allowlisted UTM을 initial attribution으로 함께 전달하도록 수정했고 재검토 P1/P2 0을 확인했다.
- public deployment 후 같은 Lighthouse 조건 3회와 모바일/desktop journey를 다시 확인한다.
