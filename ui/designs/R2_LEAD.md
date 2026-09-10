# R2_LEAD · 베타 오픈 알림 신청 폼

Design Status: draft
Authority: pending
Role: design-generator 보조
작성일: 2026-09-11
Contract: #1551 미승인; 설계 입력만 사용
Scope: 이 화면의 recording/homeflow 설계 문서만; 제품 코드·공식 문서·workflow 변경 없음

## 목적

다른 활동을 먼저 하지 않아도 이메일과 명확한 목적 동의로 알림을 신청한다. 신청 접수와 메일 발송을 구분한다. 계약이 승인되기 전 동의 문구·보관일·보안 위젯 조건을 임의로 확정하지 않는다.

## recording 와이어프레임·카피

```text
[메뉴로] [무먹 로고]
베타 준비 중
집밥 기록, 베타 소식 받기
내 레시피와 먹은 분량을 잇는 기록 기능을 준비 중이에요.
이메일
[이메일 주소 입력]                       52px
[이메일 오류]
[ ] 베타 오픈 알림을 위한 개인정보 수집·이용 동의 (필수)
목적·수집 항목·보관 종료일: 승인 계약 문구 적용 예정
 개인정보처리방침
[보안 확인 영역]
[베타 오픈 알림 신청하기]                 blue + ink, 52
 메뉴로 돌아가기                         text, 44
```

## homeflow 와이어프레임·카피

```text
[메뉴로] [무먹 로고]
베타 준비 중
집밥 관리, 베타 소식 받기
계획부터 장보기, 요리와 남은 요리 관리를 준비 중이에요.
이메일
[이메일 주소 입력]                       52px
[이메일 오류]
[ ] 베타 오픈 알림을 위한 개인정보 수집·이용 동의 (필수)
목적·수집 항목·보관 종료일: 승인 계약 문구 적용 예정
 개인정보처리방침
[보안 확인 영역]
[베타 오픈 알림 신청하기]                 blue + ink, 52
 메뉴로 돌아가기                         text, 44
```

'승인 계약 문구 적용 예정'은 **설계 주석**이며 사용자 화면에 배포할 문구가 아니다. 이 부분이 확정되지 않으면 폼을 실제 수집 가능한 상태로 출시하지 않는다. `public/assets/funnel/brand/mumeok-logo-horizontal.webp`를 공통 크기로 쓰고, `beta-invitation-mascot.webp`는 제목 옆 40px 이하의 장식에 한해 선택적으로 쓴다. 좁은 폭에서는 mascot을 생략해 폼 접근을 우선한다.

## 치수·키보드·접근성

390px 내용 폭 350px, 320px 내용 폭 288px. 상태/제목/설명 다음 y 228~284 근처에 이메일 label과 입력을 배치하는 목표다. 입력 높이는 최소 52px, 글자 16px, label 16/24px다. placeholder만을 label로 사용하지 않는다. 이메일 `type=email`, `autocomplete=email`, 대문자 자동 입력·맞춤법 교정 없음. 긴 주소는 입력 내부에서 이동하고 페이지를 가로로 밀지 않는다.

동의 label은 16/24px로 여러 줄을 허용하며 checkbox hit area 44×44px와 label 전체 클릭 영역을 제공한다. 미리 체크하지 않으며 privacy link 클릭이 동의를 토글하지 않게 분리한다. 실제 동의문 길이·보안 위젯 높이에 따라 CTA는 아래로 자연스럽게 내려간다. 화면 안에 억지로 맞추기 위해 법적 설명을 접거나 가리지 않는다.

Turnstile은 양 폭의 내용 폭에 맞는 공식 지원 표시를 후속 구현에서 사용한다. 320px에서 위젯 잘림이 있으면 시각 축소나 숨김으로 통과시키지 않고 지원 모드를 확인해야 한다. 기본 보안 확인 슬롯 높이를 약 80px로 예상하되 challenge가 커지면 문서가 늘어난다. 이메일 아래 오류와 동의 아래 오류를 각각 연결하고 보안 실패는 그 영역에 재시도와 함께 표시한다.

키보드가 열려도 native 문서 스크롤로 입력·동의·제출 버튼에 도달한다. 고정 footer·transform 배치·키보드 위 가짜 버튼을 만들지 않는다. 제출 후 성공으로 전환할 때 키보드 닫힘과 제목 초점을 확인한다. privacy 확인 후 돌아올 때 폼 초점을 적절히 복원한다.

## 상태·이동·입력 보존

| 상태/행동 | 결과 |
| --- | --- |
| 기본 | 빈 이메일·미체크 동의. 예시/설문 선행 불필요 |
| 서버 상태 확인 중 | 폼은 표시 가능하나 접수 여부 미확인 안내, 저장은 연결 확인을 기다림 |
| 같은 참여의 접수 확인 | LEAD_DONE으로 전환, 이메일 재입력·재신청 요구 없음 |
| 입력 오류 | '이메일 주소를 확인해 주세요' / '알림 신청을 위한 동의가 필요해요' 연결, 값 유지 |
| 보안 확인 실패 | '보안 확인을 다시 진행해 주세요'; 이메일·동의 유지 |
| 제출 중 | '신청 접수 중', 현재 제출만 중복 실행 방지, 메뉴 접근 유지 |
| 서버 성공 영수증 확인 | LEAD_DONE, 입력 이메일을 완료 화면에 재노출하지 않음 |
| 응답 유실·실패 | RECOVERY inline. 성공으로 추정하지 않음. 서버에서 확인된 접수면 LEAD_DONE |
| 재시도 | 사용자가 직접 누름. 이메일 자동 백그라운드 재전송 없음 |
| 이미지 실패 | 장식만 제거, 폼 영향 없음 |
| 계약 문구/보안 준비 누락 | 저장 불가 안내와 메뉴. 임의 보관일·가짜 보안 성공 없음 |

이메일·동의 입력은 같은 주제의 열린 탭 메모리에서만 보존한다. 메뉴 왕복·통신 오류 중 유지하지만 새로고침/탭 종료 시 사라진다. 화면에는 필요 시 '입력은 이 탭을 열어 둔 동안만 유지돼요. 새로고침하면 지워져요.'를 표시한다. IndexedDB/localStorage/URL/분석 로그에 이메일·동의를 넣지 않는다. 보안 토큰은 메모리 전용이고 제출 시 제거한다. 다음 시도에는 필요한 보안 확인을 새로 수행한다.

같은 주제 안에서는 다른 활동으로 이동해도 서버 확인된 완료를 보존한다. 뒤늦은 응답이 기존 완료를 미완료로 되돌려서는 안 된다. 서버 상태를 아직 읽지 못한 경우는 미확인이며 미완료로 단정하지 않는다. 세 활동에는 선행 조건이 없고 하나만 마쳐도 참여를 마칠 수 있다. 활동 개수 카운터·전체 완료 보상·자동 메뉴 복귀를 두지 않는다.

서버가 같은 참여의 알림 접수를 확인한 경우 LEAD 대신 LEAD_DONE으로 이동하며 이메일을 다시 묻지 않는다. 이메일 존재 여부를 공개 조회하거나 클라이언트 입력만으로 접수 완료라 판단하지 않는다. 이미 완료한 설문은 SURVEY_DONE으로 연결하며 답변 수정·재제출을 제공하지 않는다. 예시는 다시 볼 수 있다. 다른 주제는 별도 참여로 취급하고 완료나 입력을 복사하지 않는다.

## Generator 판단과 critic 인계

판단: 목적과 동의를 읽고 스스로 접수하는 짧은 폼 draft다. 필수 확인은 미체크 동의, 실제 보관일·privacy 문구, 작은 폭 보안 위젯, 키보드 위 제출 접근과 이메일 재입력 방지다. 권장은 작은 mascot 이외의 장식을 넣지 않는 것이다. 문서 준비는 non-blocker, 동의/보관·보안 계약 미확정과 실제 키보드 evidence 부재는 디자인 잠금 blocker다.

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

리더가 생성 완료를 보고한 4열×2행 정적 도면이다. 각 cell은 해당 320/390 CSSpx 폭이며 모든 8개 상태를 포함한다. 도면의 `R2_LEAD` 상태 label로 대응한다. 이 generator는 새 도면을 직접 열어 검증하지 않았다.

| 주제 | 390px 정적 도면 | 320px 정적 도면 |
| --- | --- | --- |
| recording | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png) |
| homeflow | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png) |

각 PNG와 같은 이름의 `.svg`가 정적 도면 원본이다. 런타임 스크린샷이 아니며 Stage 4의 실제 키보드·오류·스크롤·접근성 evidence를 대신하지 않는다. 공통 방향은 리더 소유 `ui/designs/R2_DESIGN_DIRECTION.md`를 참고한다.

`R2_four-screen-family-concept-v1.png`는 ImageGen 참고 보드다. 리더 전달 critic 결과는 78/revise이며 흰 CTA 글자·큰 mascot·homeflow 요약과 완료 후 재진입 제안의 보완이 필요했다. 해당 보드의 불일치를 구현 기준으로 복제하지 않는다. 이는 이 문서 또는 후속 정적 도면의 critic pass가 아니다.

## Stage 4 증거 계획

아래 경로는 **생성 예정**이며 현재 스크린샷 evidence가 아니다. 두 topic 각각 `ui/designs/evidence/marketing-demand-validation-round2/stage4/R2_LEAD-{recording|homeflow}-{390x844|320x568}-initial.png`를 남긴다. 같은 이름 뒤 `-scroll`, `-text200`, 필요한 경우 `-keyboard`, `-error`, `-restored` 변형을 기록한다. 레퍼런스·리더의 정적 보드와 실제 렌더를 나란히 비교하고 버튼 경계·줄바꿈·scrollWidth·포커스·computed color의 실측 기록을 첨부한다.

두 주제에서 키보드 열림·동의 장문·보안 challenge·이메일 오류·동의 오류·연결 실패를 촬영한다. privacy 왕복과 메뉴 왕복의 메모리 보존, reload 후 입력 폐기, 확인된 접수자의 폼 우회, 응답 유실 시 성공 단정 방지를 검증한다. Stage 4는 격리된 fixture/테스트 대상만 사용하고 실제 메일 발송이나 운영 lead 제출을 시각 검증에 사용하지 않는다.

현재 evidence는 입력 레퍼런스 직접 확인과 텍스트 설계뿐이다. 리더 소유의 정적 이미지 보드 및 `R2_DESIGN_DIRECTION.md`는 이 작성 범위 밖이다. design-critic 보조 검토는 pending이며 결과를 만들어 적지 않았다. 독립 authority의 실제 화면 검토 후에만 시각 확정을 판단한다.
