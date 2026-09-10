# R2_EXAMPLE · 준비된 사용 예시

Design Status: draft
Authority: pending
Role: design-generator 보조
작성일: 2026-09-11
Contract: #1551 미승인; 설계 입력만 사용
Scope: 이 화면의 recording/homeflow 설계 문서만; 제품 코드·공식 문서·workflow 변경 없음

## 화면 목적

세 장면을 직접 넘겨 주제의 가치를 이해한다. 방문자의 실제 레시피·식사·장보기를 입력하거나 변경하지 않는 준비된 예시다. 장면 1/3 표시는 이 활동 내부 위치만 뜻하며 세 활동의 완료 개수가 아니다.

## recording 와이어프레임·카피

```text
[메뉴로] [무먹 로고]
베타 준비 중 · 실제 서비스가 아닌 사용 예시
내 레시피에서 영양 기록까지
사용 예시 1/3
[제육 작은 이미지 + 재료와 양 확인]
레시피의 재료와 양을 확인하고 필요하면 수정해요.
[이전 장면] [다음 장면]
 베타 오픈 알림 받기
```

| 장면 | 화면 안의 준비된 예시 | 필수 설명 |
| --- | --- | --- |
| 1 | 제육 이미지·재료 확인 목록 | '레시피의 재료와 양을 직접 확인·수정해요.' |
| 2 | 완성 요리 무게 / 먹은 양의 읽기 전용 예시 | '완성한 요리의 무게와 먹은 양을 직접 입력하는 방식이에요.' |
| 3 | 먹은 분량에 연결된 영양 기록 예시 | '영양 정보는 추정치예요. 재료와 입력한 양에 따라 달라져요.' |

숫자를 쓰게 되면 항상 '예시·추정치'를 인접 표시하고 기존 검토된 fixture 수치만 사용한다. 이번 문서에서는 영양 숫자를 새로 만들지 않는다. 실제 숫자 입력·이미지 업로드·추출 요청처럼 보이는 조작을 두지 않는다.

## homeflow 와이어프레임·카피

```text
[메뉴로] [무먹 로고]
베타 준비 중 · 실제 서비스가 아닌 사용 예시
계획부터 남은 요리까지
사용 예시 1/3
[제육 작은 이미지 + 먹을 요리 계획]
먹을 요리를 골라 계획에 담는 예시예요.
[이전 장면] [다음 장면]
 베타 오픈 알림 받기
```

| 장면 | 화면 안의 준비된 예시 | 필수 설명 |
| --- | --- | --- |
| 1 | 제육 요리 계획의 정적 요약 | '먹을 요리를 골라 계획해요.' |
| 2 | 구매할 재료 / 집에 있어 제외한 재료의 두 그룹 | '집에 있는 재료는 직접 확인해 장보기에서 빼요. 자동으로 감지하지 않아요.' |
| 3 | 요리 완료 / 남은 요리를 다음 식사로 잇는 요약 | '요리 완료와 남은 요리 상태를 직접 표시하는 방식이에요.' |

두 그룹은 정적 읽기 전용 요약이며 실제 장보기 체크박스가 아니다. 장면 3은 요리와 남은 요리 관리를 모두 보여준다. 운영 planner 표나 날짜 선택을 새로 구현하라는 지시가 아니다.

## 장면·치수·상태·이동

390px의 내용 폭 350px, 320px의 288px 안에서 이미지 strip은 각각 80/72px, 장면 설명은 16/24px다. y 68부터 준비 안내, y 128부터 제목·장면 위치, y 204 근처에 예시를 배치한다. 장면 영역은 최소 220px이며 긴 설명에 맞춰 늘어난다. 이전/다음 두 버튼은 390px에서 각각 약 169px, 320px에서 138px에 12px 간격, 최소 높이 48/52px다. 마지막 '예시 확인 완료'는 양 폭 모두 별도 전체 폭 52px로 두고 '이전 장면'은 그 아래 44px text로 배치해 좁은 폭의 긴 label 충돌을 피한다.

| 상태/행동 | 결과 |
| --- | --- |
| 초기 | 장면 1. 첫 장면의 이전은 비활성·접근 가능한 이름 유지, 다음은 바로 사용 가능 |
| 이전/다음 | 수동 전환, 장면 제목에 초점, 같은 장면 내부 설명과 컨트롤을 가까이 유지 |
| 마지막 장면 | '예시 확인 완료' 명시 버튼. 열기/스크롤/자동 시간으로 완료하지 않음 |
| 저장 중 | 확인 버튼에 '저장 중'; 예시 탐색·메뉴는 이용 가능 |
| 저장 성공 | EXAMPLE_DONE으로 이동, 다른 활동 상태 유지 |
| 저장 실패 | 마지막 장면을 유지하고 RECOVERY inline; 로컬 확인과 서버 완료 배지를 구분 |
| 완료 후 재방문 | 다시 보기 허용, 완료 기록 재생성 없음. 마지막 버튼 '확인 완료 화면 보기' → EXAMPLE_DONE |
| 예시/이미지 없음 | 이미지 대신 설명 유지. 핵심 장면 자료가 없으면 '예시를 불러오지 못했어요'와 재시도; 완료 성공으로 만들지 않음 |
| 알림 버튼 | LEAD, 서버 확인된 신청자는 LEAD_DONE |
| 메뉴 이동 | MENU. 진행 중 위치는 같은 탭 메모리에서 유지 가능, reload 후 장면 위치 복원은 미확정 |

같은 주제 안에서는 다른 활동으로 이동해도 서버 확인된 완료를 보존한다. 뒤늦은 응답이 기존 완료를 미완료로 되돌려서는 안 된다. 서버 상태를 아직 읽지 못한 경우는 미확인이며 미완료로 단정하지 않는다. 세 활동에는 선행 조건이 없고 하나만 마쳐도 참여를 마칠 수 있다. 활동 개수 카운터·전체 완료 보상·자동 메뉴 복귀를 두지 않는다.

서버가 같은 참여의 알림 접수를 확인한 경우 LEAD 대신 LEAD_DONE으로 이동하며 이메일을 다시 묻지 않는다. 이메일 존재 여부를 공개 조회하거나 클라이언트 입력만으로 접수 완료라 판단하지 않는다. 이미 완료한 설문은 SURVEY_DONE으로 연결하며 답변 수정·재제출을 제공하지 않는다. 예시는 다시 볼 수 있다. 다른 주제는 별도 참여로 취급하고 완료나 입력을 복사하지 않는다.

실제 interactive 폼은 이 화면에 없으므로 키보드를 열 이유가 없다. 키보드 사용자는 이전/다음 및 마지막 완료를 모두 실행할 수 있어야 한다. `public/assets/funnel/food/jeyuk-recipe-clean.webp`, `jeyuk-on-scale.webp` 중 장면 의미에 맞는 기존 이미지를 소형 재사용하고 모양만으로 계량 완료를 주장하지 않는다.

## Generator 판단과 critic 인계

판단: 한 번에 한 장면과 직접 넘기는 버튼을 사용해 작은 화면에서도 조건 설명을 읽을 수 있는 draft다. 필수 확인은 recording 계량 조건, homeflow 직접 재료 확인, 예시와 실서비스의 구분, 마지막 명시 완료의 저장 실패다. 권장은 조작처럼 보이는 가짜 입력 대신 정적 설명을 쓰는 것이다. 초안은 non-blocker, 실제 fixture/시각 evidence/독립 authority 확정 전 시각 잠금은 blocker다.

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

리더가 생성 완료를 보고한 4열×2행 정적 도면이다. 각 cell은 해당 320/390 CSSpx 폭이며 모든 8개 상태를 포함한다. 도면의 `R2_EXAMPLE` 상태 label로 대응한다. 이 generator는 새 도면을 직접 열어 검증하지 않았다.

| 주제 | 390px 정적 도면 | 320px 정적 도면 |
| --- | --- | --- |
| recording | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png) |
| homeflow | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png) | [PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png) |

각 PNG와 같은 이름의 `.svg`가 정적 도면 원본이다. 런타임 스크린샷이 아니며 Stage 4의 실제 키보드·오류·스크롤·접근성 evidence를 대신하지 않는다. 공통 방향은 리더 소유 `ui/designs/R2_DESIGN_DIRECTION.md`를 참고한다.

`R2_four-screen-family-concept-v1.png`는 ImageGen 참고 보드다. 리더 전달 critic 결과는 78/revise이며 흰 CTA 글자·큰 mascot·homeflow 요약과 완료 후 재진입 제안의 보완이 필요했다. 해당 보드의 불일치를 구현 기준으로 복제하지 않는다. 이는 이 문서 또는 후속 정적 도면의 critic pass가 아니다.

## Stage 4 증거 계획

아래 경로는 **생성 예정**이며 현재 스크린샷 evidence가 아니다. 두 topic 각각 `ui/designs/evidence/marketing-demand-validation-round2/stage4/R2_EXAMPLE-{recording|homeflow}-{390x844|320x568}-initial.png`를 남긴다. 같은 이름 뒤 `-scroll`, `-text200`, 필요한 경우 `-keyboard`, `-error`, `-restored` 변형을 기록한다. 레퍼런스·리더의 정적 보드와 실제 렌더를 나란히 비교하고 버튼 경계·줄바꿈·scrollWidth·포커스·computed color의 실측 기록을 첨부한다.

두 주제 × 세 장면의 초기·끝까지 스크롤·완료 실패를 남긴다. 키보드 이전/다음, 새로 열린 장면의 초점, 이미지 실패 fallback, 마지막 장면의 명시 완료, 다시 보기 시 중복 완료 방지와 서버 복원을 검증한다.

현재 evidence는 입력 레퍼런스 직접 확인과 텍스트 설계뿐이다. 리더 소유의 정적 이미지 보드 및 `R2_DESIGN_DIRECTION.md`는 이 작성 범위 밖이다. design-critic 보조 검토는 pending이며 결과를 만들어 적지 않았다. 독립 authority의 실제 화면 검토 후에만 시각 확정을 판단한다.
