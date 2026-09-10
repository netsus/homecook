# R2 병렬 설계 산출물 인계

2026-09-11 · 설계 초안 작성 및 보조 검토 · Design Status `draft` · 독립 authority `pending`.

첫 메뉴와 세 활동 완료를 같은 화면 틀로 정리하고, recording/homeflow 각각 8상태를 문서화했다. 공식 계약 #1551 승인·병합 및 Stage 1 재잠금은 이 결과에 포함하지 않는다. 현재 설계 초안은 구현 준비 승인이 아니다.

## 실제 작성 파일과 화면별 critic 결과

아래 문서는 모두 이 worktree의 `ui/designs/` 아래 새 파일이다. 각 화면 문서는 두 주제를 모두 포함한다.

| 화면 | 설계 파일 | critic 파일 | finding 및 처리 |
| --- | --- | --- | --- |
| 첫 메뉴 | [R2_MENU.md](R2_MENU.md) | [R2_MENU-critique.md](critiques/R2_MENU-critique.md) | 이미지·대비·완료 상태 변형 보완. 자유 순서와 개인정보 링크를 도면에 추가. 밑줄 등 작은 표현 정합은 남음 |
| 알림 접수 완료 | [R2_LEAD_DONE.md](R2_LEAD_DONE.md) | [R2_LEAD_DONE-critique.md](critiques/R2_LEAD_DONE-critique.md) | major였던 버튼 위계 차이를 메뉴 주버튼·예시 보조 버튼으로 수정. 접수 본문·캐릭터 치수 세부 정합은 남음 |
| 예시 확인 완료 | [R2_EXAMPLE_DONE.md](R2_EXAMPLE_DONE.md) | [R2_EXAMPLE_DONE-critique.md](critiques/R2_EXAMPLE_DONE-critique.md) | 보유 재료 제외·장보기 요약을 보강하고 메뉴 주버튼으로 수정. 예시 준비 안내·작은 표현 정합은 남음 |
| 의견 접수 완료 | [R2_SURVEY_DONE.md](R2_SURVEY_DONE.md) | [R2_SURVEY_DONE-critique.md](critiques/R2_SURVEY_DONE-critique.md) | 접수·재제출 금지를 확인하고 메뉴 주버튼으로 수정. 주제별 접수 본문의 도면 반영은 남음 |
| 사용 예시 | [R2_EXAMPLE.md](R2_EXAMPLE.md) | [R2_EXAMPLE-critique.md](critiques/R2_EXAMPLE-critique.md) | 계량·추정·보유 재료 직접 확인 조건 반영. **구체적 마지막 결과 장면 시각화 미완료**. 현재 그림은 흐름 요약으로 명칭을 바로잡음 |
| 네 문항 설문 | [R2_SURVEY.md](R2_SURVEY.md) | [R2_SURVEY-critique.md](critiques/R2_SURVEY-critique.md) | 한 질문·단일 선택·명시적 다음 구조 확인. 최종 네 문항·주제별 선택지·전체 장면 검증 대기 |
| 알림 신청 | [R2_LEAD.md](R2_LEAD.md) | [R2_LEAD-critique.md](critiques/R2_LEAD-critique.md) | 이메일·미체크 동의·보안 영역 구조 확인. 주제별 문구·버튼 문구 정합과 승인 동의/보관일·키보드 검증 대기 |
| 저장 복구 | [R2_RECOVERY.md](R2_RECOVERY.md) | [R2_RECOVERY-critique.md](critiques/R2_RECOVERY-critique.md) | 원 폼을 유지하는 inline 복구 확인. 새로고침 시 입력 폐기 문구 추가. 오류 아이콘 및 예시/설문 오류 변형 검증 대기 |

공통 산출: [R2_DESIGN_DIRECTION.md](R2_DESIGN_DIRECTION.md), 이 인계 문서 `R2_DESIGN_HANDOFF.md`.

generator 보조는 `01a08ccc-c405-7001-82e2-de2db1b51550`, critic 보조는 `01a08ccf-0736-7241-92e1-a3d9449570da`다. 보조 역할 검토이며 별도 Stage 작업의 승인 권한이 아니다. 후속 수정의 확인 범위는 각 critique 마지막 메모를 따른다.

## 시각 근거 경로

아래 파일은 모두 `ui/designs/evidence/marketing-demand-validation-round2/`에 있다.

| 보드 | 파일 | 내용 |
| --- | --- | --- |
| recording 390 | [R2_recording_390.png](evidence/marketing-demand-validation-round2/R2_recording_390.png) | 8상태 |
| recording 320 | [R2_recording_320.png](evidence/marketing-demand-validation-round2/R2_recording_320.png) | 8상태 |
| homeflow 390 | [R2_homeflow_390.png](evidence/marketing-demand-validation-round2/R2_homeflow_390.png) | 8상태 |
| homeflow 320 | [R2_homeflow_320.png](evidence/marketing-demand-validation-round2/R2_homeflow_320.png) | 8상태 |
| 완료 상태 보존 | [R2_completed-state-variants_320.png](evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) | 두 주제의 메뉴+세 완료 화면, 완료 확인·다시 보기 |

각 PNG에 같은 이름의 `.svg` 원본이 있다. 첫 줄은 MENU / LEAD_DONE / EXAMPLE_DONE / SURVEY_DONE 4화면 세트, 두 번째 줄은 EXAMPLE / SURVEY / LEAD / RECOVERY다. 완료 상태 보드는 두 번째 줄이 homeflow다.

그 밖의 실제 파일:

- `R2_four-screen-family-concept-v1.png`: ImageGen 초기 구상, 대비·크기 불일치로 참고용.
- `R2_render-static-boards.cjs`: 정적 SVG/PNG 생성 도구. 제품 React/Next 코드나 웹 프로토타입 아님.
- `R2_static-geometry.json`: 지정된 컨트롤 좌표·대비 계산.
- `R2_static-checks.json`: 확인 범위·제약 기록.
- `R2_visual-verdict-v1.json`, `R2_visual-verdict-v2.json`: 수정 전 보조 판정. 최종 승인 점수가 아님.

## 확인한 것과 간소화한 것

레퍼런스와 기존 로고·제육·캐릭터를 직접 열었다. 최초 음식/캐릭터 미표시를 PNG 형식 임베드로 해결하고 원본 자산은 변경하지 않았다. 보드 5개를 직접 확인했으며 마지막 버튼 위계 보완 후에는 homeflow320과 두 주제 완료 상태 보드를 다시 직접 확인했다. 마지막에 재생성된 나머지 보드 3개까지 재시각검토했다고 주장하지 않는다.

정적 좌표 기준 컨트롤 128개, 최소 높이 44px, 패널 밖 컨트롤 0개다. 첫 메뉴 세 번째 선택지 하단은 480~504px다. 계산한 ink/blue 대비 5.54:1, 본문/white 8.18:1이며 일반 크기 white/blue 2.78:1은 채택하지 않았다. 이 값은 브라우저의 실제 동작·폰트 실측·전체 접근성 인증이 아니다.

대형 hero와 같은 크기 메뉴 카드 셋을 작은 음식 띠와 명확한 3단계 행동 위계로 줄였다. 완료 화면의 캐릭터를 작게 하고 메뉴 복귀를 우선해 추가 활동 강요를 줄였다. 완료 개수 카운터, 자동 복귀, 미검증 시간 약속은 넣지 않았다.

## 남은 조건

구체적인 마지막 사용 예시 결과 장면, 남은 문서/도면 카피·작은 표시 정합은 추가 보완 대상이다. 설문·선택지·동의·보관 종료일·복원 세부는 #1551 승인본을 받아 동기화한다. 한글 음절 분리/고립된 마침표는 정적 도면의 경미한 한계로 기록했다.

Stage 4에서 두 주제·320/390폭·짧은 높이·200% 글자·키보드·safe-area·터치·focus·오류 연결·새로고침·뒤로가기·서버 완료 보존을 실제 화면으로 검증한다. 현재 보드의 설문 첫 장면·동의·보안 자리는 검토용이며 바로 공개할 수 있는 카피가 아니다. 신규 집밥 영상과 장면 일치도 미검증이다.

공식 README/acceptance/API/DB/automation/workflow 상태 재잠금, 제품 코드·DB·배포·PR merge를 수행하지 않았다. 외부 광고·메일·Discord도 발송하지 않았다. 현재 변경은 로컬 설계 파일이며 커밋·push하지 않았다.
