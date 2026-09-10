# R2_RECOVERY 보조 critique

2026-09-11 · design-critic 보조 · 문서/정적 보드 정합 보완 필요 · 독립 authority pending.
범위는 recording/homeflow 설계와 정적 도면이다. 독립 Stage 승인·디자인 잠금·구현 준비 승인이 아니다.

## 확인 근거

- 두 topic generator: [R2_RECOVERY.md](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_RECOVERY.md)의 recording/homeflow 및 상태 정의. 공통 [설계 방향](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_DESIGN_DIRECTION.md)도 확인했다.
- recording: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png).
- homeflow: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png).
- 최신 기본 보드 4개와 [320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 열었다. SVG 별도 렌더는 하지 않았다.
- 원 ImageGen 보드의 score 78 / revise를 이전 평가로 보존한다. 이 상태는 원 보드에 없으므로 당시 개별 화면 평가는 N/A다.
- geometry 기록은 읽었다. 리더 전달값: controls 122개, 최소 높이 44px, panel 밖 0, MENU 마지막 선택 하단 recording390/320=480/500, homeflow390/320=504/500, ink/blue 5.54:1, white/blue 2.78:1, body/white 8.18:1. 정적 지정 좌표·대비이며 실측 접근성이 아니다. 새 R2_static-checks.json과 visual-verdict-v1.json은 직접 미검토·미수정이다.

## 두 주제 결과

두 주제 모두 원 LEAD 폼을 유지하고 저장 영역 아래 오류·재시도·메뉴를 배치한다.

## 해결

전체 화면을 가리는 오류 대신 inline 복구 구조와 ink 주버튼을 확인했다.

## 남은 finding

minor: '이 탭의 입력은 유지돼요'에 문서의 새로고침 시 폐기 한계가 빠졌다. 오류 아이콘도 도면에서 보이지 않는다.

완료 위계가 다른 경우에는 종료 허용 다음 메뉴 복귀를 우선하는 generator 기준으로 맞추는 것을 권고한다. 원본은 수정하지 않았다. 실제 동작 결함으로 단정하지 않는다.

## 허용된 단계 제약과 Stage4 pending

명확한 실패/응답 유실 구분, EXAMPLE/SURVEY 복구, 완료 유지·입력 수명·보안 재확인·키보드와 짧은 화면 접근. 일부 오류 도면만 있는 것은 허용된 단계 제약이다.

런타임 미구현, 미승인 설문/동의 카피, 일부 대표 장면만 있는 도면은 이번 보조 검토의 허용된 단계 제약이며 초안 작성 blocker가 아니다. 최종 카피·문항 전체·실제 저장/복원/이동은 Stage4에서 확인한다.

SVG의 음절 분리·짧은 마지막 줄·마침표 고립은 현재 내용/행동을 가리지 않아 minor 도면 한계로 수용한다. 다음 출력에서 정리하고 실제 화면 확정 시에는 재검토한다. 최신 완료 변형의 외부 topic/state 라벨은 식별 가능했고 본문을 덮는 충돌은 직접 재현하지 못했다.

Stage4는 두 topic × 320/390폭, 높이 844 및 짧은 568/600, 200% 글자 확대, 자연 스크롤·실제 터치/포커스·필요 화면의 키보드·오류 연결을 검증한다. 320 전체 완료 그림은 부분 완료·390 완료 및 실제 서버 복원 증거가 아니다. 계약 동기화와 독립 authority 승인은 별도 pending이다.

## 후속 메모: 지정 변경만 확인

일부 해결: homeflow 320에서 '입력은 이 탭에서만 유지되며 새로고침하면 지워져요'를 직접 확인했다. 기존 새로고침 폐기 한계 누락 finding은 이 범위에서 종료한다. 오류 아이콘 및 다른 topic/오류 변형의 정합·실제 입력 수명 검증은 유지한다.

직접 확인한 최신 근거는 [homeflow 320 기본판](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png)과 [두 topic 320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) 두 PNG뿐이다. 이 메모가 위 이전 finding의 해결 여부를 갱신하며, 다른 기본판·390폭은 이번에 다시 열지 않았다. 문서·코드 추가 탐색이나 실측은 하지 않았고 독립 Stage/authority 승인은 계속 pending이다.
