# R2_MENU · r2.1 화면 설계

Design Status: draft
Authority: pending
Role: design-generator 보조
Contract: r2.1, PR #1551 병합 완료
Merged: `7f00e62c13572b5b2c0d54c997fe628f7a56567e`
Reviewed: `24093c94ebf53676050353088f173ef7f6315445`
Workspace integration: `b9601841` (리더 제공)

공식 기준은 [r2.1 상세 계약](../../docs/marketing-demand-validation-r2-contract.md) §2~4·8이다. 위 SHA는 사용자·리더가 제공한 병합 출처다. 원문 상단의 과거 '독립 검토 전 Draft'와 '미병합 Draft'는 작성 당시 문구이며 현재 계약 승인 상태로 오인하지 않는다. **계약은 승인·병합됐지만 디자인 확정과 독립 authority는 pending**이다.

## Canonical 화면 ID 매핑

| 주제 | 공식 화면 ID | 문서 |
| --- | --- | --- |
| recording | `R2_RECORDING_MENU` | 이 문서 |
| homeflow | `R2_HOMEFLOW_MENU` | 이 문서 |

[전체 16 ID 매핑](R2_SCREEN_MAPPING.md). 파일명은 8개 공통 설계 문서이며 공식 화면 ID를 축약·대체하지 않는다.

## recording 와이어프레임·카피

```text
[무먹 가로 로고] [메뉴로: MENU 제외]
베타 준비 중 · 사용 예시
내 레시피로 만든 집밥, 먹은 만큼 영양 기록
레시피의 재료 정보를 가져와 확인하고, 완성한 요리와 먹은 분량을 기록으로 연결해요.
[베타 오픈 알림 받기]
[사용 예시 먼저 보기]
[의견만 남기기 · 4문항]
현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.
하나만 해도 괜찮아요. 순서는 자유예요.
아직 완료한 활동이 없어요
[개인정보처리방침]
```

## homeflow 와이어프레임·카피

```text
[무먹 가로 로고] [메뉴로: MENU 제외]
베타 준비 중 · 사용 예시
뭐 먹을지 정한 다음, 장보기부터 남은 요리까지
요리 계획에 필요한 재료를 모으고, 집에 있는 재료를 빼서 장보고, 남은 요리를 다음 식사로 이어가요.
[베타 오픈 알림 받기]
[사용 예시 먼저 보기]
[의견만 남기기 · 4문항]
현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.
하나만 해도 괜찮아요. 순서는 자유예요.
아직 완료한 활동이 없어요
[개인정보처리방침]
```

## 상태·이동·오류

첫 HTML은 연결/관측 POST를 기다리지 않고 주제 가치·준비 상태·세 선택지를 표시한다. primary 알림 → secondary 예시 → text 의견 순서다. 준비 안내 → 자유 순서 안내 → 완료 상태 → privacy 순서를 도면과 통일한다. 완료 없음은 '아직 완료한 활동이 없어요', 조회 중은 미확인이다. API 오류로 메뉴를 덮지 않는다. 이미지 실패 시 같은 자리의 음식 설명을 유지한다. 각 행동은 LEAD/EXAMPLE/SURVEY로 바로 열리고 메뉴 복귀 시 초점은 출발 버튼에 돌아온다.

## 초기 메뉴의 정적 치수

기본 미완료 변형의 세 번째 선택지 하단은 아래 지정 좌표다. 브라우저 실측이 아니다.

| 주제 | 폭 | 마지막 선택지 하단 |
| --- | --- | --- |
| recording | 390px | 512px |
| recording | 320px | 508px |
| homeflow | 390px | 512px |
| homeflow | 320px | 508px |

## 공통 시각·접근성 기준

| 요소 | 390px | 320px |
| --- | --- | --- |
| 좌우 여백 / 내용 폭 | 20 / 350px | 16 / 288px |
| 제목 / 행간 | 24 / 32px, 700 | 22 / 30px, 700 |
| 본문·입력 / 행간 | 16 / 24px | 16 / 24px |
| 부가 안내 / 행간 | 14 / 22px | 14 / 22px |
| primary / secondary / text | 최소 52 / 48 / 44px | 최소 52 / 48 / 44px |
| 컨트롤 / 카드 radius | 8 / 10px | 8 / 10px |
| 완료 mascot | 56×56px | 48×48px |

primary CTA(주 행동): MENU는 베타 오픈 알림 받기, 세 DONE은 메뉴로 돌아가기, EXAMPLE은 다음 장면/예시 확인 완료, SURVEY는 다음 문항/의견 보내기, LEAD는 베타 오픈 알림 신청하기, RECOVERY는 다시 시도다. 52px blue+ink 위계로 구분한다.

scroll containment(스크롤 영역): 독립 캠페인 문서 본문 하나에서만 자연스러운 세로 스크롤을 허용한다. 페이지 가로 스크롤과 중첩 세로 스크롤, 고정 CTA로 입력을 가리는 구조를 금지한다.

흰 배경, 기존 blue `#00A1FF`, ink `#212529`, 본문 `#495057`를 재사용한다. primary는 blue 위 ink, secondary는 흰 면·진한 outline, text 행동은 진한 글자와 밑줄이다. 기존 Avenir Next/Pretendard 계열을 유지하며 새 폰트·패키지·전역 토큰을 추가하지 않는다. 로고는 기존 가로형을 112×32px 안에 contain, 음식은 72px 띠 또는 작은 장면 이미지로 표시한다.

[디자인 토큰](../../docs/design/design-tokens.md), [모바일 UX 규칙](../../docs/design/mobile-ux-rules.md), [anchor 기준](../../docs/design/anchor-screens.md), [generator 체크리스트](../../.codex/agents/design-generator.toml)를 따른다. 과거 역할 파일의 주황색·375px·앱 4탭 예시는 이번 독립 캠페인 메뉴의 기준이 아니다. 기존 제품 anchor 구조를 변경하지 않는다.

본문 하나만 자연스러운 세로 스크롤을 사용한다. 화면 고정 높이·내부 중첩 스크롤·sticky CTA·가로 페이지 스크롤을 만들지 않는다. 긴 동의·질문은 그대로 이어 읽으며 200% 글자에서 줄이거나 자르지 않는다. 하단 여백은 24px + safe-area다. 키보드가 열려도 필드·오류·동의·제출까지 같은 문서에서 도달한다.

모든 조작은 최소 44×44px, 보이는 focus 2px + 간격 2px, DOM/Tab 순서는 시각 순서다. 화면 진입은 제목에 초점, 입력 중 비동기 상태 변화는 초점을 빼앗지 않는다. 질문은 fieldset/legend와 native radio, 선택 label 전체를 조작 영역으로 쓴다. 오류는 aria-describedby/aria-invalid로 연결하고 제출 시 첫 오류로 이동한다. 서버 완료 알림은 aria-live=polite로 한 번 전달하며 중복 읽음을 검토한다. 준비된 이미지의 중복 설명은 alt를 비우고 의미 이미지에는 설명을 둔다. 자동재생·자동 이동 없이 줄어든 모션 설정을 따른다.

## 완료·복원과 개인정보 경계

세 활동은 자유 순서이며 하나만 마쳐도 충분하다. 활동 0/3 카운터·전체 완료 보상·자동 메뉴 복귀가 없다. 서버가 확인한 완료만 배지로 표시하며 로컬 읽음·선택·미확인 응답을 완료로 꾸미지 않는다. 낮은 revision 응답이 기존 완료를 지우지 않는다. 같은 참여의 알림/설문 완료 후에는 '알림 접수 확인'/'의견 접수 확인'으로 해당 DONE만 열며 이메일 재입력·답변 수정·재제출을 제공하지 않는다. 예시는 다시 본다. 미확인 상태에는 재신청을 권하지 않고 서버 상태를 먼저 확인한다.

승인 r2.1의 cookie_resume은 유효한 해당 주제 서명 쿠키로 기존 참여를 복원하는 경로다. 저장소 차단이어도 복원에 성공하면 그 참여의 예시·설문·신청을 진행한다. 대기 event_id와 draft는 탭 메모리에 유지되므로 reload 때 미제출 값·미확인 요청은 사라질 수 있다. 쿠키도 없고 저장소도 사용할 수 없으면 예시·설문 draft 열기만 허용한다. 새 참여의 메모리 전용 fallback이나 인증 없는 제출은 금지하며 저장소 복구 후 재시도를 안내한다.

설문 선택·비PII 대기 이벤트는 r2 전용 IndexedDB에서 최대 30일, 서버 expiry 또는 철회 인지 중 먼저인 시점까지다. 대기 이벤트는 최대 50개이며 초과는 재시도 안내로 처리한다. 이메일·동의는 같은 탭 메모리만 사용하며 reload/탭 종료 시 버린다. Turnstile 토큰도 메모리 전용이며 제출 즉시 제거한다. URL·로그·분석·설문 draft에 개인정보/보안 토큰을 넣지 않는다. 동일 참여 요청은 직렬화하고 알림 제출은 사용자 명시 재시도만 허용한다.

참여 만료 410은 해당 주제 key/draft/outbox/로컬 완료 정리와 쿠키 만료 후 '새 참여 시작' 명시 행동으로만 재시작한다. 다른 주제는 지우지 않고 과거 완료·동의·출처를 새 참여에 복사하지 않는다. 저장소 차단 상태의 새 참여는 복구 후에만 가능하다. 동의 세대가 달라진 409 CONSENT_REFRESH_REQUIRED는 체크·토큰을 해제하고 새 동의문·명시 동의를 받되 이미 확인된 서버 완료를 지우지 않는다. 캠페인 종료와 페이지 문맥 만료를 참여 삭제로 오인하지 않는다.

## 정적 시각 근거

| 주제 | 390px | 320px |
| --- | --- | --- |
| recording | [390 PNG](evidence/marketing-demand-validation-round2/R2_recording_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_390.svg) | [320 PNG](evidence/marketing-demand-validation-round2/R2_recording_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_320.svg) |
| homeflow | [390 PNG](evidence/marketing-demand-validation-round2/R2_homeflow_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_390.svg) | [320 PNG](evidence/marketing-demand-validation-round2/R2_homeflow_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_320.svg) |

각 도면에서 `R2_RECORDING_MENU` / `R2_HOMEFLOW_MENU` label을 찾는다. 4열×2행, 첫 행 MENU/LEAD_DONE/EXAMPLE_DONE/SURVEY_DONE, 다음 행 EXAMPLE/SURVEY/LEAD/RECOVERY다. 셀 폭은 320/390 CSSpx이며 **높이는 전체 내용에 맞춘 정적 도면**이다. 긴 동의·질문을 844px 안에 축소하지 않는다. 화면·문서 카피는 [공통 시각 내용 JSON](evidence/marketing-demand-validation-round2/R2_design-content.json)의 같은 visibleCopy를 사용한다. 이는 API 스키마가 아니다.

[완료 상태 보드](evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)는 확인된 알림·설문은 접수 확인, 예시는 다시 보기를 표현한다. 서버 미확인/부분 완료/실제 복원은 Stage 4에서 별도로 확인한다. ImageGen 초기 보드와 visual-verdict-v1/v2는 수정 전 참고이며 현재 승인으로 사용하지 않는다.

## Stage 4 증거 계획과 미검증

두 주제 × 8상태 × 320/390폭을 실제 구현에서 캡처한다. 높이 844 및 568/600, 첫 화면·중간·하단 스크롤, 200% 글자, 긴 질문/이메일/동의, 키보드 열림과 safe-area, focus·터치·색 대비·오류 연결·screen reader를 확인한다. 메뉴 세 행동은 기본 글자에서 하단 y≤600을 목표로 실측하며 확대 글자에서는 읽기와 스크롤을 우선한다.

저장 지연/실패/응답 유실, 처음·부분·모두 완료, 뒤로/메뉴/새로고침, 같은 탭·두 탭·두 주제, 낮은 revision, cookie_resume 복원 성공/실패, 저장소 차단, 410 명시 재시작, 동의 갱신, 재제출 차단을 승인된 격리 fixture로 검증한다. 실제 메일·광고·운영 DB에 시험 요청을 보내지 않는다. Stage 4 스크린샷은 `ui/designs/evidence/marketing-demand-validation-round2/stage4/` 아래 생성 예정이며 지금 존재하는 증거가 아니다.

현재 자료는 정적 SVG/PNG·지정 좌표 검사다. 런타임 동작·보안 challenge·브라우저 글꼴·접근성을 실측한 결과가 아니다. 새 광고 영상과의 장면 일치도 미검증이다. 계약 동기화와 static 보완을 독립 Stage 완료·디자인 확정·운영 activation 승인으로 주장하지 않는다.

## Generator 근거와 critic 인계

판단: 세 선택지의 자유를 유지하고 알림을 주 행동으로 구분한다. 공식 r2.1의 카피·보존·동의·복원 경계를 소비한 작성자 제안이다.

보완 요청: [해당 critique](critiques/R2_MENU-critique.md) 소유자가 최신 도면·문서를 재검토한다. 기존 critique와 수정 전 점수는 변경하지 않았다. 정적 보완은 author 작업이며 self-pass를 부여하지 않는다. 실서비스 검증·독립 Stage/authority가 완료될 때까지 draft/pending이다.

## Stage 4 실제 구현 체크포인트 (2026-09-11)

구현은 `components/marketing/round2/round2-view.tsx`와 기존 r2.1 공용 계약을 소비한다. [Stage 4 인수 기록](../../docs/workpacks/marketing-demand-validation-round2/stage4-frontend-handoff.md)의 모드·검증 한계를 함께 읽는다. 독립 authority는 pending이며 정적 도면을 실행 증거로 바꾸지 않는다.

- [recording 320x568 production build 로컬 미리보기](evidence/marketing-demand-validation-round2/stage4/production-preview/recording-320x568-MENU.png)
- [recording 390x844 production build 로컬 미리보기](evidence/marketing-demand-validation-round2/stage4/production-preview/recording-390x844-MENU.png)
- [homeflow 320x568 production build 로컬 미리보기](evidence/marketing-demand-validation-round2/stage4/production-preview/homeflow-320x568-MENU.png)
- [homeflow 390x844 production build 로컬 미리보기](evidence/marketing-demand-validation-round2/stage4/production-preview/homeflow-390x844-MENU.png)

문구와 CTA 순서를 유지하고 `text-wrap: balance`로 제목을 배치한다. 기존 로고 내부 여백을 112px CSS 프레임 안에서 조정했으며 원본 자산은 변경하지 않았다. R2 범위의 브랜드색은 승인 `#00A1FF`로 고정해 기존 전역 변수의 진한 색 상속에 따른 대비 문제를 방지한다.

## R2-AP-001 확대 글자 보완

음식 띠는 정상100%에서72px이며, 고정높이대신최소72px를사용해확대글자에맞게높이가늘어난다. 두topic의320/390px initial/completed MENU200%8조합에서실제잘림0을확인했다. 글자크기나문구를줄이지않았다. [전후근거](evidence/marketing-demand-validation-round2/stage4/r2-ap-001/screenshots.json). 이항목은작성자수정기록이고같은독립reviewer의재검토는pending이다.
