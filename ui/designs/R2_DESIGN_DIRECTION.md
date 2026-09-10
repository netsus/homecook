# R2 설계 방향과 검토 범위

작성일: 2026-09-11. Design Status: `draft`. 독립 디자인 authority: `pending`.
이 문서는 Stage 1의 병렬 설계 보조 산출물이다. #1551 공식 계약은 미병합이며 #1550 재잠금, Stage 1 완료, 구현 준비 승인 근거가 아니다.

## 선택한 방향

흰 바탕의 간결한 메뉴와 같은 틀의 세 완료 화면을 사용한다. 사용자 이미지의 자유 선택 구조를 유지하며 첫 선택은 `베타 오픈 알림 받기`, 다음은 `사용 예시 먼저 보기`, 마지막은 `의견만 남기기 · 4문항`이다. 레퍼런스의 같은 크기 대형 카드 셋은 행동 우선순위가 흐려지고 320폭에서 길어져 채택하지 않았다. 대형 캐릭터 대신 작은 기존 음식 이미지로 주제를 설명하고, 완료 화면에만 작은 기존 캐릭터를 쓴다.

완료 화면은 성공 설명, `여기서 마쳐도 괜찮아요.`, 선택적 다른 활동 순서로 통일한다. 알림 접수는 메일 발송 완료가 아니다. 다른 활동은 어느 순서로든 선택할 수 있고 하나만 해도 종료할 수 있다. 자동 복귀·활동 전체 진행률·완료 강요는 없다.

critic 정합 검토 후 세 완료 화면은 모두 `메뉴로 돌아가기`를 blue+ink 주버튼으로 둔다. 알림·예시·의견은 선택적 보조 행동이다. 초기 MENU의 알림 우선과, 활동을 마친 DONE의 메뉴 우선은 서로 다른 맥락이다. EXAMPLE 그림은 흐름 요약이며 구체적인 마지막 결과 장면을 대신하지 않는다.

## 입력 근거와 권위

- 사용자 이미지: `/Users/cwj/.codex/attachments/b3fa24a0-a944-4f19-ad74-f6bf19cc1d2c/codex-clipboard-1e8ed358-8f8f-4c70-a85a-8c6c3b7c71a7.png`를 직접 확인했다.
- 진단: `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-landing-diagnosis.md`. 시작 미관측을 버튼 잘림의 인과관계로 해석하지 않는다.
- UI 계약 입력: `/Users/cwj/.codex/worktrees/9540/homecook/docs/marketing-demand-validation-r2-contract.md` §2–3의 작업 시점 초안. 질문·선택지·복원·저장·동의 상세는 승인 후 다시 맞춘다.
- 기존 `MARKETING_DEMAND_VALIDATION_V2.md`는 자산과 화면 재료의 참고다. 순차 설문·유형 결과·시간 약속·자동 다음 이동을 R2 계약으로 가져오지 않는다.
- `docs/design/design-tokens.md`, `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`, `docs/engineering/product-design-authority.md`를 따른다. 제품 HOME/PLANNER 등 실제 anchor를 바꾸지 않는다.

## 치수와 시각 재료

| 요소 | 390폭 | 320폭 |
| --- | --- | --- |
| 본문 좌우 여백 | 20px | 16px |
| 제목 | 24px / 행간 32px | 22px / 행간 30px |
| 본문 | 16px / 24px | 16px / 24px |
| 안내 | 14px / 22px | 14px / 22px |
| 주 버튼 | 52px, 둥글기 8px | 동일 |
| 보조 버튼 | 48px | 동일 |
| 텍스트 행동 | 최소 44px | 동일 |
| 메뉴 음식 띠 | 높이 72px | 동일 |
| 완료 캐릭터 | 64×72px 안에 비율 유지 | 동일 |

기존 브랜드 `#00A1FF`, 흰 surface, 본문 `#495057`, ink `#212529`를 재사용한다. 밝은 블루의 일반 크기 흰 글자는 대비가 부족하여 주 버튼에 기존 ink를 쓴다. 로고 자체의 브랜드 그림과 버튼 글자의 접근성 판단을 구분한다. 선택과 오류는 색 외에도 체크·설명·테두리로 식별한다. 런타임 토큰을 수정하지 않는다.

자산은 `public/assets/funnel/brand/mumeok-logo-horizontal.png`, `food/jeyuk-recipe-clean.webp`, `characters/beta-success-mascot.webp`를 그대로 참조한다. PNG 캐릭터는 녹색 배경이 있으므로 투명 WebP를 사용한다. WebP에도 일부 녹색 가장자리가 남아 있어 실제 크기에서 후속 검토한다. 새 캐릭터나 외부 음식 이미지를 추가하지 않는다.

## 화면별 산출

| 화면 | 설계 문서 | critic 문서 |
| --- | --- | --- |
| MENU | R2_MENU.md | critiques/R2_MENU-critique.md |
| LEAD_DONE | R2_LEAD_DONE.md | critiques/R2_LEAD_DONE-critique.md |
| EXAMPLE_DONE | R2_EXAMPLE_DONE.md | critiques/R2_EXAMPLE_DONE-critique.md |
| SURVEY_DONE | R2_SURVEY_DONE.md | critiques/R2_SURVEY_DONE-critique.md |
| EXAMPLE | R2_EXAMPLE.md | critiques/R2_EXAMPLE-critique.md |
| SURVEY | R2_SURVEY.md | critiques/R2_SURVEY-critique.md |
| LEAD | R2_LEAD.md | critiques/R2_LEAD-critique.md |
| RECOVERY | R2_RECOVERY.md | critiques/R2_RECOVERY-critique.md |

각 문서에 recording/homeflow 변형을 둔다. 설문 첫 장면은 공통 문항 예시이며 나머지 질문은 각 설계 문서의 계약 동기화 범위를 따른다. 도면의 동의·보관 문구와 보안 영역은 검토자용 자리표시다. 이 상태로 사용자에게 제공하지 않는다.

## 시각 근거의 구분

`ui/designs/evidence/marketing-demand-validation-round2/`:

- `R2_four-screen-family-concept-v1.png`: ImageGen 구상 보드. 첫 메뉴+세 완료 화면, 두 주제. 흰 CTA 글자와 캐릭터 크기가 설계 지시와 달라 참고용으로만 보존한다.
- `R2_recording_390.png`, `R2_recording_320.png`, `R2_homeflow_390.png`, `R2_homeflow_320.png`: SVG 정적 도면. 각 보드 첫 줄에 공통 4화면 세트, 두 번째 줄에 나머지 활동·복구 4화면을 배치한다.
- 같은 이름의 `.svg`: 편집 가능한 정적 도면. 기존 자산은 원본 이미지 바이트를 포함하며 재생성·수정하지 않는다.
- `R2_completed-state-variants_320.png` / `.svg`: 서버가 완료를 확인한 메뉴와 세 완료 화면. 두 주제 모두 알림·의견은 접수 확인으로, 예시는 다시 보기로 연결한다.
- `R2_render-static-boards.cjs`: 위 정적 SVG/PNG를 만드는 증거용 도구. 제품 코드나 클릭 가능한 웹 프로토타입이 아니다. 실행 중 서비스/API/브라우저를 사용하지 않는다.
- `R2_static-geometry.json`: 지정 좌표와 색 대비 계산. 브라우저 실측이나 접근성 동작 시험 결과가 아니다.

SVG rasterizer의 WebP 미표시를 해결하기 위해 임베드 시에만 PNG로 형식 변환한다. 원본 WebP 파일과 시각 내용은 유지한다. `R2_visual-verdict-v1.json`은 수정 전 보조 판정이며, 쓰기 소유권 제한에 맞춰 `.omx/state` 대신 이 증거 폴더에 둔다.

고정 도면은 줄바꿈·배치·행동 우선순위를 검토하는 자료다. 자동 레이아웃, 확대 글자, 키보드, screen reader, 저장 성공 여부는 이 이미지로 증명할 수 없다. 정적 그림에 다른 활동이 미완료인 경우를 표현했지만 실제 메뉴는 확인된 완료 상태를 유지해야 한다. 완료한 알림을 재입력 폼으로 보내거나 제출된 설문을 다시 열어서는 안 된다.

## Stage 4 실제 화면 검증 계획

두 주제 × 8상태 × 320/390폭을 기본 캡처한다. 뷰포트 높이는 844와 짧은 600을 포함하고 메뉴 세 행동의 도달 가능성, 세로 스크롤 시작/중간/하단을 확인한다. 200% 글자 확대에서 버튼을 줄이지 않고 자연스럽게 스크롤하도록 한다. 고정 높이로 내용을 자르거나 가로 스크롤을 만들지 않는다.

LEAD/SURVEY는 키보드 열림, focus 이동, 긴 이메일, inline 오류, 동의 미선택, 보안 대기/실패, 429·연결 끊김을 캡처한다. 제출은 문서 흐름 안에 두고 safe-area 하단 여백을 확보한다. 오류와 입력은 `aria-describedby`, 질문은 `fieldset/legend`, 상태는 `aria-live=polite`로 연결한다. focus 표시 2px와 간격 2px를 확보하고 터치 영역 44×44px 이상을 실측한다.

MENU bootstrap 지연/오류에서도 설명과 세 활동 진입은 보인다. 서버 완료는 응답 전에 단정하지 않는다. 저장 실패는 해당 행동 옆에 안내하며 메뉴를 덮지 않는다. 복구 때 기존 완료를 지우지 않고 입력을 보존하되, 이메일은 같은 탭의 메모리만 사용하고 새로고침 이후 보존을 약속하지 않는다. 완료 저장 응답 지연, 재시도, 뒤로가기, 새로고침, 두 탭, 두 주제, 이미 신청/설문 완료 상태를 별도로 검증한다.

EXAMPLE은 준비된 장면만 표시한다. 이전/다음과 명시적 완료 버튼을 구분한다. 계량·사용자 확인 필요, 추정 영양, 보유 재료 직접 제외를 설명한다. `30초`, 계량 없는 자동 기록, 영양 정확 보장은 사용하지 않는다.

## 검토와 남은 조건

generator 보조: `01a08ccc-c405-7001-82e2-de2db1b51550`.
critic 보조: `01a08ccf-0736-7241-92e1-a3d9449570da`.
둘은 역할 보조이며 독립 Stage 1.5/Stage 5/final authority 승인을 대신하지 않는다.

최종 설문 카피·선택지, 보관 종료일·동의 문구, API 기반 복원 세부는 #1551 승인본으로 동기화해야 한다. 신규 집밥 영상과 장면 일치 여부도 미확인이다. 공식 계약 병합과 별도 재잠금 지시 이후 README/acceptance/metadata를 처리하며, 현재 문서들만으로 디자인 잠금이나 구현 준비를 선언하지 않는다.
