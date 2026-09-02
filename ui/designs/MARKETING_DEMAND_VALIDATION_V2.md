# MARKETING_DEMAND_VALIDATION_V2 — `/beta` 4문항 수요검증 퍼널

> 기준 문서: 요구사항기준선 v1.7.36 / 화면정의서 v1.5.40 / 유저 Flow맵 v1.3.38
> 관련 명세: `docs/marketing/quiz-content-spec.md`, `docs/marketing/demand-validation-plan.md`
> source prototype: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
> 생성일: 2026-09-03
> Design Status: `temporary` — high-risk 신규 화면. Stage 4 구현 스크린샷과 독립 Stage 5/final authority 전에는 `confirmed` 금지

## 설계 범위와 우선순위

- 운영 화면은 Next.js의 app-owned `/beta` surface만 포함한다.
- source의 `src/Prototype.tsx`, `src/prototype.css`, `public/assets/funnel/`를 시각·인터랙션 기준으로 사용하되 현재 앱 shell, 공용 컴포넌트, 접근성, 모션 정책에 맞게 포팅한다.
- iPhone/Pixel frame, device selector, `src/mobile/`, standalone keyboard/status bar/runtime, standalone root CSS는 운영 bundle과 캡처 대상에서 제외한다.
- `/beta`는 public no-login funnel이며 하단 4탭과 로그인 게이트를 렌더하지 않는다. 실제 `PLANNER_WEEK` anchor screen을 수정하거나 진입시키지 않고, 퍼널 안의 read-only planner payoff만 보여준다.
- 세로 이동은 `/beta` app-owned content scroller 하나에만 둔다. page-level horizontal scroll과 중첩 세로 스크롤은 금지한다.
- 기준 폭은 393px, 작은 모바일 sentinel은 320px이다. 좌우 패딩은 기본 `--space-5`(20px), 320px에서는 최소 `--space-4`(16px)를 유지한다.

## 레이아웃 와이어프레임

### 1. Hero → 4문항 Quiz

```text
┌─────────────────────────────────┐  ← 393px app-owned viewport
│ [무먹 심볼] 무엇을 먹든         │  ← --surface, --text-2
│                                 │
│ 집밥 기록 30초 테스트           │  ← --brand-primary, text-sm
│ 집밥도 정확하게 기록할 수       │
│ 있을까?                         │  ← --foreground, text-3xl
│ 30초 테스트로 나의 집밥 기록…   │  ← --text-2
│ ┌─────────────────────────────┐ │
│ │ Hero a|b|c|d|default 시각   │ │  ← --surface, --radius-panel
│ └─────────────────────────────┘ │
│                                 │
│ [ 테스트 시작하기          → ]  │  ← --brand-primary, 48px+
│ 4문항 · 로그인 없이 · 결과 즉시 │  ← --text-3
└─────────────────────────────────┘

┌─────────────────────────────────┐  ← Q1 예시, Q1~Q4 동일 골격
│ [←]                      1 / 4  │  ← 44×44px / --brand-primary
│ ━━━━━━━╺━━━━━━━━━━━━━━━━━━━━━━  │  ← role=progressbar
│                                 │
│ 평소 칼로리나 탄단지를          │
│ 얼마나 자주 기록하나요?         │  ← --foreground, text-xl~2xl
│                                 │
│ ┌ 거의 매일               ○ ┐  │
│ └───────────────────────────┘  │  ← --surface, --border, 52px+
│ ┌ 주 3~5일                ○ ┐  │
│ └───────────────────────────┘  │
│ ┌ 주 1~2일                ○ ┐  │
│ └───────────────────────────┘  │
│ ┌ 거의 안 함 / 안 함      ○ ┐  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
```

- Hero source는 known `utm_content` → `ad_variant` → `default`로 결정된 resolved Hero만 표시한다. Q1 이후 UI와 데이터는 Hero와 무관하게 동일하다.
- Q1에도 Hero로 돌아가는 `[←]`가 있고 Q2~Q4는 직전 질문으로 돌아간다. 이전 답변과 선택 상태를 유지한다.
- 선택 즉시 테두리·연한 배경·체크 아이콘을 함께 보여 주고 약 300ms 후 이동한다. 별도 `다음` 버튼은 없다.
- 빠른 중복 탭은 첫 선택 한 번만 처리한다. `prefers-reduced-motion`에서는 선택 상태를 즉시 확정하고 지연 없이 다음 화면을 안정 상태로 연다.

### 2. Exact 질문·결과 계약

| ID | 질문 | 허용 value / label |
|---|---|---|
| `q1` | 평소 칼로리나 탄단지를 얼마나 자주 기록하나요? | `daily` 거의 매일 / `3_5` 주 3~5일 / `1_2` 주 1~2일 / `none` 거의 안 함 / 안 함 |
| `q2` | 일주일에 집밥을 몇 끼 정도 먹나요? | `none` 거의 안 먹음 / `1_2` 1~2끼 / `3_5` 3~5끼 / `6_plus` 6끼 이상 |
| `q3` | 집밥은 주로 어떻게 기록하나요? | `pass` 집밥은 기록하지 않음 / `eyeball` 먹은 양을 눈대중으로 기록 / `track` 딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록 / `measure` 재료와 음식 무게까지 재서 기록 |
| `q4` | 집밥을 기록할 때 가장 불편한 것은? | `ingredients` 재료와 양을 하나씩 입력하는 것 / `weight` 완성된 음식과 먹은 양을 재는 것 / `search` 딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것 / `none` 별로 불편하지 않음 |

Q2에는 `직접 만들거나 가족이 만든 음식 모두 포함` 보조 문구를 표시한다. 모든 사용자는 Q1~Q4를 끝까지 완료하며 `q5`와 5문항 progress는 렌더하지 않는다.

| Q3 | result key | 표시명 |
|---|---|---|
| `pass` | `homecook-passer` | 집밥 패스형 |
| `eyeball` | `eyeballing-master` | 눈대중 장인 |
| `track` | `ingredient-tracker` | 성분 추적러 |
| `measure` | `pro-measurer` | 프로 계량러 |

결과는 Q3 하나로만 정한다. Q1/Q2/Q4는 결과나 적합도를 바꾸지 않으며 v2 `target_qualified`는 항상 `null`이다.

### 3. Result와 공유

```text
┌─────────────────────────────────┐
│ [←]                             │  ← 마지막 질문으로 복귀
│       당신의 집밥 기록 타입은…  │  ← --text-3
│           눈대중 장인            │  ← --brand-primary accent
│                                 │
│       [결과 캐릭터 + 별 6개]     │  ← 장식 별 aria-hidden
│               “                 │
│      칼로리는 과학이지만         │
│   내 눈도 꽤 정확하다고 믿는 편. │
│      결과별 설명 한 문장         │
│ ─────────────────────────────── │  ← --border
│ 그런데 집밥 기록이              │
│ 20초 만에 끝난다면?             │
│ [ 무먹으로 20초 체험하기    → ] │  ← quiz 결과 primary, 48px+
│ [ 공유 ] 내 결과 공유하기        │  ← secondary, 44px+
│ 공유/복사 상태 live message      │
└─────────────────────────────────┘
```

- 네 result key는 각각 source의 확정 캐릭터, title, quote, description과 1:1이다. 폐기된 외눈 밥그릇 캐릭터를 사용하지 않는다.
- 결과 공유는 Web Share API를 우선하고 미지원 환경은 링크 복사로 대체한다. 취소는 무상태 종료, 복사 실패는 inline 재시도 안내이며 퍼널 error나 email gate로 이동하지 않는다.
- normal quiz result의 primary CTA는 5단계 체험 1/5로 이동한다. known result deep-link의 read-only preview는 같은 결과 카드와 공유 CTA를 쓰되 primary 문구를 `나도 테스트하기`로 바꾸고 Hero/Q1 정상 테스트를 시작한다. preview에서 체험 1/5로 직접 이동하거나 quiz/result event를 위조하지 않는다.
- 공유 URL은 표시 전용 deep link `/beta?result=<opaque-result-key>`만 허용한다. 생성 시 현재 URL의 기존 query parameter를 전부 제거한 뒤 `result` 하나만 새로 쓴다. email, `q1..q4` answers, UTM, `ad_variant`, `variant`, session/cookie ID, consent, Turnstile token, raw referrer와 다른 PII는 공유 URL에 넣지 않는다.
- `<opaque-result-key>`는 위 네 allowlist key 중 하나이며 known key만 read-only preview를 열고 unknown key는 Hero로 안전하게 복구한다.
- deep-link key는 공유 결과를 그리는 presentation hint일 뿐 API의 client-supplied result/answer가 아니다. 서버 저장 결과는 여전히 Q3에서만 계산한다.
- 한국어 결과명·quote를 URL 값으로 쓰거나 암묵 매핑하지 않는다.

### 4. 5단계 체험

모든 단계의 상단은 `[←]  체험 N / 5 · 단계명`과 5구간 progress를 사용한다. `[←]`는 직전 화면으로 돌아가며 이미 확정한 체험 상태를 보존한다.

```text
1/5 레시피 가져오기             2/5 재료 확인
┌───────────────────────┐       ┌───────────────────────┐
│ [YouTube 예시 썸네일] │       │ 돼지고기        600g │
│ 제목 · 출처 · 조회수  │       │ 양파            200g │
└───────────────────────┘       │ …총 6개 재료          │
[ 무먹으로 가져오기 ]           └───────────────────────┘
loading → 성공 live message      [ 600g → 520g ] ← CTA
                                  [ 다음 → ] ← 반영 후 활성

3/5 완성 무게                   4/5 먹은 양
예상 완성 무게                   1,180g 중 얼마나 드셨나요?
        1,200g                  ┌───────────────────────┐
조리하면서 줄어드는…             │ [제육볶음+저울 이미지]│
      [빈 저울 이미지]           │       320g (텍스트)   │
[ 저울로 재보니 1,180g ]         └───────────────────────┘
                                [ 320g 입력하기 ]

5/5 영양 계산 완료
          계산 완료!             ← 별은 aria-hidden
             487 kcal
┌────────┬────────┬────────┐
│탄수 31g│단백 39g│지방 22g│       ← --surface, --radius-card
└────────┴────────┴────────┘
[ 식단에 기록하기 → ]            ← --brand-primary
```

- 1/5는 권리 확인 전 실제 YouTube 재생·iframe·외부 요청을 하지 않는다. 로컬 썸네일도 공개 권리가 확인되거나 승인된 대체 자산으로 교체되어야 한다.
- 2/5의 `다음`은 `600g → 520g` 반영 전 disabled이며 색만이 아니라 `disabled` semantics로 알린다.
- 3/5와 4/5에는 키패드·숫자 입력을 만들지 않는다. 4/5 `320g`은 이미지 픽셀이 아니라 접근 가능한 UI 텍스트다.
- 5/5의 숫자는 `487 kcal / 탄수화물 31g / 단백질 39g / 지방 22g`으로 고정한다. 장식 count-up은 reduced motion에서 즉시 최종값을 표시한다.

### 5. Planner payoff → 완제품 → Planner complete

```text
┌─────────────────────────────────┐
│ [←]  🗓 이번 주 식단            │
│ ┌──────┬──────┬──────┬──────┐ │
│ │1,607 │177g  │111g  │60g   │ │  ← kcal/탄/단/지
│ └──────┴──────┴──────┴──────┘ │
│ [←] 이번 주 9/1 - 9/7      [→] │  ← 대상과 인접
│ 월  화  수 [목] 금  토  일      │  ← 내부 맞춤, page overflow 금지
│ ┌ 오늘 · 9/3 (목)       3/3 ┐ │
│ │ 아침  그릭요거트 볼       + │ │
│ │ 점심  닭가슴살 현미밥     + │ │
│ │ 저녁  제육볶음 320g       + │ │  ← drop-in 강조
│ └───────────────────────────┘ │
│ ┌ TomorrowPreview ──────────┐ │
│ │ 내일 · 9/4 (금)       0/3 │ │  ← 오늘 card 다음
│ │ 아침       +  점심       + │ │
│ │ 저녁       +              │ │  ← read-only affordance
│ └───────────────────────────┘ │
│ [ 편의점 음식도 기록해보기 → ] │  ← safe-area 위 primary
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ [←]                             │
│ 그리고 편의점 음식은 더 간단해요│
│ ┌ 제품 예시                   ┐ │
│ │ [제품 이미지]               │ │  ← 권리/비제휴 blocker
│ │ 더:단백 드링크 초코         │ │
│ │ 250ml · 105kcal · 단백질20g │ │
│ └─────────────────────────────┘ │
│ [ + 기록하기 ]                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ [←]  🗓 이번 주 식단            │
│ 1,712kcal / 탄184g / 단131g / 지61g
│ …같은 오늘 day card…            │
│ 저녁  제육볶음 320g             │
│       더:단백 드링크 초코       │  ← 같은 저녁 행, drop-in
│ ┌ TomorrowPreview ────────────┐ │
│ │ 내일 · 9/4 (금)         0/3 │ │  ← 오늘 card 다음
│ │ 아침 +   점심 +   저녁 +    │ │  ← read-only affordance
│ └─────────────────────────────┘ │
│ [ 무료 베타 먼저 써보기 → ]     │
└─────────────────────────────────┘
```

- planner payoff는 실제 `PLANNER_WEEK`가 아닌 `/beta` 내부 표현이다. 하단 탭, 식사 편집, 실제 저장, week mutation을 제공하지 않는다.
- 날짜 범위 컨트롤은 요일/오늘 card 바로 위에 둔다. 모든 7일은 viewport 안에서 맞추며 페이지 전체 가로 스크롤을 만들지 않는다.
- 같은 날짜의 아침·점심·저녁은 하나의 day card로 묶는다. desktop에서도 별도 dashboard나 다른 navigation model로 바꾸지 않는다.
- source의 `+`는 데모 맥락을 보여 주는 시각 요소다. Stage 4에서 활성화할 문서 계약이 없으므로 focusable mutation CTA로 만들지 않거나 명확히 disabled/read-only 처리한다.
- 두 planner의 내일 preview는 모두 오늘 card 다음, primary CTA 직전에 둔다. 내일 날짜와 `0 / 3`, 아침·점심·저녁 empty slot을 보여 주되 내일 preview의 `+`는 read-only 또는 disabled semantics이며 실제 meal/planner mutation을 만들지 않는다.
- 첫 payoff는 `1,607 kcal / 177g / 111g / 60g`, 두 번째는 `1,712 kcal / 184g / 131g / 61g`이다. 완제품은 제육볶음과 같은 저녁 묶음에 추가한다.
- 제품 카드에는 `제품 예시`를 항상 보이게 하고 제휴·추천으로 오인시키지 않는다. 이미지 사용 권리 확인 또는 대체 자산 승인은 production blocker다.

### 6. Beta form → Done

```text
┌─────────────────────────────────┐
│ [←]                             │
│ ┌─────────────────────────────┐ │
│ │ [초대 캐릭터] [무먹 로고]   │ │  ← --surface-fill
│ │ 직접 써보고 싶나요?         │ │
│ │ 베타가 준비되면 알려드려요. │ │
│ └─────────────────────────────┘ │
│ 이메일                          │
│ [✉ email@example.com          ] │  ← --surface, 48px+
│ ┌─────────────────────────────┐ │
│ │ □ 이메일 수집·이용 동의(필수)│ │
│ │ 수집·목적·보유 안내          │ │  ← 한 consent block
│ └─────────────────────────────┘ │
│ validation/server error inline  │
│ [ 무료 베타 초대받기          ] │  ← submitting 중 중복 비활성
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ [←]                             │
│       [완료 전용 캐릭터]         │
│       신청이 완료됐어요!         │
│  베타가 준비되면 이메일로…       │
│                                 │
│ [ 처음으로 돌아가기 ]            │  ← secondary, 44px+
│        safe-area bottom          │
└─────────────────────────────────┘
```

- beta form은 전체 퍼널의 유일한 텍스트 입력이다. email과 필수 동의, 수집 항목·목적·보유 안내를 한 화면의 한 consent block에 둔다.
- email 오류는 입력과 `aria-describedby`로 연결하고 문장으로 안내한다. submitting 중 버튼을 비활성화하고 상태를 live message로 알린다.
- accepted와 duplicate는 같은 generic success UI인 done을 보여 준다. 사용자가 두 경우를 구별할 수 있는 문구·상태·응답 차이를 만들지 않는다.
- `503` readiness 오류나 `422` Turnstile 오류는 form inline error와 retry만 제공한다. 뒤로가면 결과·체험·planner payoff가 보존된다.
- `처음으로 돌아가기`는 답변·체험·email 입력을 지우고 동일한 resolved Hero로 돌아간다. 브라우저 URL에 email이나 답변을 남기지 않는다.

## 컴포넌트 상세과 공통 상태

| 컴포넌트 | 기본 상태 | Loading | Empty | Error | Read-only / fail-closed |
|---|---|---|---|---|---|
| Funnel shell | 현재 stage 하나와 이전 화면 back stack | shell 높이를 보존하는 skeleton, mutation 비활성 | stale/missing/legacy session 안내 + `[새로 시작하기]` | 안전한 설명 + `[다시 시도]`; 이미 본 결과/체험은 지우지 않음 | lead gate와 무관하게 result/experience/planner를 계속 탐색 가능 |
| Hero/Quiz | resolved Hero, 단일 선택, progress | session `view` 준비 중 CTA 비활성 | 새 Hero로 재시작 | `403/409/422`별 안전 문구와 restart/retry | N/A |
| Result/share | Q3-derived 결과와 캐릭터 | 결과 확정 skeleton; 임의 default 결과 금지 | unknown shared key는 Hero로 복구 | share 실패는 inline retry, funnel error 아님 | 공유는 계속 가능; email gate와 독립 |
| Demo/Planner | 고정 fixture와 단계별 CTA | import/drop-in/count-up 영역 geometry 유지 | session 누락이면 Hero 재시작 | 재시도 또는 직전 안정 상태 유지 | 외부 저장·편집 없음; planner payoff 자체가 read-only demo |
| Beta form | email + required consent | submit 버튼 `신청 중…`, 중복 탭 차단 | N/A | validation/Turnstile/readiness/server 오류를 form 안에 표시 | readiness fail-closed면 제출만 차단; 앞 단계는 계속 표시 |
| Done | generic success | N/A | N/A | N/A | accepted/duplicate를 구분하지 않음 |

- `unauthorized`: N/A. public no-login funnel이며 로그인 modal, return-to-login, browser DB access가 없다.
- session recovery는 `[새로 시작하기]` 또는 `[다시 시도]`다. 내부 action 이름, session UUID, DB 상태, raw error를 사용자에게 노출하지 않는다.
- safe error copy는 행동 복구를 설명하고 PII·중복 여부·보안 설정을 추론하게 하지 않는다.

## 인터랙션 노트

| 액션 | 트리거 | 결과 | 로그인 필요 |
|---|---|---|---|
| 테스트 시작 | Hero primary CTA | Q1, `quiz_started` | N |
| 답 선택 | Q1~Q4 option tap/keyboard activation | 선택·체크 → 300ms 후 다음 질문, Q4 뒤 result | N |
| 뒤로가기 | 상단 44×44px back | 직전 화면과 유지된 답/체험 상태 복원 | N |
| 결과 공유 | secondary share CTA | native share 또는 opaque-key 링크 복사 | N |
| 공유 결과에서 테스트 시작 | known result read-only preview primary CTA | Hero/Q1 정상 테스트; 체험으로 직접 이동하지 않음 | N |
| 체험 시작 | result primary CTA | 1/5, `experience_started` | N |
| 레시피 가져오기 | 1/5 primary CTA | loading → success → 2/5 | N |
| 재료 반영 | 2/5 `600g → 520g` | 돼지고기 520g 강조, 다음 CTA 활성 | N |
| 완성/섭취량 확정 | 3/5·4/5 CTA | 고정 fixture 반영 후 다음 단계 | N |
| 영양 반영 | 5/5 CTA | planner_homecook, `experience_completed` | N |
| 완제품 기록 데모 | planner CTA와 제품 CTA | packaged_food → planner_complete | N |
| 베타 폼 진입 | planner complete CTA | beta form, `beta_form_viewed` | N |
| 베타 제출 | valid email + 필수 동의 | accepted/duplicate generic done | N |
| 처음으로 | done secondary CTA | 상태 초기화 후 동일 Hero | N |

### Scroll containment

- Hero, 긴 result, demo, beta form은 각 stage의 app-owned content scroller에서 세로 스크롤한다.
- CTA를 하단 고정할 경우 `padding-bottom: calc(CTA height + --space-4 + env(safe-area-inset-bottom))`을 확보해 마지막 콘텐츠를 덮지 않는다.
- planner payoff도 동일한 세로 scroller를 쓰고 별도 내부 세로 스크롤을 만들지 않는다. 요일은 7칸 맞춤 배치하며 가로 스크롤하지 않는다.
- 320px, 200% text zoom에서는 CTA 고정보다 자연스러운 세로 flow를 우선한다. 어떤 화면도 전체 wrapper가 좌우로 움직이면 blocker다.
- soft keyboard가 열리면 form 입력·error·submit이 보이는 영역으로 스크롤되며 CTA가 키보드 뒤에 고정되지 않는다.

### 접근성·모션·safe area

- heading은 stage마다 하나의 `h1`, 세부 제목은 순서대로 `h2`를 쓴다. 질문 선택은 button 또는 radio semantics 중 하나로 일관되게 구현한다.
- progress에는 현재값/최댓값과 읽을 수 있는 label을 제공하고, 자동 전환·loading·성공·error는 적절한 `role=status|alert`로 한 번만 알린다.
- 모든 버튼·선택·뒤로가기·`+` affordance는 최소 44×44px, primary CTA는 최소 48px이다. visible focus를 제거하지 않는다.
- 선택, disabled, 성공, 오류는 색뿐 아니라 아이콘·문구·semantic state로 구분한다.
- 모든 화면의 상·하단은 `env(safe-area-inset-top|bottom)`을 포함한다. 홈 인디케이터, 320×568 높이, 200% text zoom에서 CTA·입력이 가려지면 blocker다.
- `prefers-reduced-motion`에서는 300ms 자동 이동을 포함해 pop-in, 별 burst, pulse, drop-in, count-up을 즉시 완료 상태로 보여 준다. 정보와 CTA는 모션 없이 동일하다.
- 이미지 alt는 정보 이미지에 목적을 설명하고, 장식 별·sparkle·중복 썸네일은 `aria-hidden` 또는 빈 alt를 사용한다.

## 토큰 힌트

| 역할 | 토큰 |
|---|---|
| page/surface | `--surface: #FFFFFF`, `--surface-fill: #F8F9FA`, `--surface-subtle: #F1F3F5` |
| text | `--foreground` 또는 Wave1 ink `#212529`, `--text-2`, `--text-3`, `--text-4` |
| primary/selected | `--brand-primary: #00A1FF`, pressed `--brand-primary-hover: #0087D7`, soft `--brand-primary-soft` |
| border/focus | `--line` 또는 Wave1 border `#DEE2E6`; focus는 brand 대비가 보이는 2px 이상 outline |
| radius | control `--radius-control: 8px`, card `--radius-card: 10px`, panel `--radius-panel: 14px` |
| control height | `--control-height-md: 44px`, primary `--control-height-lg: 48px` |
| spacing | `--space-1/2/3/4/5/6/8/12`; mobile horizontal 16~20px |
| font | `--font-body`: Avenir Next → Pretendard → system sans-serif |

이 `/beta` app-owned surface에서는 source와 현재 app runtime의 파란 팔레트를 유지한다. 이전 coral/cream 값을 새 화면의 목표값으로 사용하거나 unrelated web global token을 변경하지 않는다.

## 화면 정의서 매핑

| 정의서 항목 | 구현 설계 | 비고 |
|---|---|---|
| Hero `a|b|c|d|default` | ✅ | resolved Hero만 표시, Q1 이후 동일 |
| exact q1..q4 / Q3-only 결과 | ✅ | 표로 exact value·label·mapping 잠금 |
| result → 5-step → planner → product → planner → beta → done | ✅ | 이메일 전 전체 체험 공개 |
| 결과 공유 + fallback | ✅ | presentation-only opaque result key |
| loading/empty/error/read-only | ✅ | stage별 recovery와 fail-closed 포함 |
| unauthorized | N/A | public no-login funnel |
| 320px / 44px / focus / semantic progress / live message | ✅ | narrow·zoom·keyboard gate 포함 |
| reduced motion | ✅ | 즉시 완료 상태 |
| app-owned port only | ✅ | frame/device/runtime 제외 |
| 이미지 권리와 제품 예시 | ⚠️ | production 공개 전 blocker |
| Stage 4 screenshot + independent authority | ⚠️ | 구현 전에는 evidence 없음 |

## 디자인 결정 사항

- 이 화면은 신규 high-risk UI이므로 standalone prototype의 95/100 평가는 운영 Next.js 구현 승인이 아니다. 이 문서와 별도 design-critic 결과, Stage 4 구현 evidence, 독립 final authority가 모두 필요하다.
- 실제 `PLANNER_WEEK` anchor는 수정하지 않는다. funnel planner는 사용 가치를 설명하는 고정 read-only payoff이며 하단 탭·저장 mutation·실제 planner route를 포함하지 않는다.
- source prototype의 393×852 무스크롤 planner 목표는 참고하되, 320px·200% 확대에서 정보를 잘라 맞추지 않는다. 좁은 화면에서는 단일 세로 scroller로 자연스럽게 이어진다.
- source가 한국어 결과명을 URL에 넣던 동작은 privacy 최소화와 명시적 deep-link 계약을 위해 폐기한다. 공유에는 allowlisted opaque result key만 쓰며 API 결과 입력으로 해석하지 않는다.
- source의 개발용 `variant` query는 운영 public contract에 포함하지 않는다.
- 실제 YouTube 썸네일, 결과/초대 캐릭터, 제품 이미지는 권리 확인 또는 승인된 대체 자산이 없으면 production/paid-ad 공개 blocker다. 완제품은 항상 `제품 예시`와 비제휴 맥락을 유지한다.
- existing lead readiness fail-closed를 완화하지 않는다. readiness가 닫힌 상태에서도 result/experience/planner payoff는 read-only로 남고 제출만 차단한다.

## Stage 4 evidence 및 authority 계획

- future evidence root: `ui/designs/evidence/marketing-demand-validation-v2/`
- mobile default 393×852: Hero, Q1, 각 result 대표/4종 확인, demo 1~5, planner_homecook의 내일 preview, packaged_food, planner_complete의 내일 preview, beta default/error/submitting, done
- mobile narrow 320×568: Q4 긴 선택지, 긴 result, demo 2, 두 planner의 내일 preview와 CTA 배치, beta keyboard/error, done safe-area
- 상태 evidence: loading, stale/missing session empty, `403/409/422/503`, share cancel/copy fail, accepted/duplicate generic success, lead read-only
- automated geometry: page-level overflow 0, touch target, sticky/fixed CTA overlap, 200% zoom, keyboard occlusion
- manual: VoiceOver/TalkBack, 실제 키보드 focus, iOS Safari safe area, native share cancel/fallback, 이미지 권리·제품 예시·비제휴 표시
- authority report 예정 경로: `ui/designs/authority/MARKETING_DEMAND_VALIDATION_V2-authority.md`

## design-critic 검토 필요 항목

- [ ] 393px와 320px에서 Hero의 핵심 CTA가 첫 행동으로 명확하고 page-level horizontal overflow가 없는가
- [ ] Q4의 긴 선택지가 44px target과 읽을 수 있는 줄바꿈을 유지하는가
- [ ] back navigation이 Q1→Hero, Q2~Q4→직전 질문, result→Q4, 체험→직전 단계로 일관되는가
- [ ] 네 result key/title/character/copy와 Q3-only mapping이 exact spec과 일치하는가
- [ ] 공유 URL이 allowlisted opaque result key 외 답변·email·session·PII를 포함하지 않는가
- [ ] 5단계 fixture와 두 planner 합계가 exact하고 `620 kcal` 같은 old 값이 없는가
- [ ] funnel planner가 실제 anchor mutation처럼 보이지 않고 같은 날짜 정보를 한 card에 묶는가
- [ ] 제품 카드의 `제품 예시`, 이미지 권리 blocker, 비제휴 맥락이 충분히 명확한가
- [ ] loading/empty/error/read-only와 unauthorized N/A가 사용자 recovery까지 정의됐는가
- [ ] reduced motion, safe area, 200% zoom, keyboard, screen-reader progress/live message가 구현 가능한 수준으로 잠겼는가
- [ ] Stage 4 screenshot evidence와 final authority 전 `confirmed` 금지가 명시됐는가
