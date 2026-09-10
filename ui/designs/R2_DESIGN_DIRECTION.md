# R2 설계 방향 · 승인 r2.1 동기화

Design Status: draft
Authority: pending
Role: design-generator 보조
Contract: r2.1, PR #1551 병합 완료
Merged: `7f00e62c13572b5b2c0d54c997fe628f7a56567e`
Reviewed: `24093c94ebf53676050353088f173ef7f6315445`
Workspace integration: `b9601841` (리더 제공)

공식 기준은 [r2.1 상세 계약](../../docs/marketing-demand-validation-r2-contract.md) §2~4·8이다. 위 SHA는 사용자·리더가 제공한 병합 출처다. 원문 상단의 과거 '독립 검토 전 Draft'와 '미병합 Draft'는 작성 당시 문구이며 현재 계약 승인 상태로 오인하지 않는다. **계약은 승인·병합됐지만 디자인 확정과 독립 authority는 pending**이다.

## 선택한 방향

흰 메뉴와 세 완료 화면을 같은 틀로 사용한다. 초기 MENU는 알림 primary/예시 secondary/의견 text, 세 DONE은 메뉴 primary로 통일한다. 완료한 알림·설문은 접수 확인만, 예시는 다시 보기를 제공한다. 하나만 해도 종료할 수 있고 자동 복귀나 전체 활동 카운터는 없다.

사용자 레퍼런스의 세 활동 자유 선택을 유지하고 동일 무게 대형 카드·대형 캐릭터는 작은 음식 띠와 완료 mascot으로 줄였다. 미검증 시간 약속·계량 없는 자동 기록·정확 영양 보장은 사용하지 않는다. 기존 v2는 브랜드/음식/수치 fixture의 출처만 제공하고 순차 퍼널·질문·API·DB 제약의 권위가 아니다.

공통 값은 이 문서와 [화면 매핑](R2_SCREEN_MAPPING.md)을 따른다. 문서와 정적 도면은 [동일 내용 JSON](evidence/marketing-demand-validation-round2/R2_design-content.json)에서 생성해 줄바꿈을 제외한 카피를 맞춘다. 계약은 source r2.1에서 읽고 SVG의 새 데이터 구조는 정적 레이아웃 정보일 뿐 공개 계약이 아니다.

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

## 구체화한 사용 예시

recording은 제육볶음 320g의 487kcal와 탄수화물31g/단백질39g/지방22g을 기존 fixture에서 가져와 모두 예시·추정치로 표시한다. 재료/양 확인, 완성 1,180g과 먹은 320g 직접 입력, 결과 기록을 세 장면으로 그린다. homeflow는 같은 재료를 구매/보유 제외로 구분하고 요리 완료·남은 제육의 다음 식사 연결을 보여준다. homeflow 분류는 준비된 정적 배치이지 저장된 사용자 데이터가 아니다.

Q1의 가족·동거인/끼니 범위, Q2 전체 옵션, Q4 직접 입력 안내와 동의 label·2026-11-30 표시 보관일을 축약하지 않았다. 모든 설문 문항과 장면은 보조 보드로 제공한다. 긴 폼은 cell 높이를 늘려 전체 스크롤 내용을 표현하며 844px 고정 UI가 아니다.

## 증거와 재현

| 정적 보드 | 파일 | 범위 |
| --- | --- | --- |
| R2_recording_390 | [PNG](evidence/marketing-demand-validation-round2/R2_recording_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_390.svg) | 4열, 8개 cell |
| R2_recording_survey_390 | [PNG](evidence/marketing-demand-validation-round2/R2_recording_survey_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_survey_390.svg) | 4열, 4개 cell |
| R2_recording_320 | [PNG](evidence/marketing-demand-validation-round2/R2_recording_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_320.svg) | 4열, 8개 cell |
| R2_recording_survey_320 | [PNG](evidence/marketing-demand-validation-round2/R2_recording_survey_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_recording_survey_320.svg) | 4열, 4개 cell |
| R2_homeflow_390 | [PNG](evidence/marketing-demand-validation-round2/R2_homeflow_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_390.svg) | 4열, 8개 cell |
| R2_homeflow_survey_390 | [PNG](evidence/marketing-demand-validation-round2/R2_homeflow_survey_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_survey_390.svg) | 4열, 4개 cell |
| R2_homeflow_320 | [PNG](evidence/marketing-demand-validation-round2/R2_homeflow_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_320.svg) | 4열, 8개 cell |
| R2_homeflow_survey_320 | [PNG](evidence/marketing-demand-validation-round2/R2_homeflow_survey_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_homeflow_survey_320.svg) | 4열, 4개 cell |
| R2_completed-state-variants_320 | [PNG](evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.svg) | 4열, 8개 cell |
| R2_example-scenes_390 | [PNG](evidence/marketing-demand-validation-round2/R2_example-scenes_390.png) / [SVG](evidence/marketing-demand-validation-round2/R2_example-scenes_390.svg) | 3열, 6개 cell |
| R2_example-scenes_320 | [PNG](evidence/marketing-demand-validation-round2/R2_example-scenes_320.png) / [SVG](evidence/marketing-demand-validation-round2/R2_example-scenes_320.svg) | 3열, 6개 cell |

정적 재생성은 저장소 루트에서 `node ui/designs/evidence/marketing-demand-validation-round2/R2_render-static-boards.cjs` 후 `node ui/designs/evidence/marketing-demand-validation-round2/R2_sync-design-docs.cjs`다. renderer는 기존 프로젝트/Next.js의 sharp를 먼저 찾고, 없으면 NODE_PATH 또는 R2_SHARP_MODULE을 소비한다. 다른 Mac에서는 load_workspace_dependencies가 반환한 Node.js packages를 NODE_PATH로 지정한다. 개인 절대 경로를 소스에 박거나 새 의존성을 설치하지 않는다. 검사는 `node ui/designs/evidence/marketing-demand-validation-round2/R2_check-designs.cjs`다.

## Stage 4 증거 계획과 미검증

두 주제 × 8상태 × 320/390폭을 실제 구현에서 캡처한다. 높이 844 및 568/600, 첫 화면·중간·하단 스크롤, 200% 글자, 긴 질문/이메일/동의, 키보드 열림과 safe-area, focus·터치·색 대비·오류 연결·screen reader를 확인한다. 메뉴 세 행동은 기본 글자에서 하단 y≤600을 목표로 실측하며 확대 글자에서는 읽기와 스크롤을 우선한다.

저장 지연/실패/응답 유실, 처음·부분·모두 완료, 뒤로/메뉴/새로고침, 같은 탭·두 탭·두 주제, 낮은 revision, cookie_resume 복원 성공/실패, 저장소 차단, 410 명시 재시작, 동의 갱신, 재제출 차단을 승인된 격리 fixture로 검증한다. 실제 메일·광고·운영 DB에 시험 요청을 보내지 않는다. Stage 4 스크린샷은 `ui/designs/evidence/marketing-demand-validation-round2/stage4/` 아래 생성 예정이며 지금 존재하는 증거가 아니다.

현재 자료는 정적 SVG/PNG·지정 좌표 검사다. 런타임 동작·보안 challenge·브라우저 글꼴·접근성을 실측한 결과가 아니다. 새 광고 영상과의 장면 일치도 미검증이다. 계약 동기화와 static 보완을 독립 Stage 완료·디자인 확정·운영 activation 승인으로 주장하지 않는다.

## 보조 검토 경계

generator 보조와 Volta critic은 독립 Stage 승인자가 아니다. critiques는 Volta 소유이며 이번 동기화에서 변경하지 않는다. ImageGen 구상과 visual-verdict-v1/v2는 수정 전 이력으로 보존한다. 신규 도면의 확인·검사 범위는 [인계](R2_DESIGN_HANDOFF.md)와 [정적 검사 기록](evidence/marketing-demand-validation-round2/R2_static-checks.json)을 따른다. README/acceptance/index/PR/metadata 재잠금은 리더 작업이다.
