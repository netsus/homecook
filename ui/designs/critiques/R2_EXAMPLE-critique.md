# R2_EXAMPLE 보조 critique

2026-09-11 · design-critic 보조 · 문서/정적 보드 정합 보완 필요 · 독립 authority pending.
범위는 recording/homeflow 설계와 정적 도면이다. 독립 Stage 승인·디자인 잠금·구현 준비 승인이 아니다.

## 확인 근거

- 두 topic generator: [R2_EXAMPLE.md](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_EXAMPLE.md)의 recording/homeflow 및 상태 정의. 공통 [설계 방향](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_DESIGN_DIRECTION.md)도 확인했다.
- recording: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png).
- homeflow: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png).
- 최신 기본 보드 4개와 [320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 열었다. SVG 별도 렌더는 하지 않았다.
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

직접 확인한 최신 근거는 [homeflow 320 기본판](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png)과 [두 topic 320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) 두 PNG뿐이다. 이 메모가 위 이전 finding의 해결 여부를 갱신하며, 다른 기본판·390폭은 이번에 다시 열지 않았다. 문서·코드 추가 탐색이나 실측은 하지 않았고 독립 Stage/authority 승인은 계속 pending이다.
