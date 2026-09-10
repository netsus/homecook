# R2_SURVEY_DONE · 의견 접수 완료

Design Status: draft
Authority: pending
Role: design-generator 보조
작성일: 2026-09-11
Contract: #1551 미승인; 설계 입력만 사용
Scope: 이 화면의 recording/homeflow 설계 문서만; 제품 코드·공식 문서·workflow 변경 없음

## 공통 완료 shell과 진입 조건

네 문항의 첫 제출 성공을 서버에서 확인한 경우에만 이 완료 화면을 표시한다. 메뉴와 세 완료 화면은 같은 흰 배경·로고·본문 폭·버튼 계열을 공유한다. '여기서 마쳐도 괜찮아요'가 종료 허용의 주 메시지이며 후속 활동은 전부 선택이다.

## recording 와이어프레임·카피

```text
[무먹 가로 로고]                         56px 앱바
베타 준비 중
[작은 완료 mascot] [접수/확인 텍스트]
의견을 남겨주셔서 감사해요.
집밥 기록에 대한 의견을 접수했어요.
여기서 마쳐도 괜찮아요.
원하시면 다른 활동도 살펴보세요.
[메뉴로 돌아가기]                        blue + ink, 52
[베타 오픈 알림 받기]                             outline, 48
 사용 예시 먼저 보기                               text, 44
```

## homeflow 와이어프레임·카피

```text
[무먹 가로 로고]                         56px 앱바
베타 준비 중
[작은 완료 mascot] [접수/확인 텍스트]
의견을 남겨주셔서 감사해요.
집밥 준비와 관리에 대한 의견을 접수했어요.
여기서 마쳐도 괜찮아요.
원하시면 다른 활동도 살펴보세요.
[메뉴로 돌아가기]                        blue + ink, 52
[베타 오픈 알림 받기]                             outline, 48
 사용 예시 먼저 보기                               text, 44
```

'접수한 답변은 지금 변경하거나 다시 제출할 수 없어요.'를 본문 아래 표시한다. 답변 기반 유형·등급·추천 결과를 생성하지 않는다. 설문에 사용 의향이 없다고 답해도 동일한 감사 화면을 제공한다.

## 치수·상태·이동

`public/assets/funnel/characters/beta-success-mascot.webp`는 390px에서 56×56px, 320px에서 48×48px 이하로 장식 사용한다. 음식 hero·축하 전체 화면·confetti를 추가하지 않는다. 로고는 기존 `public/assets/funnel/brand/mumeok-logo-horizontal.webp`를 100~112px 폭 안에 contain으로 배치한다.

앱바 y 0~56, 상태 y 68, mascot y 100 근처, 제목 y 168/160부터를 기본으로 한다. 제목 블록은 390px 최대 96px, 320px 최대 90px를 기본 예상하되 글자 확대 시 늘린다. 본문과 종료 안내 뒤 20px 간격으로 세 버튼을 놓아 일반 글자 크기에서 첫 메뉴 복귀 버튼이 y 460 안쪽, 마지막 선택이 y 600 안쪽에 오는 것을 목표로 한다. 추가 조건 설명이 길면 스크롤로 모두 읽게 하며 문구를 숨기지 않는다.

| 상태/행동 | 결과 |
| --- | --- |
| 서버 성공 확인 | 해당 완료 제목 표시, 한 번만 polite 알림 |
| 직접 재진입/새로고침 확인 중 | 완료라고 단정하지 않고 '접수 상태 확인 중' 또는 '확인 상태 확인 중'; 메뉴 이동 가능 |
| 성공 확인 불가 | 원 활동 또는 그 활동의 RECOVERY inline으로 연결; 완료 화면을 임의 생성하지 않음 |
| 메뉴 버튼 | MENU, 해당 주제 완료 상태 유지 |
| 알림 선택 | 서버에서 미접수 확인된 경우만 LEAD 제안. 이미 접수했다면 버튼을 없애고 '알림 신청 접수됨' 비대화형 상태 표시. 미확인 중에는 재신청을 권하지 않음 |
| 의견 선택 | 서버에서 미제출 확인된 경우만 SURVEY 제안. 이미 접수했다면 버튼을 없애고 '의견 접수됨' 비대화형 상태 표시. 미확인 중에는 재제출을 권하지 않음 |
| 예시 선택 | EXAMPLE; 완료했다면 label '사용 예시 다시 보기', 새 완료 생성 없음 |
| 아무 행동도 하지 않음 | 현재 완료 화면에 그대로 머묾; 타이머·자동 이동 없음 |
| mascot 누락/실패 | 장식만 생략하고 제목·버튼 그대로 유지 |

같은 주제 안에서는 다른 활동으로 이동해도 서버 확인된 완료를 보존한다. 뒤늦은 응답이 기존 완료를 미완료로 되돌려서는 안 된다. 서버 상태를 아직 읽지 못한 경우는 미확인이며 미완료로 단정하지 않는다. 세 활동에는 선행 조건이 없고 하나만 마쳐도 참여를 마칠 수 있다. 활동 개수 카운터·전체 완료 보상·자동 메뉴 복귀를 두지 않는다.

서버가 같은 참여의 알림 접수를 확인한 경우 LEAD 대신 LEAD_DONE으로 이동하며 이메일을 다시 묻지 않는다. 이메일 존재 여부를 공개 조회하거나 클라이언트 입력만으로 접수 완료라 판단하지 않는다. 이미 완료한 설문은 SURVEY_DONE으로 연결하며 답변 수정·재제출을 제공하지 않는다. 예시는 다시 볼 수 있다. 다른 주제는 별도 참여로 취급하고 완료나 입력을 복사하지 않는다.

브라우저 뒤로 가기로 이전 폼이 열려도 확인된 서버 완료를 기준으로 이 화면을 복원한다. 재제출 폼을 다시 활성화하지 않는다.

입력 없는 완료 화면이므로 키보드를 새로 열지 않는다. 앞선 폼의 가상 키보드가 닫힌 뒤에도 safe-area와 scroll이 안정적이어야 한다. 완료 알림과 제목 초점이 같은 문장을 중복해서 읽지 않는지 실제 보조기기로 확인한다.

## Generator 판단과 critic 인계

판단: 완료를 먼저 확인하고 종료 허용 다음에 선택적 활동을 두는 일관된 shell의 draft다. 필수 확인은 서버 확인 전에 성공을 주장하지 않음, 후속 활동 강요 없음, 주제 문구의 정확성이다. 권장은 세 완료 화면의 제목 시작선·작은 mascot·버튼 간격을 동일하게 유지하는 것이다. 문서 준비는 non-blocker, 서버 성공 의미와 실제 시각 evidence·독립 authority 확정 전 디자인 잠금은 blocker다.

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

리더가 생성 완료를 보고한 4열×2행 정적 도면이다. 각 cell은 해당 320/390 CSSpx 폭이며 모든 8개 상태를 포함한다. 도면의 `R2_SURVEY_DONE` 상태 label로 대응한다. 이 generator는 새 도면을 직접 열어 검증하지 않았다.

| 주제 | 390px 정적 도면 | 320px 정적 도면 |
| --- | --- | --- |
| recording | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png) |
| homeflow | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png) |

각 PNG와 같은 이름의 `.svg`가 정적 도면 원본이다. 런타임 스크린샷이 아니며 Stage 4의 실제 키보드·오류·스크롤·접근성 evidence를 대신하지 않는다. 공통 방향은 리더 소유 `ui/designs/R2_DESIGN_DIRECTION.md`를 참고한다.

`R2_four-screen-family-concept-v1.png`는 ImageGen 참고 보드다. 리더 전달 critic 결과는 78/revise이며 흰 CTA 글자·큰 mascot·homeflow 요약과 완료 후 재진입 제안의 보완이 필요했다. 해당 보드의 불일치를 구현 기준으로 복제하지 않는다. 이는 이 문서 또는 후속 정적 도면의 critic pass가 아니다.

## Stage 4 증거 계획

아래 경로는 **생성 예정**이며 현재 스크린샷 evidence가 아니다. 두 topic 각각 `ui/designs/evidence/marketing-demand-validation-round2/stage4/R2_SURVEY_DONE-{recording|homeflow}-{390x844|320x568}-initial.png`를 남긴다. 같은 이름 뒤 `-scroll`, `-text200`, 필요한 경우 `-keyboard`, `-error`, `-restored` 변형을 기록한다. 레퍼런스·리더의 정적 보드와 실제 렌더를 나란히 비교하고 버튼 경계·줄바꿈·scrollWidth·포커스·computed color의 실측 기록을 첨부한다.

설문만 완료/부정 응답/다른 탭에서 먼저 제출/뒤로 가기 후 재진입에서 수정·재제출이 노출되지 않는 상태를 두 폭·두 주제로 기록한다. 세 완료 화면을 나란히 비교한 이미지와 장문 제목 줄바꿈, 초점 이동·완료 알림·메뉴 상태 보존의 동작 evidence를 남긴다.

현재 evidence는 입력 레퍼런스 직접 확인과 텍스트 설계뿐이다. 리더 소유의 정적 이미지 보드 및 `R2_DESIGN_DIRECTION.md`는 이 작성 범위 밖이다. design-critic 보조 검토는 pending이며 결과를 만들어 적지 않았다. 독립 authority의 실제 화면 검토 후에만 시각 확정을 판단한다.
