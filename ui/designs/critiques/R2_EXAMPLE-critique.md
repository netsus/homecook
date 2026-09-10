# R2_EXAMPLE 보조 critique

## 최신 결론: r2.1 최종 보조검토

보조 design-critic 등급: 🟢 green. 필수 미해결: **0건** (확인한 설계·정적 evidence 범위).
독립 runtime authority: **pending**. 독립 Stage 승인·자가승인·실측 접근성 통과가 아니다.

Canonical 매핑: `R2_RECORDING_EXAMPLE` / `R2_HOMEFLOW_EXAMPLE` → [공유 설계 R2_EXAMPLE.md](../R2_EXAMPLE.md). [전체 16 ID 매핑](../R2_SCREEN_MAPPING.md)과 계약 §2에서 확인했다.

확인 결과: 두 topic × 세 장면을 직접 확인했다. recording은 재료 확인, 완성 1,180g/먹은 320g 입력 예시, 487kcal·탄수화물31g/단백질39g/지방22g의 구체 기록을 예시·추정치로 표시한다. homeflow는 구매/보유 재료 제외 두 그룹과 요리 완료→남은 제육→다음 식사 결과를 보여준다.

이전 finding 처리: 구체 마지막 결과 시각화 major 해결. 장면 1/2 부재, 직접 알림 진입·이전 text·마지막 완료 카피 차이도 해결. 수치는 설계 문서에 기존 fixture 출처가 명시됐으며 영양 정확성을 검증한 것은 아니다. 아래 역사에 남은 '미해결/보류' 중 위에서 해결한 항목은 이 최신 결론으로 대체한다. 남은 필수 도면 수정 요청은 없다.

정책·후속 단계: 계량·사용자 직접 확인 조건을 유지하고 실제 식사/DB 입력처럼 보이는 폼을 만들지 않았다. 수동 전환·마지막 명시 완료·저장 실패·재보기는 Stage4에서 확인한다.

### 실제 확인한 근거와 제한

- [공식 r2.1 계약](../../../docs/marketing-demand-validation-r2-contract.md) §2·3·8, 최신 generator 문서 및 [정적 콘텐츠 JSON](../evidence/marketing-demand-validation-round2/R2_design-content.json)의 준비 안내·Q1 도움말·동의 콘텐츠/구조를 참고했다. JSON 전체 패널 좌표를 재검증한 것은 아니다.
- [recording 기본 320](../evidence/marketing-demand-validation-round2/R2_recording_320.png), [homeflow 기본 320](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png)의 해당 canonical 상태를 직접 확인했다.
- [두 topic 전체 완료 320](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 확인했다. 이 보드는 MENU와 세 DONE에 한정된다.
- [두 주제 세 예시 장면 320](../evidence/marketing-demand-validation-round2/R2_example-scenes_320.png).
- 이번에는 위 기본 2개·완료 1개·예시 1개·설문 2개, 총 **6 PNG**를 직접 열었다. 최신 390 보드 5개는 미검토다. Bohr의 11개 확인은 사용자 전달이며 R2_visual-inspection-r21.json을 직접 검토한 결과로 대신 주장하지 않는다.
- 넓고 긴 전체 내용을 나타낸 정적 도면이며 한 viewport 캡처가 아니다. 길어진 폼/질문의 자연 스크롤, 390·짧은 높이·글자 확대, 실제 키보드/터치/초점/오류 연결, 서버 저장·복원은 Stage4 pending이다. 미구현·운영 미승인을 도면 작성 blocker로 세지 않았다.
- 일부 어절 줄바꿈·외부 라벨 밀집은 식별을 막지 않는 보조 evidence minor 한계로 남긴다. 기존 ImageGen 78/revise는 당시 전체 보드의 역사적 평가이며 현행 등급과 구분한다.

## 이전 검토 이력 (현행 판정은 상단 참조)

2026-09-11 · design-critic 보조

계약 기준: 병합된 r2.1 소비 (#1551, 7f00e62c; 사용자/리더 전달).
독립 runtime authority: pending.
보조 design-critic 등급: 🟡 yellow. 기존 확인 근거의 미해결 항목과 최종 보조검토 대기를 나타내며, 새 도면을 평가한 등급이 아니다.
아래 finding·후속 메모는 당시 검토 이력으로 보존한다. 과거 계약 승인/동기화 대기 표현은 이 상단의 현재 계약 상태로 대체하며, 새 copy·EXAMPLE 수정본 검토는 별도 지시 후 수행한다.
범위는 recording/homeflow 설계와 정적 도면이다. 독립 Stage 승인·디자인 잠금·구현 준비 승인이 아니다.

## 확인 근거

- 두 topic generator: [R2_EXAMPLE.md](../R2_EXAMPLE.md)의 recording/homeflow 및 상태 정의. 공통 [설계 방향](../R2_DESIGN_DIRECTION.md)도 확인했다.
- recording: [320 PNG](../evidence/marketing-demand-validation-round2/R2_recording_320.png), [390 PNG](../evidence/marketing-demand-validation-round2/R2_recording_390.png).
- homeflow: [320 PNG](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [390 PNG](../evidence/marketing-demand-validation-round2/R2_homeflow_390.png).
- 최신 기본 보드 4개와 [320 전체 완료 변형](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 열었다. SVG 별도 렌더는 하지 않았다.
- 원 ImageGen 보드의 score 78 / revise를 이전 평가로 보존한다. 이 상태는 원 보드에 없으므로 당시 개별 화면 평가는 N/A다.
- geometry 기록은 읽었다. 리더 전달값: controls 122개, 최소 높이 44px, panel 밖 0, MENU 마지막 선택 하단 recording390/320=480/500, homeflow390/320=504/500, ink/blue 5.54:1, white/blue 2.78:1, body/white 8.18:1. 정적 지정 좌표·대비이며 실측 접근성이 아니다. 새 R2_static-checks.json과 visual-verdict-v1.json은 직접 미검토·미수정이다.

## 두 주제 결과

recording은 직접 재료·양 확인과 계량·추정 조건, homeflow는 직접 보유 재료 제외·장보기와 남은 요리 관리를 설명한다.

## 해결

최신 음식 이미지와 homeflow 장보기 명칭 정상 표시. 실제 서비스가 아닌 예시·명시적 완료 버튼 확인.

## 남은 finding

major: 도면의 마지막 장면은 단계 목록이고 문서의 구체적 결과 예시와 다르다. minor: 직접 알림 진입 및 마지막 이전 버튼 형태가 문서와 다르다.

완료 위계가 다른 경우에는 종료 허용 다음 메뉴 복귀를 우선하는 generator 기준으로 맞추는 것을 권고한다. 원본은 수정하지 않았다. 실제 동작 결함으로 단정하지 않는다.

## 허용된 단계 제약과 Stage4 pending

구체적 기존 fixture 결과, 장면 1/2와 마지막 장면 정합, 다시 보기·저장 실패·초점. 현재 일부 장면만 그린 것은 허용된 단계 제약이다.

런타임 미구현, 미승인 설문/동의 카피, 일부 대표 장면만 있는 도면은 이번 보조 검토의 허용된 단계 제약이며 초안 작성 blocker가 아니다. 최종 카피·문항 전체·실제 저장/복원/이동은 Stage4에서 확인한다.

SVG의 음절 분리·짧은 마지막 줄·마침표 고립은 현재 내용/행동을 가리지 않아 minor 도면 한계로 수용한다. 다음 출력에서 정리하고 실제 화면 확정 시에는 재검토한다. 최신 완료 변형의 외부 topic/state 라벨은 식별 가능했고 본문을 덮는 충돌은 직접 재현하지 못했다.

Stage4는 두 topic × 320/390폭, 높이 844 및 짧은 568/600, 200% 글자 확대, 자연 스크롤·실제 터치/포커스·필요 화면의 키보드·오류 연결을 검증한다. 320 전체 완료 그림은 부분 완료·390 완료 및 실제 서버 복원 증거가 아니다. 계약 동기화와 독립 authority 승인은 별도 pending이다.

## 후속 메모: 지정 변경만 확인

일부 해결: homeflow 320 제목이 '사용 예시 · 흐름 요약'으로 바뀌어 실제 도면의 설명 목록에 맞는 표현이 됐다. 구체적 마지막 결과 시각화와 generator의 마지막 장면 정합 major는 미해결이다. 직접 알림 진입·이전 버튼 형태 등 기존 문구/행동 차이도 유지한다.

직접 확인한 최신 근거는 [homeflow 320 기본판](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png)과 [두 topic 320 전체 완료 변형](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) 두 PNG뿐이다. 이 메모가 위 이전 finding의 해결 여부를 갱신하며, 다른 기본판·390폭은 이번에 다시 열지 않았다. 문서·코드 추가 탐색이나 실측은 하지 않았고 독립 Stage/authority 승인은 계속 pending이다.
