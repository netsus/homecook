# 무먹 모바일 광고 퍼널 Design QA

- 작성일: 2026-09-03
- 최종 판정: `passed`
- Visual Verdict: `95 / 100` (`pass`, 기준 90)

## 비교 기준

- 광고별 Hero:
  - A 재입력: `public/assets/랜딩페이지screen1_8.png`
  - B 조리 후 중량: `public/assets/랜딩페이지screen1_5.png`
  - C 칼로리 퀴즈: `public/assets/랜딩페이지screen1_6.png`
  - D 비슷한 음식: `public/assets/랜딩페이지screen1_7.png`
- 설문·체험·식단: `와이어프레임1.png`, `와이어프레임2.png`, `와이어프레임3.png`
- 결과 화면: `눈대중장인.png`, `성분추적러.png`, `프로계량러.png`, `집밥패스형.png`
- 제품 기준: `docs/product-decisions.md`
- `docs/prd v1.2.md`의 5문항·공유 제외안보다 이번 사용자의 명시적 4문항·공유 구현 요청을 우선했다.

## 구현 캡처와 상태

브라우저에서 렌더링한 iPhone 화면을 `evidence/design-qa/final/`, 최신 피드백 화면을 `evidence/design-qa/final-v4/`와 `evidence/design-qa/final-v5/`에 저장했다.

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
| `final-v4/03-result-393x852.png` 등 6장 | 뒤로가기·결과·재료·영양·플래너·베타 구성 검증 |
| `final-v5/10-beta-393x852.png` | 활짝 웃는 봉투 캐릭터와 파란 꼬임 끈 |
| `final-v5/11-success-393x852.png` | 활짝 웃는 하트 캐릭터와 파란 꼬임 끈 |

캡처는 CSS 화면 `393×852`, DPR 1로 생성했다. 원본 screen1 보드는 `1003~1122px` 폭, 결과 원본은 `853×1844`, 결과 구현 원본 캡처는 `394×852`이며 정규 비교본 `03-result-eyeballing-393x852.png`를 함께 유지한다.

## 필수 비교 결과

- 글꼴·타이포: Pretendard 계열 위계를 유지하고 질문 선택지를 18px/800 이상으로 높였다. 지정된 질문과 결과 인용문 줄바꿈을 고정했다.
- 간격·레이아웃: 광고 보드 전체를 축소 삽입하지 않고 핵심 시각만 분리해 주 CTA를 하나로 만들었다. 두 플래너는 4개 영양 요약·오늘 식단·CTA를 `393×852` 한 화면에 담아 내부 스크롤이 없다.
- 색·토큰: 결과·체험·합계의 강조색은 밝은 `#00A1FF`를 사용한다. 본문은 충분히 진한 중립색을 유지한다.
- 이미지 품질: Hero는 제공된 screen1 시각을 파생 크롭으로 사용한다. 실제 YouTube 썸네일, 사용자 제공 완제품, 기존 결과 캐릭터를 유지했다. 베타 신청·완료에는 팬트리 원본 비율과 부드러운 타원형 손발을 보존한 `beta-invitation-mascot.png`, `beta-success-mascot.png`를 사용한다. 두 캐릭터 모두 활짝 웃는 입과 같은 얇은 파란 꼬임 끈을 사용하며 실제 알파 투명 PNG다.
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
5. 이번 피드백 v4: 전체 뒤로가기, 파란 재료 변경 버튼, 탄·단·지 이미지, 내일 식단과 플로팅 CTA, 베타 정렬을 적용해 정규 `393×852` 콘텐츠 크롭 기준 `92 / 100` 통과.
6. 캐릭터 v5: 봉투·하트 캐릭터의 입을 더 크게 열고 넓은 스카프를 같은 얇은 파란 꼬임 끈으로 교체해 `95 / 100` 통과.

P0, P1, P2 차이는 없다. 남은 P3는 베타 고지 문구와 플래너 보조 문구가 작은 점, 영양 아이콘의 일러스트 톤이 조금 다른 점이다.

## 검증 명령

- `npm run check:runtime`
- `npm run test:runtime`
- `npm run build`
- `npm run test:sites`
- `node scripts/capture-design-qa.mjs`
- `node scripts/generate-share-card.mjs`

최종 자동 검증은 Playwright 22개(런타임 8개 + 퍼널 14개), Sites worker 4개, 프로덕션 빌드와 보호 런타임 무결성 검사를 포함한다.

## A 광고 반복 검색 개선 · 2026-09-04

### 비교 대상과 정규화

- 시각 기준: `/Users/shj/.codex/attachments/f198c8b8-a565-4ac7-adcc-17d0339a243d/codex-clipboard-52f557b6-1b31-4b9e-a603-13576029431e.png` (`662×684`).
- 광고 구현: `public/assets/funnel/ads/ad-a-4x5.png` (`1080×1350`)과 `public/assets/funnel/ads/ad-a-9x16.png` (`1080×1920`).
- 랜딩 구현: `public/assets/funnel/hero/hero-a-visual.png` (`1000×700`)과 `evidence/design-qa/final/00-hero-a.png` (`390×844`, CSS viewport `390×844`, DPR 1).
- 상태: A 광고 유입 직후 Hero. 인앱 브라우저에서 참고 이미지와 4:5 광고를 좌우로 함께 표시해 전체 구성을 비교했고, 랜딩 Hero를 별도 모바일 뷰포트에서 확인했다.
- 참고 이미지는 CTA가 없는 정사각형에 가까운 보드이고 구현은 운영용 4:5·9:16 광고이므로, 픽셀 위치 복제보다 제목→불편 설명→레시피/검색 장면의 정보 순서와 시각적 즉시성을 비교했다.

### 필수 품질 표면

- 글꼴·타이포: 기존 무먹의 굵은 제목 위계를 유지하고 `또 찾고 또 입력`만 코랄색과 물결 밑줄로 강조했다. 검색 행은 모바일 광고에서도 읽히는 굵기와 크기를 유지한다.
- 간격·레이아웃: 설명과 문제 장면 사이의 과도한 자동 여백을 제거하고, 4:5 카드 높이를 `560px`, 9:16 카드 높이를 `620px`로 키워 참고안처럼 본문 다음에 문제 장면이 이어진다.
- 색·토큰: 브랜드 블루는 레시피 헤더·검색 아이콘·CTA에, 코랄은 문제 문구에만 사용한다. 검색 입력은 중립 회색 배경으로 실제 앱 입력 영역처럼 보인다.
- 이미지 품질: 기존 제육볶음 사진에서 저울을 제거한 새 음식 사진을 사용한다. 흰 배경, 온전한 접시, 음식 중심 크롭을 4:5·9:16·Hero에서 동일하게 유지한다.
- 카피·내용: `돼지고기 600g · 양파 200g · 대파 100g`이 왼쪽 레시피와 오른쪽 `돼지고기 검색... / 양파 검색... / 대파 검색...`에 일대일로 대응한다.
- 아이콘·상태: Radix의 검색·다음·로딩 아이콘을 사용하며, 세 검색 입력 아래 별도 로딩 행으로 반복 검색 후 대기까지 표현한다.

### 전체·집중 비교 결과

- 전체 화면: 참고안과 동일하게 레시피 카드와 식단 검색 화면을 좌우 배치했다. 운영 광고에 필요한 공통 CTA와 신뢰 문구만 추가된 의도적 차이가 있다.
- 집중 영역: `hero-a-visual.png`에서 세 재료와 세 검색 문구가 같은 순서로 보이며, 작은 설명 문구나 `VS` 없이도 방향 화살표와 검색 아이콘만으로 동작이 이해된다.
- 인앱 브라우저 콘솔 오류·경고: 0건.
- P0/P1/P2 잔여 문제: 없음.

### 비교 반복 기록

1. `78 / 100`: 큰 검색 결과 카드와 자리 표시선 때문에 세 번의 검색 행위가 즉시 읽히지 않음.
2. `87 / 100`: 세 검색 입력과 로딩 행으로 단순화했으나 레시피 사진에 빈 저울 화면이 노출됨.
3. `88 / 100`: 저울 없는 음식 사진으로 교체했으나 4:5에서 본문과 카드 사이 여백이 참고안보다 큼.
4. `95 / 100`: A 전용 카드 크기와 위쪽 간격을 조정해 정보 연결과 모바일 가독성 통과.

final result: passed

## `3cf3336` 최종 디자인 기준 고정 · 2026-09-04

- 기준 소스 커밋: `3cf3336597a93b6cbc233d166d0c8ed34a9852ad`
- 추적 가능한 기준본: `docs/design-baseline/3cf3336/`
- 최신 Hero CTA 문구와 체험 1 로딩 시간을 반영하도록 캡처 스크립트를 갱신했다.
- A/B/C 및 호환용 D Hero, 전체 체험 상태, 두 식단 상태, 베타 신청과 완료까지 23장을 `390×844`, DPR 1로 다시 캡처했다.
- 모든 주요 화면의 `scrollHeight`와 `clientHeight`가 `844px`로 같고 콘솔 오류·경고는 0건이다.
- 로딩과 완료 캡처의 SHA-256이 서로 달라 두 상태가 구분되어 저장됐음을 확인했다.
- Visual Verdict: `96 / 100`, `pass`.

final result: passed

## 체험 2 재료 단위 통일 · 2026-09-04

- 양파 `100g`, 고추장 `100g`, 고춧가루 `21g`으로 변경해 화면에 노출되는 다섯 재료의 단위를 모두 g으로 통일했다.
- 390×844 인앱 브라우저에서 모든 수치의 오른쪽 기준선과 행 높이가 유지되고 줄바꿈이나 겹침이 없음을 확인했다.
- Visual verdict: `99 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## 체험 상태 안내 카드 통일 · 2026-09-04

- Reference: 사용자가 제공한 Demo 1 가져오기 완료 안내와 Demo 2 재료 조정 안내 캡처.
- 두 안내를 동일한 48px 최소 높이, 10px/14px 내부 여백, 흰 배경, 옅은 파란 테두리·그림자, 가운데 정렬 구조로 통일했다.
- Demo 2에도 동일한 파란 체크 아이콘을 추가하고 두 카드의 문구를 16px/850 굵기로 키웠다.
- 390×844 인앱 브라우저에서 두 화면을 각각 확인했으며 문구가 한 줄로 유지되고 CTA 및 재료 목록과 겹치지 않는다.
- Visual verdict: `97 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## 체험 2 숫자 단독 강조 · 2026-09-04

- 사용자 캡처에서 돼지고기 행 왼쪽의 파란 인셋 선이 카드의 둥근 모서리와 겹쳐 잘린 박스처럼 보이는 문제를 확인했다.
- 행 단위 강조선과 애니메이션을 제거하고, `600g → 520g` 숫자 롤링 및 완료된 `520g`의 브랜드 블루 색상만 유지했다.
- Codex 인앱 브라우저의 390×844 화면에서 변경 후 첫 행 배경과 카드 왼쪽 테두리가 다른 행과 동일하게 이어지고, 별도 파란 선이나 사각형이 나타나지 않음을 확인했다.
- Visual verdict: `99 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## YouTube 레시피 출처 교체 · 2026-09-04

- Source: `https://www.youtube.com/watch?v=chnArCaEpqA&t=5s`, 이 남자의 cook, `[제육볶음] 이 영상을 본다면 앞으로 당신의 대표요리는 '제육볶음'`, 조회수 904만회 확인 시점 기준.
- 영상 설명란의 공식 재료표에서 돼지고기 목살 600g, 신김치 200g, 양파 1/2개, 고추장 4큰술, 고춧가루 3큰술을 대표 재료로 추출했다.
- 나머지 간장·설탕·후추·물엿·다진 마늘·맛술·대파·청양고추·들기름·통깨는 `외 10개 재료 / 생략`으로 표시한다.
- Demo 1은 새 480×360 로컬 썸네일, compact title `대표요리가 되는 제육볶음`, `YouTube · 이 남자의 cook · 조회수 904만회`를 사용한다.
- Demo 2는 5개 재료와 생략 행이 no-scroll 화면에 온전히 보인다. Visual verdict `99 / 100`.

final result: passed

## 프레임리스 웹 버튼 커서 · 2026-09-04

- 원인: 보호 런타임의 `.device-screen button { cursor: none !important; }`가 일반 `auto` 복원 규칙보다 구체적이었다.
- 수정: `.device-screen .screen-content button/a/[role=button]`에 `pointer !important`, 입력 컨트롤에는 `text !important`를 적용했다.
- 현재 활성 플래너의 뒤로가기, 추가 버튼 6개, CTA에서 계산된 cursor가 모두 `pointer`임을 확인했다.
- 보호 런타임 파일은 변경하지 않았고 런타임 무결성 검사를 통과했다.

final result: passed

## 애니메이션 테두리 정렬·520g 전환 안정화 · 2026-09-04

- 체험 2 숫자는 48px 고정 폭, tabular 숫자, 720ms count down과 짧은 세로 이동만 사용한다. 숫자 및 행 배경색 변화와 scale을 제거했다.
- 돼지고기 행은 흰 배경과 왼쪽 4px 브랜드선만 유지한다.
- 플래너 영양 요약은 바깥 그룹 ring을 제거하고 각 실제 카드 안쪽 inset 효과만 사용한다. 카드 자체 transform은 없다.
- 식단 행 강조는 전체 사각형 대신 왼쪽 inset 선만 사용하며 행 transform은 없다.
- 체험 3 안내문은 네 면 동일 테두리와 CTA 간격 12px를 유지한다.
- 브라우저에서 520g 투명 배경·그림자 없음, tabular 숫자, 플래너 카드/행 transform 없음과 inset 효과를 확인했다. Visual verdict `99 / 100`.

final result: passed

## 체험 2·3 상태 전환 강조 · 2026-09-04

- 체험 2: 돼지고기 값이 720ms 동안 600→520으로 내려가며, 값은 최대 1.48배 반동하고 행 전체는 1500ms 파란 배경·테두리 강조 후 왼쪽 파란선을 유지한다.
- 체험 3: 완료 안내문은 공통 CTA 12px 위 절대 슬롯에 배치했다. 측정된 상·우·하·좌 테두리는 모두 동일하고 버튼과 겹치지 않는다.
- 중간값 `580g`, 최종값 `520g`, 행 애니메이션과 최종 배경을 브라우저에서 확인했다.
- 콘솔 오류·경고 0건. Visual verdict `99 / 100`.

final result: passed

### 플래너 g 단위 간격

- 탄수화물·단백질·지방 숫자와 `g` 사이에 `kcal`과 동일한 한 칸 공백을 적용했다.
- 렌더링 텍스트 `1,607 kcal / 177 g / 111 g / 60 g`을 확인했다. Visual verdict `99 / 100`.

final result: passed

### 플래너 영양 단위 색상 분리

- 오늘·내일 요약의 숫자는 `#00A1FF`, `kcal`과 `g` 단위는 `#4E5C67`을 사용한다.
- 단위는 숫자와 같은 14px/900 크기·굵기를 유지하고 색상만 중립화했다.
- 브라우저 계산값 `rgb(78, 92, 103)`과 양쪽 요약 적용을 확인했다. Visual verdict `99 / 100`.

final result: passed

## 체험 2 하단 버튼 크기 · 2026-09-04

- Source visual truth: 사용자 제공 체험 2 스크린샷의 오른쪽으로 넘친 `600g → 520g` 버튼.
- 원인: `.change-weight-button { width: 100% }`가 공통 하단 슬롯의 좌우 24px inset과 동시에 적용됐다.
- 수정: 고정 슬롯의 변경 버튼은 `width: auto`, 높이 54px, 반경 13px, 좌우 패딩 20px를 사용한다.
- 측정: 왼쪽 24px, 오른쪽 24px, 높이 54px, 반경 13px, 글자 굵기 900.
- 콘솔 오류·경고 0건. Visual verdict `99 / 100`.

final result: passed

### 오늘·내일 영양 요약 규격 통일

- 오늘과 내일 요약의 metric card 높이는 약 54px, summary padding은 `7px 10px 6px`, label은 11px, value는 14px로 동일하다.
- 모든 영양 값 색상을 브랜드 블루 `#00A1FF`로 변경했다.
- 내일 요약은 기존 큰 내부 여백을 줄이고 오늘과 같은 10px 좌우 외부 여백을 적용했다.
- 오늘·내일 meal-add button은 동일한 36px dashed-blue 규칙을 사용한다.
- 인앱 브라우저 측정과 시각 비교에서 크기·폰트·색·여백이 일치했다. Visual verdict `99 / 100`.

final result: passed

### 주간 이동 행 제거

- 사용자 표시 영역인 이전 주 버튼, `이번 주 8/31 - 9/6`, 다음 주 버튼을 양쪽 플래너에서 제거했다.
- `이번 주 식단` 제목 바로 아래에 요일 스트립이 이어지고 오늘·내일 카드가 더 많이 노출된다.
- 고정 CTA의 위치와 내일 카드 잘림 구조는 유지된다.
- 인앱 브라우저에서 제거 상태와 콘솔 오류·경고 0건을 확인했다. Visual verdict `99 / 100`.

final result: passed

## 플래너 자연 흐름·공통 하단 CTA · 2026-09-04

- Source visual truth: 사용자 제공 큰 화면 플래너 스크린샷과 오늘 카드 바로 다음에 내일 카드가 이어져야 한다는 지시.
- Rendered implementation: 인앱 브라우저의 집밥 반영 플래너.
- 구조: 내일 카드를 absolute footer stack에서 제거하고 오늘 카드 바로 다음 일반 흐름에 배치했다. 측정 간격은 약 7px이다.
- CTA: Demo 1–5, 완제품, 양쪽 플래너, 신청 완료의 단일 주 버튼은 좌우 24px 및 `safe area + 26px` 하단 고정 슬롯을 공유한다.
- 타이포: `이번 주 식단`은 27px에서 23px, 달력 아이콘은 24px에서 22px로 축소했다.
- 시각 확인: 오늘 카드, 내일 카드, 고정 CTA가 390×844 구성 안에서 순서대로 보이며 콘솔 오류·경고는 0건이다.
- Visual verdict: `98 / 100`. 보호 런타임 검사 통과.
- 전체 Playwright 회귀 테스트와 빌드는 누적 수정 종료 시점으로 보류한다.

final result: passed

### 동일 내일 카드·버튼 굵기·체험 3 간결화

- 내일은 오늘과 같은 날짜 헤더, 0 kcal/0g 영양 요약, 아침·점심·저녁 행을 실제로 렌더링한다.
- 오늘 카드는 `flex: 0 0 auto`로 저녁까지 보존하고, 내일 카드만 planner viewport 아래에서 자연스럽게 잘린다.
- CTA는 내일 영양 요약과 다음 행 위에 떠 있어 주간 플래너가 계속된다는 인상을 준다.
- 현재 렌더링된 체험·식단 주 버튼 7개의 계산된 `font-weight`가 모두 900임을 확인했다.
- 체험 3의 `예상 완성 무게` 라벨을 삭제하고 큰 무게와 조리 중 감소 설명만 남겼다.
- 콘솔 오류·경고 0건. Visual verdict `98 / 100`, 보호 런타임 검사 통과.

final result: passed

## 체험 3 저울 LCD 정렬 · 2026-09-04

- Source visual truth: 랜딩 B의 파란 LCD 숫자 스타일과 사용자 요청.
- Rendered implementation: 체험 3의 `jeyuk-on-scale.png` 및 `1,180g` 표시.
- 변경: 숫자 중심을 원본 LCD의 세로 `73.3%`로 옮기고 파란 배경, 진한 monospace 숫자, 테두리, no-glow 스타일을 적용했다.
- 인앱 브라우저에서 체험 1→2→3 흐름과 LCD 정렬을 확인했다. 콘솔 오류·경고 0건.
- Visual verdict: `99 / 100`. 전체 테스트·빌드는 누적 수정 종료 시점으로 보류한다.

final result: passed

### 체험 4 저울 LCD 정렬

- Source visual truth: 사용자 제공 아이폰 미니 스크린샷과 랜딩 B·체험 3의 파란 LCD 스타일.
- 변경: `.portion-visual`을 정사각형으로 만들고 `320g` 중심을 원본 LCD의 세로 `73.3%`에 고정했다. 파란 배경·진한 monospace 숫자·테두리·no-glow를 동일하게 사용한다.
- 기본 인앱 화면과 임시 375×812 브라우저 크기에서 숫자가 LCD 안에 유지되는 것을 확인했다.
- Visual verdict: `99 / 100`. 콘솔 오류·경고 0건.

final result: passed

## 결과 설명 가독성 · 2026-09-04

- Source visual truth: 네 유형 결과 화면의 기존 13.5px 회색 설명과 사용자의 작은 글씨 확대 요청.
- Rendered implementation: `집밥 패스형`, `눈대중 장인`, `성분 추적러`, `프로 계량러` 직접 결과 URL.
- 변경: `.result-description`을 `15px / 1.5`로 높이고 기존 두 줄 내용은 유지했다.
- 판단: 결과 화면은 캐릭터·인용문·체크·전환 문구·CTA가 이미 있으므로 설명을 더 늘리면 핵심 전환 영역을 밀 가능성이 있다. 새 정보가 있을 때만 최대 한 줄 추가한다.
- 브라우저 콘솔 오류·경고: 0건. Visual verdict `96 / 100`.
- 전체 Playwright no-scroll 회귀 테스트는 누적 수정 종료 시점으로 보류한다.

final result: passed

### 결과 위트 문구 복원

- 눈대중 장인: 오늘 제육볶음과 검색한 제육볶음이 같지 않을 수 있다는 문제를 두 줄로 축약했다.
- 집밥 패스형: 재료 7개부터 인간의 영역이 아니라는 농담을 두 줄로 유지했다.
- 성분 추적러: 큰 문구는 `고추장 17g`, 설명은 `앱과 씨름 중 / 의지보다 자동화`로 교체했다.
- 프로 계량러: 세 무게 체크 뒤에 `밥보다 기록이 늦게 끝난다`는 결론을 배치했다.
- 네 화면 모두 15px 설명과 수동 두 줄 줄바꿈을 확인했다. Visual verdict `98 / 100`.

final result: passed

## B Hero 조리 후 무게 기반 칼로리 설명 · 2026-09-04

- Source visual truth: 이번 대화에서 확인한 변경 전 `/?ad_variant=b` 화면과 최신 사용자 승인 구조 `1,420g → 1,083g`, 큰 `총 칼로리는 그대로`, `먹은 300g = 457 kcal`. 별도 `수분 -337g` 문구는 사용하지 않는다.
- Rendered implementation: Codex 인앱 브라우저의 `http://localhost:4173/?ad_variant=b` 라이브 화면. 인앱 브라우저 캡처는 로컬 파일로 내보내지 않고 현재 전달 탭에 유지했다.
- Viewport: 기본 인앱 크기, 임시 `390×844` 모바일, 임시 `430×900` 웹 브라우저 크기에서 같은 상태를 비교한 뒤 기본 크기로 복원했다.
- State: B 광고 유입 직후 Hero.
- Full-view comparison evidence: 변경 전에는 `1,420g / 1,083g / 300g`이 세 행으로 나열됐고, 변경 후에는 조리 전후 화살표, 큰 총칼로리 유지 문구, 457 kcal 결과가 위에서 아래로 연결된다.
- Focused comparison evidence: 오른쪽 계산 카드에서 `457 kcal`가 가장 큰 활자로 보인다. 계산 카드 헤더·하단 결론과 왼쪽 이미지 위아래 라벨은 제거했고, 메인 문구 아래의 제품 효용 보조문구 `집밥도 정확하게 / 식단 기록해요.`는 사용자 요청에 따라 유지한다.

### 필수 품질 표면

- 글꼴·타이포: 카드 헤더는 11.5px, 중요 무게는 12.5px, 결과는 `457` 25px와 `kcal` 14px로 기존 최소 가독성 기준을 유지한다.
- 간격·레이아웃: 기존 5:3 두 열 구조와 CTA 위치를 유지하고, 오른쪽 카드 안에서 변화·원인·결과를 세 구역으로 압축했다.
- 색·토큰: B의 시안 계열과 기존 중립 배경을 유지하며 색상만이 아니라 문구와 화살표로 의미를 함께 전달한다.
- 이미지 품질: 기존 고해상도 `jeyuk-on-scale.png`와 정렬된 LCD 값을 변경하지 않았다.
- 카피·내용: `수분은 빠져도 총칼로리는 그대로`를 명시하고, 기존 C/체험의 `320g = 487 kcal`와 일관되는 `300g = 457 kcal`를 결과로 표시한다.
- 브라우저 콘솔 오류·경고: 0건. 세 확인 크기에서 가로 넘침이 없다.

### 비교 결과

1. 변경 전 `82 / 100`, revise: 무게 세 개가 나열돼 수분 감소와 칼로리 계산의 관계를 사용자가 추론해야 했다.
2. 인과 흐름과 최종 칼로리 결과를 추가했다.
3. 변경 후 `95 / 100`, pass: `무게 감소 → 총칼로리 유지 → 300g의 정확한 kcal`가 한 카드에서 읽힌다.
4. 광고형 간결화 후 `96 / 100`, pass: 같은 의미의 문구를 한 번씩만 남기고 왼쪽은 저울과 LCD만 중앙에 배치했다.
5. 보조문구 복원 후 `97 / 100`, pass: 메인 카피와 증명 영역 사이의 제품 효용 설명을 되살리되 카드 내부 중복은 추가하지 않았다.
6. 총 칼로리 강조 후 `97 / 100`, pass: `수분 -337g`을 삭제하고 `총 칼로리는 그대로`를 14px로 키워 중간 설명을 한 줄로 압축했다.
7. 제목 포인트 색상 조정 후 `98 / 100`, pass: `칼로리가 달라져요`를 `#08A3BD`로 바꿔 기존보다 밝고 부드러운 청록으로 만들고 큰 글자 대비는 약 3:1로 유지했다.
8. B 포인트 색상 통일 후 `98 / 100`, pass: 제목, 조리 후 `1,083g`, `총 칼로리는 그대로`, `457 kcal`를 더 밝은 `#00A8B8`로 통일했다.
9. A/C 대비 포인트 강화 후 `98 / 100`, pass: B 포인트를 선명한 시안 `#00B7D6`으로 올려 A의 코랄과 C의 보라에 가까운 주목도를 확보했다.
10. A/B/C 보조문구 강조 후 `96 / 100`, pass: A `편하게`, B `정확하게`, C `검색 대신`·`내 레시피`에만 각 Hero 색상의 짧은 물결 밑줄을 적용했다.
11. 필기 의미 분리 후 `96 / 100`, pass: 보조문구 글자는 모두 회색으로 돌리고, C `검색`은 코랄 취소선·X로 부정, `내 레시피`는 보라 밑줄·체크로 긍정을 표시했다. A/B는 색을 밑줄에만 사용한다.
12. 글자 밖 필기 장식 후 `94 / 100`, pass: 취소선을 제거하고 A는 밑줄·별·화살표, B는 밑줄·체크·별, C는 `검색` 옆 X와 `내 레시피` 밑줄·체크를 사용해 글자 획을 가리지 않는다.
13. 장식별 사용자 조정 후 `96 / 100`, pass: A 화살표와 B 체크를 삭제하고 B 별은 왼쪽 위로 이동했다. C `내 레시피`는 밑줄·체크 대신 사용자 제공 타원·두 별 래스터를 보라색으로 적용했다.
14. 별 위치와 C 타원 분리 후 `97 / 100`, pass: B 별을 A처럼 오른쪽 위로 옮겼다. C는 ImageGen으로 만든 별 없는 투명 보라 타원과 왼쪽 별 아이콘 한 개를 분리해 글자 가림을 없앴다.
15. A/B 별 간격 조정 후 `98 / 100`, pass: 두 별의 오른쪽 간격을 `-14px → -9px`, 위 간격을 `-9px → -7px`로 줄여 강조 단어에 더 가깝게 붙였다.
16. C 타원 높이 조정 후 `98 / 100`, pass: 타원의 높이를 `56px → 42px`로 줄여 `내 레시피`의 글자 획을 가리지 않게 했다.
17. C 타원 위치 조정 후 `98 / 100`, pass: 타원 중심을 `4px` 아래로 내려 위 줄의 `제육볶음`과 겹치지 않게 했다.
18. C 타원 가로 위치 조정 후 `98 / 100`, pass: 타원 중심을 추가로 `4px` 왼쪽으로 옮겨 `내 레시피` 글자와의 겹침을 줄였다.
19. A 영양성분표 과장 후 `97 / 100`, pass: 오른쪽 결과를 굵은 제목·두꺼운 구분선·큰 `487 kcal`·널찍한 탄단지 세 행으로 구성해 실제 라벨을 연상시키되 촘촘함은 제거했다.
20. A/C 영양성분표 통일 후 `98 / 100`, pass: A 헤더의 기준 문구를 오른쪽 같은 줄로 옮기고 썸네일 아래 재료 문구를 삭제했다. C도 같은 표 구조를 사용하며 제목·열량·결론은 보라색으로 구분했다.
21. 제목 포인트 범위 정리 후 `98 / 100`, pass: A는 `영양성분`, B는 `칼로리`만 색을 남겨 뒤 문장과 문장부호를 검게 연결했다. C 카드의 `영양성분`도 검은색으로 바꾸고 결과·결론만 보라색으로 유지했다.
22. C 이미지 캡션 재배치 후 `98 / 100`, pass: `내 제육볶음 레시피`를 이미지 아래로 옮기고 14.5px로 유지했다. 사진 영역을 5:4로 맞추고 재료·설명 문구는 제거했다.
23. Hero CTA 글자 굵기 조정 후 `99 / 100`, pass: 공통 버튼 문구의 굵기를 `850 → 900`으로 높이고 버튼 크기와 간격은 유지했다.

## 유형 테스트·체험 통합 프로그레스 · 2026-09-04

- Source visual truth: Product Design ideation의 첫 번째 표시 결과 `/Users/shj/.codex/generated_images/01a06af2-35ce-7443-a6cf-7a54528a36fc/exec-2ce66ab9-40da-47c6-9a19-dd86ac27b493.png`와 사용자의 `왼쪽 위 파란폰트 제목은 빼고` 지시.
- Rendered implementation: Codex 인앱 브라우저의 유형 테스트 1/4, 체험 1/5, 체험 2/5 라이브 화면.
- Viewport/state: 현재 인앱 모바일 화면. 원형 뒤로가기·진행 segment·오른쪽 count가 한 줄이며 질문은 4개, 체험은 5개 segment다.
- 글꼴·타이포: 별도 파란 흐름 제목 없이 오른쪽 현재 숫자만 17px/950/브랜드 블루, 나머지 count는 15px 중립색이다.
- 간격·레이아웃: 헤더를 `44px / 유동 progress / 44px count` 3열로 구성한다. 완료와 남은 segment는 7px, 현재 segment는 9px 높이와 1.35배 너비다.
- 색·토큰: 완료·현재는 `--mumeok-blue`, 남은 단계는 `#DCEFFF`를 사용한다.
- 이미지 품질: 새 래스터 자산 없이 기존 원형 뒤로가기 아이콘과 CSS progress만 사용한다.
- 카피·내용: 질문 `N / 4`, 체험 `N / 5`만 표시하고 `유형 테스트`, `20초 체험`, `체험 N / 5 · 단계명` 같은 별도 제목은 노출하지 않는다.
- 브라우저 확인: 유형 테스트 1/4, 체험 1/5와 2/5에서 segment 수·현재 강조·count를 확인했다. 콘솔 오류·경고는 0건이다.
- Visual verdict: `98 / 100`. P0/P1/P2 잔여 문제 없음.
- 보호 런타임 무결성 검사 통과. 전체 Playwright 테스트와 빌드는 누적 수정 종료 시점으로 보류한다.

final result: passed
22. 공통 CTA·신뢰 행 변경 후 `98 / 100`, pass: 버튼을 `내 집밥기록 유형 알아보기`로 바꾸고 4문항·로그인 없이·결과 바로 확인 앞에 파란 문서·자물쇠·번개 아이콘과 회색 구분선을 적용했다.
20. B 총 칼로리 설명색 조정 후 `98 / 100`, pass: `총 칼로리는 그대로`를 `#27313A`로 바꿔 설명은 검은색, 변화값과 `457 kcal`는 시안색으로 분리했다.
19. A 증명 영역 재설계 후 `96 / 100`, pass: 메인 제목·보조문구는 유지하고 아래를 YouTube 영상, 재료·양 자동 추출, `487 kcal` 영양성분 결과로 구분해 중복 재료 목록을 제거했다.

P0/P1/P2 잔여 문제 없음. 전체 회귀 테스트와 빌드는 사용자가 요청한 누적 수정 종료 시점으로 보류한다.

final result: passed

## 완성 저울·식단 CTA·신청 완료 축하 · 2026-09-04

- Source visual truth: `evidence/design-qa/celebration-scale-before/`의 체험 3·4, 두 식단, 신청 완료 화면과 사용자의 5개 수정 지시.
- Rendered implementation: `evidence/design-qa/final/04c-demo-3.png`, `04d-demo-3-confirmed.png`, `05-demo-4.png`, `07-planner-homecook.png`, `09-planner-complete.png`, `11-success.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. 모든 상태의 `scrollHeight`와 `clientHeight`가 844px로 일치한다.
- Full-view comparison evidence: `evidence/design-qa/celebration-scale/demo-3-before-after.png`, `demo-4-before-after.png`, `planner-before-after.png`, `success-before-after.png`.
- Focused evidence는 필요하지 않았다. 저울 LCD, CTA 경계, 단백질 음료 행, 별 배치는 전체 화면 비교에서 충분히 읽힌다.

### 필수 품질 표면

- 글꼴·타이포: `1,180g`과 `320g`을 저울 LCD 안에 실제 고대비 monospace 텍스트로 표시했다. 기존 제목·CTA 크기는 유지했다.
- 간격·레이아웃: 체험 3의 완성 음식 저울은 230×230px 영역을 사용한다. 식단 CTA는 내일 카드 밖의 화면 기준 좌우 24px에 배치돼 다른 CTA와 폭·x/y가 1px 이내로 같다.
- 색·토큰: LCD는 연녹색 숫자, 축하 별은 브랜드 블루·노랑·코랄·초록·보라를 사용한다. CTA는 공통 브랜드 블루다.
- 이미지 품질: 기존 고해상도 `jeyuk-on-scale.png`와 최종 파란 하트 캐릭터를 그대로 사용하며 크롭·투명도 손상이 없다.
- 카피·내용: 체험 3 `1,180g`, 체험 4 `320g`, 저녁의 제육볶음·단백질 음료가 모두 온전히 보인다.

### 비교 반복과 결과

1. `88 / 100`, revise: 체험 4의 첫 보정값에서 `320g`이 LCD 상단에 걸렸다.
2. 출력 박스 중심을 저울 영역의 약 70% 지점으로 조정했다.
3. `96 / 100`, pass: 두 저울 숫자가 표시창 안에 있고, 식단 CTA와 단백질 음료가 잘리지 않으며, 완료 축하 효과가 캐릭터 주변에 안정적으로 배치됐다.
- 캡처 콘솔 오류·경고: 0건. Playwright 26개, Sites 4개, 프로덕션 빌드와 보호 런타임 검사 통과.

final result: passed

## 체험 진행 바·식단 저녁·베타 로고 위치 안정화 · 2026-09-04

- Source visual truth: `evidence/design-qa/layout-stability-before/`의 체험 1·2·3, 완제품 식단, 베타 화면과 사용자의 5개 위치 수정 지시.
- Rendered implementation: `evidence/design-qa/final/03a-demo-1.png`, `04-demo-2.png`, `04d-demo-3-confirmed.png`, `09-planner-complete.png`, `10-beta.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. 모든 비교는 같은 상태와 크기다.
- Full-view comparison evidence: `evidence/design-qa/layout-stability/demo-nav-before-after.png`, `demo-2-before-after.png`, `demo-3-before-after.png`, `planner-product-before-after.png`, `beta-before-after.png`.
- Focused evidence는 필요하지 않았다. 위치 변화와 잘림 여부가 390×844 전체 화면에서 충분히 판별된다.

### 필수 품질 표면

- 글꼴·타이포: 기존 글꼴 크기와 굵기는 유지했다. 체험 진행 텍스트는 복원하지 않고 진행 pill만 사용한다.
- 간격·레이아웃: 진행 바는 284px에서 144px로 줄여 오른쪽 정렬했다. 체험 2 안내 패딩은 10px/12px, 체험 3 안내 슬롯은 44px 고정이다. 내일 카드는 하단에 고정돼 오늘 저녁을 밀지 않는다.
- 색·토큰: 진행 pill, 체험 CTA, 플래너 강조, 베타 로고의 기존 브랜드 블루를 유지했다.
- 이미지 품질: 레시피·저울·제품·캐릭터 이미지는 크롭이나 비율 변경 없이 유지했다.
- 카피·내용: 여섯 재료, 수분 반영 안내, 제육볶음과 단백질 음료, 베타 문구가 모두 온전히 보인다.

### 상호작용과 결과

- 체험 1~5의 진행 pill은 오른쪽 같은 기준선에 있고 현재 단계만 누적 파란색으로 표시된다.
- 체험 2의 설탕 행과 버튼이 잘리지 않는다. 체험 3 반영 전후 버튼 y 위치는 1px 이내로 동일하다.
- 완제품 삽입 후 제육볶음과 단백질 음료가 모두 보이고 내일 카드는 CTA 뒤 하단 배경으로 남는다.
- 베타 로고와 뒤로가기는 같은 행에서 수직 중앙이 4px 이내로 일치한다.
- 캡처 콘솔 오류·경고: 0건. Playwright 26개, Sites 4개, 프로덕션 빌드와 보호 런타임 검사 통과.
- Visual verdict: `96 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## A/B/C Hero 합성 이미지 → 실제 UI · 2026-09-04

- Source visual truth: `/var/folders/c1/gv7thy6n54d76f_rvnxdwlzm0000gn/T/codex-clipboard-bd0b33ca-e1d8-439a-b921-c64c5ed19950.png`, `codex-clipboard-7dd616c2-cfce-422e-9420-d931b823cc77.png`, `codex-clipboard-8d726f9c-e824-44b7-ab6c-208552af6f3e.png`의 빨간 글자 확대·파란 시각 확대 표시.
- Rendered implementation: `evidence/design-qa/final/00-hero-a.png`, `00-hero-b.png`, `00-hero-c.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. Hero 증명 영역은 전부 `390×234`의 5:3 실제 UI다.
- Full-view comparison evidence: `evidence/design-qa/hero-live/a-before-after.png`, `b-before-after.png`, `c-before-after.png`.
- Focused comparison evidence: `evidence/design-qa/hero-live/a-focused.png`, `b-focused.png`, `c-focused.png`. 참고안 카드 영역과 실제 UI 영역을 같은 390px 폭으로 정규화했다.

### 필수 품질 표면

- 글꼴·타이포: 합성 이미지 속 작은 글자를 없애고 카드 헤더 12.5px, 재료·단계명 10.5~11.8px, 핵심 수치 12.6~16px, C `kcal` 14px 실제 텍스트로 렌더링했다.
- 간격·레이아웃: 두 카드와 28px 화살표 열을 기존 5:3 영역에 유지했다. B는 저울 사진과 섭취량 배지를 별도 세로 공간으로 분리해 겹침을 제거했다.
- 색·토큰: A 코랄·브랜드 블루, B 앰버·시안·코랄, C 보라·앰버·코랄의 기존 의미 색을 유지했다.
- 이미지 품질: A/C는 고해상도 접시 사진, B는 고해상도 저울 사진만 raster로 사용한다. 사진은 카드 폭을 더 크게 차지하며 텍스트·선·아이콘은 브라우저에서 선명하게 렌더링된다.
- 카피·내용: `600g / 200g / 100g`, `1,420g / 1,083g / 300g`, `487 kcal / 31g / 39g / 22g`을 참고안과 동일하게 유지했다.

### 비교 반복과 결과

1. `87 / 100`, revise: 첫 실제 UI 렌더에서 B의 LCD 숫자와 `먹은 양 300g` 배지가 겹쳤다.
2. B 사진 영역 아래에 36px 배지 공간을 예약하고 LCD를 사진 내부로 올렸다.
3. `96 / 100`, pass: A/B/C 모두 글자가 커지고 선명하며, 사진 비중이 커졌고, 잘림·겹침 없이 무스크롤을 유지한다.
- 캡처 콘솔 오류·경고: 0건. Playwright 26개, Sites 4개, 프로덕션 빌드와 보호 런타임 검사 통과.

final result: passed

## 체험 수동 확인·오늘 요약·베타 신청 재배치 · 2026-09-04

- Source visual truth: `/var/folders/c1/gv7thy6n54d76f_rvnxdwlzm0000gn/T/codex-clipboard-9d6440ff-86bc-4218-a4d6-313f4b9f9516.png`, `/var/folders/c1/gv7thy6n54d76f_rvnxdwlzm0000gn/T/codex-clipboard-7cd2c0f0-ba86-4840-8e0e-f2a561537e35.png`, 변경 전 `evidence/design-qa/manual-confirmation-before/` 화면과 사용자의 9개 지시.
- Rendered implementation: `evidence/design-qa/final/03c-demo-1-done.png`, `04-demo-2.png`, `04b-demo-2-adjusted.png`, `04d-demo-3-confirmed.png`, `06-demo-5.png`, `07-planner-homecook.png`, `09-planner-complete.png`, `10-beta.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. `[data-testid="device-screen"]`을 1:1로 캡처했다.
- Full-view comparison evidence: `evidence/design-qa/manual-confirmation/demo-2-initial-before-after.png`, `demo-3-confirmed-before-after.png`, `planner-homecook-before-after.png`, `beta-layout-reference.png`.
- Focused comparison evidence: `evidence/design-qa/manual-confirmation/beta-consent-reference.png`. 이메일·필수 동의·접힌 상세를 첨부 화면과 같은 크기의 집중 영역으로 비교했다.

### 필수 품질 표면

- 글꼴·타이포: 체험 5의 `제육볶음 320g`을 `487 kcal`에 붙이고, 베타 제목을 26px로 키워 캐릭터 옆 작은 글씨 문제를 해소했다. 이메일 동의는 14px, 상세 토글은 13px이다.
- 간격·레이아웃: 체험 1·2·3은 같은 하단 슬롯에서 작업 버튼이 `다음`으로 교체된다. 체험 3 완료 화면 높이는 `680px`, 집밥 플래너는 `704px`, 완제품 플래너는 `745px`로 `844px` 화면에서 스크롤이 없다.
- 색·토큰: 기존 브랜드 블루와 플래너 반영 하이라이트를 유지했다. 베타 화면은 흰 배경과 중립 회색 설명으로 첨부안의 차분한 위계를 따른다.
- 이미지 품질: 새 이미지나 대체 캐릭터를 만들지 않고 기존 알파 투명 소금병 캐릭터와 공식 가로 로고를 원본 비율로 사용했다.
- 카피·내용: 베타 설명, placeholder, 필수 동의, 상세 토글을 확정 문구로 교체했고 수집 항목·목적·보유기간 본문은 상세 안에 유지했다.

### 상호작용과 결과

- 체험 1·2·3의 완료 상태는 사용자가 `다음`을 누르기 전까지 유지된다.
- 체험 3은 720ms 동안 `1,200 → 1,180g` 중간 숫자가 실제로 렌더링되고 확대 효과와 함께 끝난다.
- 두 플래너의 오늘 영양 요약은 오늘 카드 안에 있으며 CTA는 내일 미리보기 위에서 한 화면에 남는다.
- 베타 상세는 기본으로 접혀 있고 사용자가 눌렀을 때 수집 항목·목적·보유기간을 보여준다.
- 캡처 콘솔 오류·경고: 0건. 전체 Playwright 26개, Sites 4개, 프로덕션 빌드와 보호 런타임 검사 통과.
- Visual verdict: `95 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## B·C 광고 A 형식 정렬 · 2026-09-04

- Source visual truth: `public/assets/funnel/ads/ad-a-4x5.png` (`1080×1350`).
- Rendered implementation: `public/assets/funnel/ads/ad-b-4x5.png`, `public/assets/funnel/ads/ad-c-4x5.png` (각 `1080×1350`).
- Viewport and density: 정적 광고 캔버스 `1080×1350`, DPR 1. 세 이미지를 같은 픽셀 크기로 비교했다.
- State: A/B/C 4:5 피드 광고의 기본 정적 상태.
- Full-view comparison evidence: `evidence/design-qa/ad-abc-match/full-round-2.png` (`3288×1350`).
- Focused comparison evidence: `evidence/design-qa/ad-abc-match/top-round-2.png` (`3288×570`), `bottom-round-2.png` (`3288×270`).

### 필수 품질 표면

- 글꼴·타이포: B/C 제목은 A와 같은 `108px / 1.12 / 950` 위계를 사용하며, 글자 시작선은 A와 같은 `y=171`에 맞췄다. 로고는 A의 실제 경계 `x=67..330`, `y=46..132`와 1px 이내다.
- 간격·레이아웃: 보조 문구는 제목 아래 A의 리듬에 맞춰 위로 당겼고, 주 시각물 시작점은 유지했다. CTA 경계는 A `x=66..994`, `y=1131..1244`와 B/C `x=66..994`, `y=1130..1243`으로 1px 이내다.
- 색·토큰: 공통 로고·CTA 브랜드 블루는 유지하고, B의 시안/앰버와 C의 보라/코랄 메시지 강조색은 의도적으로 보존했다.
- 이미지 품질: B의 세 조리 단계와 C의 음식·영양 패널 원본을 크롭 없이 유지했다. 낙서 PNG의 알파 가장자리와 저울 LCD 숫자에도 깨짐이 없다.
- 카피·내용: 제목, 보조 문구, CTA `30초 집밥 기록 테스트`, 신뢰 문구 `4문항 · 로그인 없이 · 결과 바로 확인`은 확정 문구를 유지한다.

### 비교 반복 기록

1. `88 / 100`, revise: B/C 제목 시작과 보조 문구가 A보다 아래였고, CTA 아래 신뢰 문구 기준선도 미세하게 달랐다.
2. 제목을 4px, 보조 문구를 추가 5px 위로 옮기고 시각물 시작 여백을 보정했다. 신뢰 문구는 A와 같은 폭에 가깝도록 확대·압축했다.
3. `92 / 100`, pass: 로고→제목→보조 문구→시각물의 흐름과 CTA·신뢰 문구가 하나의 캠페인 형식으로 정렬됐다. B 제목 밀도와 C 영양 패널 비중은 메시지별 콘텐츠 차이로 허용했다.

### 브라우저 확인

- Codex 인앱 브라우저에서 B/C PNG를 각각 직접 열어 전체 캔버스가 잘림 없이 표시되는 것을 확인했다.
- 정적 광고이므로 주요 인터랙션은 해당 없음.
- 브라우저 콘솔 오류·경고: 0건.
- P0/P1/P2 잔여 문제: 없음.

final result: passed

## B·C 광고 위계·고유 낙서 개선 · 2026-09-04

- Source visual truth: 사용자가 가장 눈에 띈다고 선택한 `public/assets/funnel/ads/ad-a-4x5.png` (`1080×1350`).
- Rendered implementation: `public/assets/funnel/ads/ad-b-4x5.png`, `ad-c-4x5.png`와 대응하는 `9x16` 파일.
- Combined comparison evidence: `evidence/design-qa/ad-abc-compare/full-v2.png`. A/B/C를 동일한 `432×540` 크기로 정규화해 한 화면에서 비교했다.
- 글꼴·타이포: B·C 로고는 `300px`, 제목은 `72px`, CTA는 `112px/40px`로 키웠다. B `달라진 무게`, C `내 레시피 기준`만 각 강조색과 굵은 글씨로 표시했다.
- 간격·레이아웃: 낙서를 보조 문구 왼쪽에 독립 영역으로 두어 본문을 가리지 않는다. B의 세 단계 라벨·LCD 무게와 C의 섭취량·열량·탄단지 숫자도 휴대폰 축소 화면에서 읽히도록 확대했다.
- 색·토큰: B는 청록·시안, C는 보라·코랄을 사용하고 공통 CTA는 브랜드 블루를 유지했다.
- 이미지 품질: B의 김·물방울·아래 화살표와 C의 영양 체크 카드·반짝임은 ImageGen으로 만든 뒤 실제 알파 투명 PNG로 정리했다. 흰 사각형 배경, 깨진 가장자리, 잘림이 없다.
- 카피·내용: B 낙서는 조리 중 수분과 무게 감소를, C 낙서는 내 레시피의 영양성분표 완성을 보강한다. A의 실타래·강조선은 복제하지 않았다.
- 4:5와 9:16 모두 핵심 정보와 CTA가 잘리지 않는다. A 4:5 운영 파일의 SHA-256은 `30e9bfce95bd2d1e22ec8eecd86aad9d51daa2ba17da2745804bb3d2d567be5b`로 유지됐다.
- Visual verdict: `94 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## A 광고 v7 브랜드 블루 동기화 · 2026-09-04

- Source visual truth: `public/assets/funnel/ads/ad-a-4x5-v7.png` (`1080×1350`). 다른 세션에서 파란 강조선 위치까지 확정한 최종본이다.
- Rendered implementation: `public/assets/funnel/ads/ad-a-4x5.png` (`1080×1350`).
- Combined comparison evidence: `evidence/design-qa/ad-a-brand-sync/v7-to-brand-blue.png` (`2172×1350`). 왼쪽 원본과 오른쪽 운영 파일을 동일 크기로 나란히 비교했다.
- 집중 비교: 상단 무먹 심볼·`먹든` 글자와 하단 CTA 배경을 확인했다. 로고와 CTA는 B·C의 밝은 브랜드 블루와 일치하고, 제목·물결 밑줄·검은 낙서·강조선·사진·재료·검색 화면·신뢰 문구는 v7과 동일하다.
- 생성 안정성: `npm run generate:ads` 전후 A 4:5 SHA-256이 `30e9bfce95bd2d1e22ec8eecd86aad9d51daa2ba17da2745804bb3d2d567be5b`로 동일해 수동 확정 파일이 덮어써지지 않는다.
- P0/P1/P2 잔여 문제: 없음.
- P3: A 9:16은 별도 Reels 안전영역용 배치이며 4:5 v7의 단순 확대본이 아니다.

final result: passed

## 광고 문제 → 랜딩 해결 전환 · 2026-09-04

### 비교 기준과 정규화

- Source visual truth: `public/assets/funnel/ads/ad-a-4x5.png`, `ad-b-4x5.png`, `ad-c-4x5.png` (`1080×1350`)과 `docs/product-decisions.md` D-17의 확정 카피.
- Rendered implementation: `evidence/design-qa/final/00-hero-a.png`, `00-hero-b.png`, `00-hero-c.png` (`390×844`, CSS viewport `390×844`, DPR 1).
- Combined comparison evidence: `evidence/design-qa/ad-landing/a-ad-to-landing.png`, `b-ad-to-landing.png`, `c-ad-to-landing.png` (`792×844`). 왼쪽 광고를 `390px` 열로 정규화하고 오른쪽 모바일 랜딩과 같은 높이로 한 이미지 안에서 비교했다.
- Focused evidence: `public/assets/funnel/hero/hero-a-solution.png`, `hero-b-solution.png`, `hero-c-solution.png` (`1000×600`). 해결 상태의 작은 라벨, 무게, 영양 수치를 원본 크기로 확인했다.
- 상태: 각 A/B/C 광고 유입 직후 Hero. 테스트 CTA까지 한 화면에 표시된다.

### 필수 품질 표면

- 글꼴·타이포: 광고의 질문형 제목과 랜딩의 답변형 제목이 같은 굵기와 강조색을 유지한다. A `영양성분 계산까지`, B `칼로리가 달라져요`, C `영양성분표`만 색으로 강조하며 줄바꿈과 보조 문구가 확정 카피와 일치한다.
- 간격·레이아웃: A/B/C 랜딩 solution은 모두 5:3이고 CTA 위에서 잘리지 않는다. 9:16 광고는 핵심 요소를 `y=270..1248`에 모으고 하단 35%를 플랫폼 UI용 배경으로 남긴다.
- 색·토큰: A 코랄, B 시안, C 보라의 인지 단서는 광고와 랜딩 사이에 유지된다. 공통 CTA만 브랜드 블루다.
- 이미지 품질: 기존 제육볶음 원본과 B 조리 단계 원본을 재사용했다. 랜딩은 광고 이미지를 복제하지 않고 별도 `hero-*-solution.png`를 사용한다. 사진 크롭, 저울 LCD, 카드 테두리와 그림자에 깨짐이 없다.
- 카피·내용: 광고는 반복 입력·조리 무게·영양성분표 질문을 제시하고, 랜딩은 자동 정리·조리 후 무게 반영·내 레시피 영양성분표 완성으로 한 단계 진행한다.

### 전체·집중 비교 결과

- 전체 비교: 세 경로 모두 같은 음식과 색을 유지해 유입 연속성이 있고, 제목과 시각 상태는 문제에서 해결로 바뀌어 중복 화면처럼 보이지 않는다.
- 집중 비교: B solution 저울의 `1,083g`, 계산 카드의 `1,420g / 1,083g / 300g`, C의 `487 kcal / 31g / 39g / 22g`, A의 자동 정리 완료 행을 원본 크기로 확인했다.
- 주요 인터랙션: A/B/C 모두 `테스트 시작하기`로 동일한 4문항 흐름에 진입한다.
- 캡처 콘솔 오류·경고: 0건.

### 비교 반복 기록

1. `74 / 100`: 광고와 랜딩이 같은 질문·같은 시각을 반복하고 9:16 CTA가 안전영역 밖에 위치함.
2. `86 / 100`: 별도 solution 시각과 Reels 안전영역을 적용했으나 B solution 저울 디스플레이가 비어 있음.
3. `97 / 100`: B 저울에 `1,083g` LCD를 추가하고 모바일 A/B/C 결합 비교에서 P0/P1/P2 없음.

### 남은 P3

- 9:16 하단의 큰 빈 공간은 Reels UI 중첩을 피하기 위한 의도적 안전영역이다. 실제 업로드 전 Meta 광고 관리자 placement preview 확인이 필요하다.

final result: passed

## 랜딩 실기기 가독성·변화 강조 · 2026-09-04

- Source visual truth: 변경 전 `evidence/design-qa/landing-polish-before/`의 Hero A, 체험 3, 두 플래너, 베타 화면과 사용자의 다섯 수정 지시.
- Rendered implementation: `evidence/design-qa/final/00-hero-a.png`, `00-hero-b.png`, `00-hero-c.png`, `04d-demo-3-confirmed.png`, `07-planner-homecook.png`, `09-planner-complete.png`, `10b-beta-email-focus.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. 기기 외곽 없이 `[data-testid="device-screen"]`을 1:1로 캡처했다.
- Full-view comparison evidence: `evidence/design-qa/landing-polish/hero-a-before-after.png`, `demo-3-before-after.png`, `planner-homecook-before-after.png`, `planner-product-before-after.png`, `email-focus-before-after.png`.
- Focused evidence: Hero 내부 라벨은 전폭 확장 화면에서, 체험 3의 `1,180g`은 버튼 직후, 플래너는 count-up 도중, 이메일은 실제 포커스 상태에서 각각 캡처했다.

### 필수 품질 표면

- 글꼴·타이포: Hero 보조 문구를 15px에서 17px로 키웠고, 전폭 이미지 확장으로 이미지 속 라벨과 값도 약 14% 커졌다.
- 간격·레이아웃: 상단 상태바 높이 42px를 제거하고 콘텐츠 시작 여백을 26px로 통일했다. 모든 CTA와 하단 안전영역은 화면 안에 유지된다.
- 색·토큰: 무게 변경은 브랜드 블루, 집밥 영양 반영은 블루, 완제품 영양 반영은 보라색 링으로 구분한다.
- 이미지 품질: Hero PNG는 비율을 유지한 `object-fit: contain`으로 화면 폭만 확대해 크롭이나 깨짐이 없다. 기존 음식·제품·캐릭터 자산은 변경하지 않았다.
- 카피·내용: 문구와 영양 수치는 유지하고 가독성과 상태 변화만 강화했다.

### 상호작용과 결과

- 체험 3 버튼을 누르면 `1,180g` 숫자가 확대·착지하고 안내가 나온 뒤 다음 화면으로 이동한다.
- 두 플래너에서 음식 행이 먼저 들어온 뒤 네 영양 카드가 순차 상승하며 count-up 된다.
- 이메일 입력 포커스에서도 이미지 키보드는 열리지 않고 폼 전체가 그대로 보인다.
- 캡처 콘솔 오류·경고: 0건.
- Visual verdict: `96 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed

## A/B/C 공통 로고·CTA 동기화와 B 효과 교체 · 2026-09-04

- Source visual truth: 사용자가 지정한 A/B/C 4:5 광고와 기존 B 효과 캡처 `codex-clipboard-1c8d025e-80f9-4593-ab00-2a1d07c73d99.png`.
- Rendered implementation: `public/assets/funnel/ads/ad-a-4x5.png`, `ad-b-4x5.png`, `ad-c-4x5.png`, 대응하는 `ad-a-9x16.png`, `ad-b-9x16.png`, `ad-c-9x16.png`.
- Viewport and density: 피드 `1080×1350`, 릴스 `1080×1920`, DPR 1.
- Full-view comparison evidence: `evidence/design-qa/ad-shared-chrome-effect/full-final.png`, `story-final.png`.
- Focused comparison evidence: `shared-logo.png`, `shared-button.png`, `b-effect-before-after.png`.

### 필수 품질 표면

- 글꼴·타이포: A/B/C CTA의 글자 크기·굵기·자간을 같은 규칙으로 통일했다. B의 `몇 kcal`와 `달라진 무게`는 새 손그림과 같은 딥 틸→밝은 시안 그라데이션을 사용한다.
- 간격·레이아웃: 4:5 로고 상자는 `x=49..483`, `y=30..149`, CTA 파란 경계는 `x=66..994`, `y=1131..1244`로 세 광고가 같다. 9:16 CTA는 `x=78`, `y=1050`, `924×78`로 고정했다.
- 색·토큰: 공통 로고와 CTA는 같은 브랜드 블루를 사용한다. B의 강조색만 조리 무게 손그림과 맞춘 틸/시안으로 조정했다.
- 이미지 품질: 새 B 효과 `public/assets/funnel/decor/doodle-b-cooking-weight.png`는 `900×900` 실제 알파 투명 PNG다. 팬·저울·김·짧은 하향 표시가 하나의 스케치로 연결되며 흰 상자나 투명 가장자리 번짐이 없다.
- 카피·내용: A/B/C 문구와 수치, A의 승인된 본문 구성은 변경하지 않았다.

### 정확도와 비교 반복 기록

1. 새 효과 초안 `84 / 100`, revise: 팬·저울 의미는 좋아졌지만 체크무늬가 불투명 배경으로 포함되고 바깥 여백이 컸다.
2. 중성 체크무늬를 실제 알파로 제거하고 정사각형으로 크롭해 효과 자산 `92 / 100`, pass.
3. 4:5 로고 상자와 CTA 내부의 A↔B, B↔C 변경 픽셀은 각각 `0`; CTA 파란 픽셀 경계와 픽셀 수 `97,617`도 세 광고가 동일하다. 최종 시각 판정 `96 / 100`, pass.
4. 9:16 로고와 CTA 내부의 A↔B, B↔C 변경 픽셀도 각각 `0`. 최종 시각 판정 `97 / 100`, pass.

### 브라우저 확인

- 정적 광고이므로 주요 인터랙션은 해당 없음.
- Codex 인앱 브라우저에서 최종 A/B/C 4:5 PNG를 각각 직접 열어 전체 캔버스와 새 B 효과를 확인했다.
- 브라우저 콘솔 오류·경고: 0건.
- P0/P1/P2 잔여 문제: 없음.

final result: passed

## 전체 무스크롤·고정 식단 CTA · 2026-09-04

- Source visual truth: `evidence/design-qa/no-scroll-before/`의 설문·체험·식단·베타·완료 캡처와 사용자의 9개 무스크롤 지시.
- Rendered implementation: `evidence/design-qa/final/02-question-1.png`, `03a-demo-1.png`, `04-demo-2.png`, `07-planner-homecook.png`, `09a-planner-complete-initial.png`, `09-planner-complete.png`, `10-beta.png`, `11-success.png`.
- Viewport: CSS `390×844`, DPR 1, 캡처 픽셀 `390×844`. 모든 화면에서 `.mobile-scroll`의 `scrollHeight`와 `clientHeight`가 `844px`로 일치한다.
- Full-view comparison evidence: `evidence/design-qa/no-scroll/question-before-after.png`, `demo-header-before-after.png`, `planner-before-after.png`, `beta-before-after.png`, `success-before-after.png`.
- Focused comparison evidence: `evidence/design-qa/no-scroll/planner-cta-fixed.png`. 단백질 음료 삽입 전과 영양 count-up 중 CTA 기준선을 같은 크기로 비교했다.

### 필수 품질 표면

- 글꼴·타이포: 설문·체험 본문 크기는 유지하고 중복 단계 제목만 제거했다. 베타와 완료 카피의 줄바꿈·크기에는 변화가 없다.
- 간격·레이아웃: 설명 없는 질문의 고정 높이, 체험의 두 번째 진행 행, 주간 날짜 박스 패딩, 베타 상단 여백을 줄였다. 모든 주요 CTA가 홈 인디케이터 위에서 잘리지 않는다.
- 색·토큰: 신청 완료 CTA를 브랜드 블루 기본 버튼으로 통일했다. 기존 영양 반영 블루·보라 강조는 유지했다.
- 이미지 품질: 음식·제품·캐릭터·로고의 크롭과 원본 비율을 유지했다. 레이아웃 압축으로 인한 이미지 잘림이 없다.
- 카피·내용: 화면 제목·질문·영양 수치·개인정보 문구는 유지하고 `체험 N / 5 · 단계명` 중복 텍스트만 제거했다.

### 상호작용과 결과

- 설문 4개, 결과, 체험 1~5, 집밥 식단, 완제품, 완제품 반영 식단, 베타, 완료까지 세로 스크롤이 비활성화돼 있다.
- 식단 좌우 주 이동 버튼은 ChevronLeft/ChevronRight 한 쌍이고 주간 날짜 박스 높이는 46px이다.
- 완제품 반영 전후 CTA의 y 위치는 픽셀 단위로 동일하다.
- 캡처 콘솔 오류·경고: 0건. Playwright 26개, Sites 4개, 프로덕션 빌드와 보호 런타임 검사 통과.
- Visual verdict: `96 / 100`. P0/P1/P2 잔여 문제 없음.

final result: passed
