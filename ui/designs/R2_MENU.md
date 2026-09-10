# R2_MENU · 자유 선택 첫 메뉴

Design Status: draft
Authority: pending
Role: design-generator 보조
작성일: 2026-09-11
Contract: #1551 미승인; 설계 입력만 사용
Scope: 이 화면의 recording/homeflow 설계 문서만; 제품 코드·공식 문서·workflow 변경 없음

## 화면 목적과 방향

알림 신청·예시·의견 중 원하는 활동을 바로 고른다. 큰 hero 대신 작은 음식 strip과 주제별 한 문장 가치를 먼저 보여준다. 알림을 가장 강하게 두는 것은 자발적인 출시 관심 표현을 쉽게 하려는 판단이며 전환 상승을 보장하는 주장은 아니다.

## recording 와이어프레임·카피

```text
[무먹 가로 로고]                         앱바
베타 준비 중 · 사용 예시
내 레시피로 만든 집밥,
먹은 만큼 영양 기록
레시피의 재료 정보를 가져와 확인하고,
완성한 요리와 먹은 분량을 기록으로 연결해요.
[제육 72~80px] 내 레시피 → 먹은 분량 → 추정 영양
[베타 오픈 알림 받기]                    blue + ink, 52
[사용 예시 먼저 보기]                    outline, 48
 의견만 남기기 · 4문항                    text, 44
현재는 사용 예시를 확인할 수 있어요.
실제 서비스는 베타 오픈 후 안내드려요.
하나만 해도 괜찮아요. 순서는 자유예요.
[개인정보처리방침]
```

## homeflow 와이어프레임·카피

```text
[무먹 가로 로고]                         앱바
베타 준비 중 · 사용 예시
뭐 먹을지 정한 다음,
장보기부터 남은 요리까지
요리 계획에 필요한 재료를 모으고,
집에 있는 재료를 빼서 장보고,
남은 요리를 다음 식사로 이어가요.
[제육 72~80px] 계획 → 장보기 → 요리 → 남은 요리
[베타 오픈 알림 받기]                    blue + ink, 52
[사용 예시 먼저 보기]                    outline, 48
 의견만 남기기 · 4문항                    text, 44
현재는 사용 예시를 확인할 수 있어요.
실제 서비스는 베타 오픈 후 안내드려요.
하나만 해도 괜찮아요. 순서는 자유예요.
[개인정보처리방침]
```

가치는 위 문구로 전달하고 homeflow에 칼로리 카드를 섞지 않는다. strip은 짧은 문구가 2줄까지 늘 수 있는 보조 예시이며 실제 조작 UI처럼 보이는 input을 넣지 않는다. `public/assets/funnel/brand/mumeok-logo-horizontal.webp`는 폭 100~112px, 높이 최대 32px의 contain과 이름 '무먹'을 사용한다. `public/assets/funnel/food/jeyuk-recipe-clean.webp`는 작은 제육 이미지로 재사용한다. 음식 설명이 옆에 있으면 장식 alt를 비운다.

## 세로 치수 예산

safe-area를 제외한 문서 상단 y 기준, 두 주제 모두 적용할 기본 글자 크기 목표다. 계약의 긴 설명이 줄바꿈될 가능성을 미리 반영한다.

| 영역 | 390px 목표 | 320px 목표 |
| --- | --- | --- |
| 앱바 | y 0~56 | y 0~56 |
| 상태 / 제목 / 설명 | y 68~256 이내 | y 68~292 이내 |
| 음식 strip | y 268~348, 80px | y 304~376, 72px |
| 주 버튼 | y 364~416 | y 392~444 |
| 예시 버튼 | y 424~472 | y 452~500 |
| 의견 버튼 | y 480~524 | y 508~552 |
| 준비·자유 선택 안내 | y 536 이후 | y 564 이후 |

세 선택지가 기본 크기에서 y≤600 안에 모두 보이는 것이 목표이며 아직 실측한 결과가 아니다. 긴 본문은 감추거나 줄임표 처리하지 않는다. 더 큰 글자·브라우저 chrome·safe-area로 목표가 벗어나면 음식 영역과 장식 여백부터 줄이고 자연 스크롤을 유지한다.

## 상태와 이동

| 상태/행동 | 표시와 결과 |
| --- | --- |
| 최초 HTML / 연결 중 | 메뉴·예시·질문·알림 폼은 바로 열림. 완료 표시는 '완료 여부 확인 중'. 저장 영역만 연결 안내 |
| 확인된 완료 없음 | 버튼 아래 '아직 완료한 활동이 없어요'; 선택을 막거나 과제로 표현하지 않음 |
| 알림 접수 확인됨 | 같은 위치 버튼 '알림 접수 확인' → LEAD_DONE |
| 예시 완료 확인됨 | 같은 위치 버튼 '사용 예시 다시 보기' → EXAMPLE; '확인 완료' 보조 텍스트 |
| 설문 완료 확인됨 | 같은 위치 버튼 '의견 접수 확인' → SURVEY_DONE; 수정 화면 없음 |
| 기본 버튼 | LEAD / EXAMPLE / SURVEY 중 해당 활동으로 바로 이동 |
| 상태 조회 실패 | 메뉴 유지. 하단에 RECOVERY 안내, 완료 배지를 임의 확정하지 않음 |
| 이미지 없음/실패 | 예약 strip 높이와 설명 유지; 깨진 이미지 아이콘 대신 음식명 텍스트 |

같은 주제 안에서는 다른 활동으로 이동해도 서버 확인된 완료를 보존한다. 뒤늦은 응답이 기존 완료를 미완료로 되돌려서는 안 된다. 서버 상태를 아직 읽지 못한 경우는 미확인이며 미완료로 단정하지 않는다. 세 활동에는 선행 조건이 없고 하나만 마쳐도 참여를 마칠 수 있다. 활동 개수 카운터·전체 완료 보상·자동 메뉴 복귀를 두지 않는다.

서버가 같은 참여의 알림 접수를 확인한 경우 LEAD 대신 LEAD_DONE으로 이동하며 이메일을 다시 묻지 않는다. 이메일 존재 여부를 공개 조회하거나 클라이언트 입력만으로 접수 완료라 판단하지 않는다. 이미 완료한 설문은 SURVEY_DONE으로 연결하며 답변 수정·재제출을 제공하지 않는다. 예시는 다시 볼 수 있다. 다른 주제는 별도 참여로 취급하고 완료나 입력을 복사하지 않는다.

폼을 열었다가 돌아오면 해당 메뉴 버튼으로 초점을 복원한다. 초기 저장 장애가 메뉴를 덮는 modal이나 전체 loading 화면을 만들면 blocker다.

## Generator 판단과 critic 인계

판단: 사용자 이미지의 세 활동 선택 구조를 보존하고, 방문자 목적에 맞게 알림/예시/의견의 위계를 구분한 draft다. 필수 확인은 320px homeflow 본문 줄바꿈에서도 세 선택지 접근 가능 여부와 느린 연결 중 첫 메뉴 표시다. 권장은 완료 안내를 각 행동 옆에 짧게 붙이고 0/3 진행 표시를 만들지 않는 것이다. 초안 작성 자체는 non-blocker, 시각 확정은 evidence와 독립 authority 부재로 blocker다.

## 공통 시각·접근성 기준

| 항목 | 390px | 320px |
| --- | --- | --- |
| 좌우 여백 / 내용 폭 | 20px / 350px | 16px / 288px |
| 제목 | 24px / 행간 32px, 700 | 22px / 행간 30px, 700 |
| 본문·입력·버튼 | 16px / 행간 24px | 16px / 행간 24px |
| 앱바 / 최소 터치 | 56px / 44×44px | 56px / 44×44px |
| primary / secondary / tertiary | 최소 52 / 48 / 44px | 최소 52 / 48 / 44px |
| 컴포넌트 간격 / 섹션 간격 | 8~12 / 20~24px | 8~12 / 16~20px |

흰 배경과 surface, ink `#212529`, 본문 `#495057`, 기존 `--brand-primary: #00A1FF`를 사용한다. primary는 밝은 파랑 위 dark ink이며 흰 글자를 올리지 않는다. secondary는 흰 면·진한 글자·식별 가능한 진한 outline, tertiary는 밑줄 있는 진한 text다. 컨트롤 radius는 기존 8px, 작은 카드 10px를 재사용한다. 본문에 연한 회색이나 파란색만 사용하지 않는다. 폰트는 기존 Avenir Next/Pretendard 계열을 유지한다. 토큰 전역 변경 지시가 아니다.

문서 본문 하나만 자연스럽게 세로 스크롤한다. 고정 높이, 내부 세로 스크롤, 큰 hero, sticky 하단 CTA를 두지 않는다. 하단에 24px + safe-area 여백을 둔다. 최소 높이는 글자가 늘면 확장하며 확대 글자를 자르지 않는다. 200% 글자 확대에서는 첫 화면 압축보다 읽기·스크롤 접근을 우선한다. 키보드가 열리면 현재 입력·오류·다음 행동까지 같은 문서에서 스크롤 가능해야 한다.

화면 제목으로 진입 초점을 옮기되 사용자 입력 중 비동기 응답은 초점을 빼앗지 않는다. DOM 읽기·Tab 순서는 표시 순서와 같게 한다. 버튼은 native button, 이동은 목적에 맞는 link로 구현할 계획이다. 포커스는 진한 2px 외곽선과 2px 간격, 상태는 글자와 아이콘을 함께 제공한다. 오류는 해당 입력의 `aria-describedby`와 `aria-invalid`에 연결하고 제출 시 첫 오류로 이동한다. 접수 완료는 `aria-live=polite`로 한 번만 알린다. 자동 전환·자동재생 없이 줄어든 모션 설정을 따른다. 대비·초점·키보드 동작은 아직 실측하지 않았다.

## 기준·권위 경계

직접 확인한 사용자 레퍼런스: `/Users/cwj/.codex/attachments/b3fa24a0-a944-4f19-ad74-f6bf19cc1d2c/codex-clipboard-1e8ed358-8f8f-4c70-a85a-8c6c3b7c71a7.png`. 세 활동을 고르는 의도를 따르며 큰 인물·동일 무게의 세 카드·미검증 시간 약속은 복제하지 않는다.

진단: `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-landing-diagnosis.md`. 계약 입력: `/Users/cwj/.codex/worktrees/9540/homecook/docs/marketing-demand-validation-r2-contract.md` §2~3, PR #1551 미승인 초안이다. 해당 경로는 이후 보완될 수 있으며 API 세부·설문 문구·옵션·보존 정책을 이 문서로 확정하지 않는다.

`docs/design/design-tokens.md`, `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`, `.codex/agents/design-generator.toml`의 체크리스트를 참고했다. 역할 파일의 과거 주황색/375px/앱 4탭 예시는 이번 사용자 지정 파랑/320·390px/독립 캠페인 메뉴의 권위가 아니다. 현재 작업은 기존 HOME·RECIPE_DETAIL·PLANNER_WEEK를 변경하지 않는 신규 캠페인 화면 초안이며 독립 디자인 검토가 필요하다.

기존 잘못된 v2 workpack 초안과 v2 강제 활동 순서를 r2 권위로 사용하지 않는다. 공식 계약 병합 후 리더가 문구·복원 의미를 동기화하고 재잠금해야 한다. 이 문서와 generator 판단은 독립 Stage 승인이나 구현 준비 승인이 아니다.
## 정적 도면 참조

리더가 생성 완료를 보고한 4열×2행 정적 도면이다. 각 cell은 해당 320/390 CSSpx 폭이며 모든 8개 상태를 포함한다. 도면의 `R2_MENU` 상태 label로 대응한다. 이 generator는 새 도면을 직접 열어 검증하지 않았다.

| 주제 | 390px 정적 도면 | 320px 정적 도면 |
| --- | --- | --- |
| recording | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png) |
| homeflow | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png) |

각 PNG와 같은 이름의 `.svg`가 정적 도면 원본이다. 런타임 스크린샷이 아니며 Stage 4의 실제 키보드·오류·스크롤·접근성 evidence를 대신하지 않는다. 공통 방향은 리더 소유 `ui/designs/R2_DESIGN_DIRECTION.md`를 참고한다.

`R2_four-screen-family-concept-v1.png`는 ImageGen 참고 보드다. 리더 전달 critic 결과는 78/revise이며 흰 CTA 글자·큰 mascot·homeflow 요약과 완료 후 재진입 제안의 보완이 필요했다. 해당 보드의 불일치를 구현 기준으로 복제하지 않는다. 이는 이 문서 또는 후속 정적 도면의 critic pass가 아니다.

## Stage 4 증거 계획

아래 경로는 **생성 예정**이며 현재 스크린샷 evidence가 아니다. 두 topic 각각 `ui/designs/evidence/marketing-demand-validation-round2/stage4/R2_MENU-{recording|homeflow}-{390x844|320x568}-initial.png`를 남긴다. 같은 이름 뒤 `-scroll`, `-text200`, 필요한 경우 `-keyboard`, `-error`, `-restored` 변형을 기록한다. 레퍼런스·리더의 정적 보드와 실제 렌더를 나란히 비교하고 버튼 경계·줄바꿈·scrollWidth·포커스·computed color의 실측 기록을 첨부한다.

두 주제의 초기/한 활동 완료/모두 완료/서버 상태 미확인/통신 실패를 촬영한다. 첫 세 버튼의 y 경계를 실제 DOM으로 측정한다. 네트워크를 지연해도 메뉴 HTML·예시·질문을 열 수 있는지, 이미 신청한 사람이 입력 폼으로 되돌아가지 않는지 확인한다.

현재 evidence는 입력 레퍼런스 직접 확인과 텍스트 설계뿐이다. 리더 소유의 정적 이미지 보드 및 `R2_DESIGN_DIRECTION.md`는 이 작성 범위 밖이다. design-critic 보조 검토는 pending이며 결과를 만들어 적지 않았다. 독립 authority의 실제 화면 검토 후에만 시각 확정을 판단한다.
