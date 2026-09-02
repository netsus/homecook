# 무먹 모바일 광고 퍼널 Design QA

- 작성일: 2026-09-03
- 최종 판정: `passed`
- Visual Verdict: `94 / 100` (`pass`, 기준 90)

## 비교 기준

- 광고별 Hero:
  - A 재입력: `public/assets/funnel/hero/landing-a.png`
  - B 조리 후 중량: `public/assets/funnel/hero/landing-b.png`
  - C 칼로리 퀴즈: `public/assets/funnel/hero/landing-c.png`
  - D 비슷한 음식: `public/assets/funnel/hero/landing-d.png`
- 설문·체험·식단: `와이어프레임1.png`, `와이어프레임2.png`, `와이어프레임3.png`
- 결과 화면: 공개 전달본에서는 `evidence/design-qa/result-comparison-v3.jpg`의 왼쪽 원본과 오른쪽 구현을 함께 사용한다. 나머지 원본 작업 PNG는 공개 브랜치에서 제외했다.
- 제품 기준: `docs/product-decisions.md`
- `docs/prd v1.2.md`의 5문항·공유 제외안보다 이번 사용자의 명시적 4문항·공유 구현 요청을 우선했다.

## 구현 캡처와 상태

브라우저에서 렌더링한 iPhone 화면을 `evidence/design-qa/final/`에 저장했다.

| 파일 | 상태 |
|---|---|
| `00-hero-a.png`~`00-hero-d.png` | 광고 훅과 연결된 Hero 4종 |
| `01-hero.png` | 직접 방문 기본 Hero |
| `02-question-1.png` | 줄바꿈·확대된 선택지 |
| `03-result-eyeballing.png` | 별 이펙트·짧아진 설명이 적용된 결과 |
| `03a-demo-1.png` | 실제 YouTube 예시·재생 아이콘 |
| `03b-demo-1-loading.png` | 레시피 가져오기 로딩 |
| `04-demo-2.png` | 재료 변경 전 |
| `04b-demo-2-adjusted.png` | `600g → 520g` 변경 후 |
| `04c-demo-3.png` | `1,200g` 예상 무게와 줄바꿈 안내 |
| `05-demo-4.png` | 저울 표시창 안의 `320g` |
| `06-demo-5.png` | 폭죽 이펙트·계산 완료·새 탄·단·지 아이콘 |
| `07-planner-homecook.png` | 4개 영양 요약과 강조 유입이 적용된 무스크롤 식단 |
| `08-packaged-food.png` | 밀도를 줄인 완제품 카드 |
| `09-planner-complete.png` | 같은 저녁의 단백질 음료 강조와 4개 영양 요약 |
| `10-beta.png` | 결과 캐릭터·단일 로고·붙어 있는 동의와 고지 |
| `11-success.png` | 새 환영 소금병 캐릭터와 넓어진 완료 화면 |

캡처는 CSS 화면 `393×852`, DPR 1로 생성했다. 원본 screen1 보드는 `1003~1122px` 폭, 결과 원본은 `853×1844`, 결과 구현 원본 캡처는 `394×852`이며 정규 비교본 `03-result-eyeballing-393x852.png`를 함께 유지한다.

## 필수 비교 결과

- 글꼴·타이포: Pretendard 계열 위계를 유지하고 질문 선택지를 18px/800 이상으로 높였다. 지정된 질문과 결과 인용문 줄바꿈을 고정했다.
- 간격·레이아웃: 광고 보드 전체를 축소 삽입하지 않고 핵심 시각만 분리해 주 CTA를 하나로 만들었다. 두 플래너는 4개 영양 요약·오늘 식단·CTA를 `393×852` 한 화면에 담아 내부 스크롤이 없다.
- 색·토큰: 결과·체험·합계의 강조색은 밝은 `#00A1FF`를 사용한다. 본문은 충분히 진한 중립색을 유지한다.
- 이미지 품질: Hero는 제공된 screen1 시각을 파생 크롭으로 사용한다. 실제 YouTube 썸네일, 사용자 제공 완제품, 기존 결과 캐릭터를 유지했다. 신청 완료에는 같은 소금병 정체성을 보존한 `welcome-mascot-v2.png`를 생성하고 실제 알파 투명 PNG로 후처리했다.
- 카피·내용: 확정 숫자 `487 / 1,607 / 1,712 kcal`, `177 / 184g` 탄수화물, `111 / 131g` 단백질, `60 / 61g` 지방을 유지하고 광고별 첫 문장을 PRD의 A/B/C/D 훅과 맞췄다. 결과별 회색 설명은 인용문과 겹치지 않는 한 문장으로 줄였다.
- 아이콘·상태: YouTube 재생, 로딩, 따옴표, 결과 별 효과, 계산 완료 폭죽, 탄·단·지, 포커스, 오류, 성공 상태를 실제 아이콘·이미지와 인터랙션으로 확인했다.

## 상호작용·접근성 확인

- 4문항 자동 이동, 결과 4종과 이펙트, native share payload, 로딩→성공, 명확한 재료 변경 CTA, `1,200 → 1,180g`, 저울 `320g`, 두 차례 집중 애니메이션, 이메일 오류·동의·완료를 자동 테스트했다.
- Hero는 `utm_content`, `ad_variant`, `variant`를 지원한다.
- 전체 핵심 흐름의 외부 요청은 0건이며 YouTube와 이메일 저장 서비스를 호출하지 않는다.
- iPhone `393×852`, Pixel 10 `427×952`, `prefers-reduced-motion`, 최소 44px 터치 영역을 확인했다.
- 최종 캡처에서 콘솔 오류·경고는 0건이었다.

## 비교 반복 기록

1. 이전 결과 화면 반복: `61 → 84 → 93`, 결과 화면의 잘림·타이포·위계를 수정해 통과.
2. 이번 전체 흐름 v1: `88 / 100`, Hero가 전체 포스터를 축소해 이중 CTA와 낮은 메시지 밀도가 생긴 문제를 발견.
3. 이번 전체 흐름 v2: 제공된 screen1에서 핵심 시각만 파생하고 CTA를 하나로 정리해 `91 / 100` 통과.
4. 이번 피드백 v3: 결과·계산 완료 이펙트, 4개 영양 요약 무스크롤 플래너, 강조 유입, 베타 재배치, 환영 캐릭터를 적용해 `94 / 100` 통과.

P0, P1, P2 차이는 없다. 남은 P3는 재료 변경 CTA의 좌측 안내가 두 줄인 점, 베타 고지 문구가 작은 점, 플래너 식사 썸네일과 보조 문구가 조밀한 점이다.

## 검증 명령

- `npm run check:runtime`
- `npm run test:runtime`
- `npm run build`
- `npm run test:sites`
- `node scripts/capture-design-qa.mjs`
- `node scripts/generate-share-card.mjs`

최종 자동 검증은 Playwright 22개(런타임 8개 + 퍼널 14개), Sites worker 4개, 프로덕션 빌드와 보호 런타임 무결성 검사를 포함한다.

final result: passed
