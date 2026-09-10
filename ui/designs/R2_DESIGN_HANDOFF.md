# R2 설계 동기화 인계

Design Status: draft
Authority: pending
Role: design-generator 보조
Contract: r2.1, PR #1551 병합 완료
Merged: `7f00e62c13572b5b2c0d54c997fe628f7a56567e`
Reviewed: `24093c94ebf53676050353088f173ef7f6315445`
Workspace integration: `b9601841` (리더 제공)

공식 기준은 [r2.1 상세 계약](../../docs/marketing-demand-validation-r2-contract.md) §2~4·8이다. 위 SHA는 사용자·리더가 제공한 병합 출처다. 원문 상단의 과거 '독립 검토 전 Draft'와 '미병합 Draft'는 작성 당시 문구이며 현재 계약 승인 상태로 오인하지 않는다. **계약은 승인·병합됐지만 디자인 확정과 독립 authority는 pending**이다.

## 변경 범위

[16 ID 매핑](R2_SCREEN_MAPPING.md), [공통 방향](R2_DESIGN_DIRECTION.md), 8개 화면 문서와 소유 evidence의 정적 renderer·문서 generator·검사기를 갱신했다. 새로운 React/Next 페이지·API·DB·배포·commits는 만들지 않았다. 공식 파일·README/acceptance/metadata와 Volta 소유 critiques는 리더/critic 작업이다.

| 상태 | 작성 문서 | critic 인계 핵심 |
| --- | --- | --- |
| MENU | [R2_MENU.md](R2_MENU.md) | 승인 title/description, readiness, 세 선택지·완료 변형 정합 |
| EXAMPLE | [R2_EXAMPLE.md](R2_EXAMPLE.md) | 구체적 마지막 영양 기록/장보기·남은 요리 결과와 장면1~3 추가; major 재검토 요청 |
| EXAMPLE_DONE | [R2_EXAMPLE_DONE.md](R2_EXAMPLE_DONE.md) | 메뉴 primary와 주제별 접수 본문, 이미 완료한 활동 접수 확인만 |
| SURVEY | [R2_SURVEY.md](R2_SURVEY.md) | Q1 범위 안내, Q2 전체 옵션/value, Q4 조건을 승인본으로 동기화 |
| SURVEY_DONE | [R2_SURVEY_DONE.md](R2_SURVEY_DONE.md) | 메뉴 primary와 주제별 접수 본문, 이미 완료한 활동 접수 확인만 |
| LEAD | [R2_LEAD.md](R2_LEAD.md) | 정확 동의·보관일·만14세·미동의 대안, 주제별 카피 통일 |
| LEAD_DONE | [R2_LEAD_DONE.md](R2_LEAD_DONE.md) | 메뉴 primary와 주제별 접수 본문, 이미 완료한 활동 접수 확인만 |
| RECOVERY | [R2_RECOVERY.md](R2_RECOVERY.md) | cookie_resume 성공/쿠키 없는 제한 모드, 메모리 수명·410·동의 갱신 명시 |

## 정적 보드

| 이름 | 경로 | 범위 |
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

기본판은 4열×2행이며 첫 행 MENU/LEAD_DONE/EXAMPLE_DONE/SURVEY_DONE, 둘째 행 EXAMPLE/SURVEY/LEAD/RECOVERY다. EXAMPLE은 마지막 장면, SURVEY는 Q1을 대표하고 추가 보드에 전체 장면/문항을 담았다. 셀 폭은 정확히 320/390 CSSpx, 높이는 전체 내용에 맞게 늘어난다. 정적 SVG와 해당 raster PNG이며 런타임 스크린샷이 아니다.

## 재현과 검사

정적 재생성은 저장소 루트에서 `node ui/designs/evidence/marketing-demand-validation-round2/R2_render-static-boards.cjs` 후 `node ui/designs/evidence/marketing-demand-validation-round2/R2_sync-design-docs.cjs`다. renderer는 기존 프로젝트/Next.js의 sharp를 먼저 찾고, 없으면 NODE_PATH 또는 R2_SHARP_MODULE을 소비한다. 다른 Mac에서는 load_workspace_dependencies가 반환한 Node.js packages를 NODE_PATH로 지정한다. 개인 절대 경로를 소스에 박거나 새 의존성을 설치하지 않는다. 검사는 `node ui/designs/evidence/marketing-demand-validation-round2/R2_check-designs.cjs`다.

[designChecks·relativeLinks·실제 파일 검사 기록](evidence/marketing-demand-validation-round2/R2_static-checks.json), [지정 geometry](evidence/marketing-demand-validation-round2/R2_static-geometry.json). 이 인계는 검사 통과를 미리 선언하지 않으며 실제 실행 결과는 해당 기록을 따른다. 직접 확인한 렌더 목록과 lint 결과는 후속 [시각 확인 기록](evidence/marketing-demand-validation-round2/R2_visual-inspection-r21.json)에 기록한다.

## 남은 사항과 critic 요청

기존 마지막 예시 major와 문서/도면 카피 차이에 대해 위 보완을 제공했다. 해결 여부는 Volta가 최신 파일로 판단하며 author self-pass는 없다. 과거 critique 내용과 기존 visual-verdict-v1/v2 점수를 새 결과로 덮어쓰지 않는다.

## Stage 4 증거 계획과 미검증

두 주제 × 8상태 × 320/390폭을 실제 구현에서 캡처한다. 높이 844 및 568/600, 첫 화면·중간·하단 스크롤, 200% 글자, 긴 질문/이메일/동의, 키보드 열림과 safe-area, focus·터치·색 대비·오류 연결·screen reader를 확인한다. 메뉴 세 행동은 기본 글자에서 하단 y≤600을 목표로 실측하며 확대 글자에서는 읽기와 스크롤을 우선한다.

저장 지연/실패/응답 유실, 처음·부분·모두 완료, 뒤로/메뉴/새로고침, 같은 탭·두 탭·두 주제, 낮은 revision, cookie_resume 복원 성공/실패, 저장소 차단, 410 명시 재시작, 동의 갱신, 재제출 차단을 승인된 격리 fixture로 검증한다. 실제 메일·광고·운영 DB에 시험 요청을 보내지 않는다. Stage 4 스크린샷은 `ui/designs/evidence/marketing-demand-validation-round2/stage4/` 아래 생성 예정이며 지금 존재하는 증거가 아니다.

현재 자료는 정적 SVG/PNG·지정 좌표 검사다. 런타임 동작·보안 challenge·브라우저 글꼴·접근성을 실측한 결과가 아니다. 새 광고 영상과의 장면 일치도 미검증이다. 계약 동기화와 static 보완을 독립 Stage 완료·디자인 확정·운영 activation 승인으로 주장하지 않는다.

정적 수치 검사는 메뉴 하단 y≤600, 컨트롤 최소44px, cell 밖 geometry와 source 카피/링크를 대상으로 한다. 키보드·실제 폰트·서버 접수·privacy 운영 게시·Turnstile readiness·실제 영상 일치는 아직 검증하지 않았다. Stage 1 전체 완료·독립 authority·실서비스 준비 승인은 계속 별도 pending이다.

## 최종 보조 검토 인계 (2026-09-11)

critic 보조 `01a08ccf-0736-7241-92e1-a3d9449570da`의 r2.1 재검토 결과: MENU, EXAMPLE, EXAMPLE_DONE, SURVEY, SURVEY_DONE, LEAD, LEAD_DONE, RECOVERY 모두 green, 확인 범위의 필수 미해결0이다. 구체적인 마지막 예시 결과 major와 카피·완료 버튼 위계 모순을 닫았다. 해당 판단은 8개 critique의 최신 결론에 기록되어 있다.

critic은 대표 PNG6개를 직접 확인했으며 최신390폭 전체를 다시 보지는 않았다. generator는 최종11개 PNG를 직접 확인했다. 경미한 글꼴·줄바꿈·픽셀 차이를 실제 브라우저 수준으로 확정하지 않는다. 16 canonical 화면의 실제 키보드/scroll/모션/접근성/서버복원 검증과 독립 runtime authority는 Stage4 이후 pending이다. green은 보조 설계 검토 결과이며 독립 internal1.5 승인·Stage1 merge·구현 준비 승인·배포 승인이 아니다.
