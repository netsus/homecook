# MARKETING_DEMAND_VALIDATION_V2 설계 리뷰

> 검토 대상: `ui/designs/MARKETING_DEMAND_VALIDATION_V2.md`
> 기준 문서: 화면정의서 v1.5.40 / 요구사항기준선 v1.7.36 / 유저 Flow맵 v1.3.38
> source prototype: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
> 검토일: 2026-09-03
> 검토자: design-critic

## 종합 평가

**등급**: 🟢 통과

**심각도**: blocker `0` / major `0` / minor `0`

**한 줄 요약**: exact 4문항·4결과, 결과 선공개, read-only 체험, privacy-safe 공유, 두 planner의 TomorrowPreview, 393px/320px 스크롤 정책과 Stage 4 authority 계획을 공식 계약에 맞게 구현 가능한 수준으로 잠갔다.

이 판정은 Stage 1 텍스트 설계 계약에 한정한다. Next.js 구현, 320px runtime 품질, 이미지 권리, lead activation, Stage 5/final authority를 승인하지 않는다.

## 검토 근거와 시각 증거 한계

- source commit의 최신 393×852 캡처 중 result, demo 2, demo 5, planner, beta, done을 확인했다.
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v4/03-result-393x852.png`
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v4/04-demo-2-393x852.png`
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v4/06-demo-5-393x852.png`
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v4/07-planner-homecook-393x852.png`
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v5/10-beta-393x852.png`
  - `ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/evidence/design-qa/final-v5/11-success-393x852.png`
- source 캡처의 iPhone frame/status runtime은 운영 포팅 대상이 아니다. app-owned viewport 안의 위계·밀도·CTA 위치만 참고했다.
- source prototype은 내부 좌표가 고정된 phone runtime이므로 320px 운영 증거가 아니다. 설계는 320×568, 200% text zoom, keyboard occlusion, page overflow와 touch target을 Stage 4 필수 evidence로 정확히 이관했다.

## P1-005 repair re-review

**closure**: `CLOSED`

- `planner_homecook` wireframe은 오늘 day card 다음에 TomorrowPreview를 두고, 그 다음에 `편의점 음식도 기록해보기` primary CTA를 둔다.
- `planner_complete` wireframe도 오늘 day card 다음에 TomorrowPreview를 두고, 그 다음에 `무료 베타 먼저 써보기` primary CTA를 둔다.
- 두 TomorrowPreview 모두 내일 날짜, `0 / 3`, 아침·점심·저녁 empty slot과 read-only `+` affordance를 명시한다.
- 공통 설계 규칙은 `+`를 focusable mutation으로 만들지 않거나 disabled/read-only semantics로 처리하고 실제 meal/planner mutation을 금지한다.
- 화면정의서 v1.5.40의 `내일 식단 preview` 포팅 기준, acceptance의 두 planner layout/read-only 항목, Playwright 393px/320px evidence 항목과 일치한다.
- automation Stage 4 evidence는 `planner-homecook-tomorrow-preview-393-320`과 `planner-complete-tomorrow-preview-393-320`을 각각 요구한다.
- source의 393×852 planner 캡처에서도 오늘 card 아래, primary CTA 위에 내일 날짜·`0 / 3`·세 empty slot이 배치된 것을 재확인했다. 320px 실제 적합성은 Stage 4 구현 evidence에서 별도 검증한다.

## 크리티컬 이슈 (수정 필수)

없음.

## Blocker

없음.

## Major

없음.

## Minor

없음.

## 체크리스트 결과

### A. 요구사항 정합성

- [x] `hero → q1..q4 → result → experience 1..5 → planner_homecook → packaged_food → planner_complete → beta_form → done`의 모든 공식 화면을 포함한다.
- [x] exact 질문·선택지와 Q3-only 결과 매핑이 `homecook-passer | eyeballing-master | ingredient-tracker | pro-measurer`와 일치하고 `q5`를 배제한다.
- [x] normal quiz result CTA는 체험 1/5로, known result read-only preview의 `나도 테스트하기` CTA는 Hero/Q1 정상 테스트로 분리한다. preview가 quiz/result event를 위조하지 않는다.
- [x] 공유 URL은 기존 query를 모두 제거한 `/beta?result=<opaque-result-key>` 하나로 만들며 email, answers, UTM, `ad_variant`, 개발용 `variant`, session/cookie, consent, Turnstile, PII를 금지한다. unknown key는 기본 Hero로 복구한다.
- [x] resolved Hero는 known `utm_content → ad_variant → default` 우선순위를 사용하며 모든 Hero가 같은 Q1 이후 계약을 공유한다.
- [x] 비로그인 public funnel이므로 로그인 게이트와 return-to-login은 N/A다.
- [x] planner payoff와 lead-readiness fail-closed 상태를 read-only로 정의하고 실제 planner mutation·저장·편집을 노출하지 않는다.
- [x] 문서에 없는 endpoint·field·result mapping을 추가하지 않고 삭제된 `DELETE /recipes/{id}/save`를 사용하지 않는다.

### B. 공통 상태 커버리지

- [x] loading은 shell geometry를 보존하는 skeleton, CTA 비활성, submit 중복 차단으로 정의한다.
- [x] empty는 stale/missing/legacy session에서 `[새로 시작하기]` recovery를 제공한다.
- [x] error는 `403/409/422/503`, share/copy 실패, Turnstile/readiness 오류에 안전한 `[다시 시도]` 또는 inline retry를 제공한다.
- [x] read-only는 result/experience/planner payoff와 lead gate를 분리하고 fail-closed여도 이미 본 가치를 숨기지 않는다.
- [x] unauthorized는 public no-login funnel이므로 N/A임을 명시한다.

### C. 내비게이션 & 플로우

- [x] `/beta`는 isolated public surface이므로 공통 하단 4탭을 의도적으로 렌더하지 않는다. 실제 `PLANNER_WEEK` route나 하단 탭으로 오인시키지 않는다.
- [x] Flow맵의 진입·이탈 순서와 익명 action/PII action 경계를 따른다.
- [x] Q1→Hero, Q2~Q4→직전 질문, result→Q4, 체험·planner·beta·done→직전 화면의 back stack과 상태 보존을 명시한다.
- [x] 뒤로 보기는 UI 상태 복원이며 역순 mutation을 요구하지 않는 구조다. 정상 전진 action 순서를 깨는 플로우 단절이 없다.

### D. UX 품질

- [x] 모든 버튼·선택지·뒤로가기·시각적 `+` affordance를 최소 44×44px, primary CTA를 최소 48px로 잠근다.
- [x] 기본 폭 393px와 작은 sentinel 320×568을 분리하고, 320px·200% 확대에서는 sticky CTA보다 자연스러운 세로 flow를 우선한다.
- [x] app-owned content scroller 하나만 사용하고 중첩 세로 스크롤과 whole-page horizontal scroll을 금지한다.
- [x] sticky/fixed CTA 사용 시 실제 높이와 safe area만큼 bottom padding을 확보하며 keyboard 뒤에 CTA를 고정하지 않는다.
- [x] Hero, result, 단계별 demo, planner, beta의 primary CTA가 secondary/share action보다 명확하다.
- [x] planner의 같은 날짜 아침·점심·저녁을 한 day card에 묶고 범위 컨트롤을 대상 콘텐츠에 인접시킨다.
- [x] `planner_homecook`과 `planner_complete` 모두 오늘 card 다음·primary CTA 직전에 TomorrowPreview를 두며 내일 날짜, `0 / 3`, 세 empty slot, read-only `+`를 같은 구조로 유지한다.
- [x] source의 `+`를 focusable mutation으로 오인시키지 않도록 비활성/read-only 처리한다.
- [x] 장보기 D&D와 `SHOPPING_DETAIL` 2영역 규칙은 이 화면에 N/A다.
- [x] 글로우·과도한 그라디언트·채팅형 AI UI를 새로 도입하지 않는다.

### E. 도메인 규칙 정합성

- [x] `meals.status`, 독립 요리 상태 전이, 팬트리 보유 여부, 요리모드 인분, 레시피북 타입은 이 isolated marketing demo에 N/A다.
- [x] funnel planner는 실제 meal/planner write가 아닌 고정 read-only payoff임을 명시해 제품 도메인 mutation과 분리한다.
- [x] 익명 stage action과 `lead_submitted` PII write boundary, first-write-wins, duplicate generic success, fail-closed를 훼손하지 않는다.

### F. 디자인 토큰 준수

- [x] app-owned surface의 현재 runtime override인 `--brand-primary: #00A1FF`와 pressed/soft 변형을 CTA·선택 상태에 사용한다. legacy coral/cream 값을 목표값으로 되살리지 않는다.
- [x] 카드·입력 배경은 `--surface: #FFFFFF`, 보조 면은 `--surface-fill/subtle`을 사용한다.
- [x] 보조 텍스트는 `--text-2/3/4` 또는 현재 foreground 역할 토큰을 사용하고 임의 회색 hex를 추가하지 않는다.
- [x] app runtime shape token인 control 8px, card 10px, panel 14px를 사용한다. legacy generic card 16px를 app-owned override 위에 강제하지 않는다.
- [x] 모바일 수평 여백 16~20px와 `--space-*` scale을 사용한다.
- [x] 확정 토큰 밖 임의 구버전 색상, 임의 그라디언트, 임의 그림자를 추가하지 않는다.

## 추가 계약 확인

- [x] 네 result key/title/character/copy는 source 확정 자산과 1:1이며 폐기된 외눈 밥그릇 캐릭터를 금지한다.
- [x] fixture는 `487 kcal / 31g / 39g / 22g`, planner `1,607 / 177 / 111 / 60`, complete `1,712 / 184 / 131 / 61`로 잠기며 old `620 kcal`를 배제한다.
- [x] 실제 YouTube 썸네일·결과/초대 캐릭터·제품 이미지는 권리 확인 또는 승인된 대체 자산 전 production blocker다.
- [x] 완제품은 항상 `제품 예시`로 표시하고 제휴·추천 오인을 막는다.
- [x] `prefers-reduced-motion`에서 자동 이동·pop-in·burst·pulse·drop-in·count-up을 즉시 안정 상태로 전환한다.
- [x] semantic heading, progress label/value, status/alert, visible focus, `aria-describedby`, alt/aria-hidden과 safe-area를 구현 기준으로 잠근다.
- [x] Stage 4는 393×852와 320×568 screenshot/state/geometry/manual evidence를 만들고, 별도 Stage 5와 final authority가 blocker 0을 확인하기 전 `confirmed`로 올리지 않는다.
- [x] Stage 4 automation은 두 planner의 TomorrowPreview를 393px/320px에서 각각 증명하고 CTA visibility와 read-only `+`를 Playwright/browser evidence로 고정한다.

## design-generator 재작업 요청 항목

없음. shared-result CTA·query stripping과 P1-005 TomorrowPreview 보강을 반영한 현재 revision을 기준으로 통과한다.

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:

- [x] 크리티컬 이슈 0개
- [x] blocker 0 / major 0 / minor 0
- [ ] Stage 1 docs PR internal 1.5 승인·merge·pending recheck 완료
- [ ] Stage 4에서 393×852 및 320×568 실제 구현 evidence 생성
- [ ] 이미지 권리·제품 예시·비제휴 수동 gate와 lead readiness blocker 별도 해소
- [ ] Stage 5와 독립 final authority blocker 0 확인

위 미완료 항목은 이번 Stage 1 텍스트 설계의 결함이 아니라 후속 구현·운영 gate다.
