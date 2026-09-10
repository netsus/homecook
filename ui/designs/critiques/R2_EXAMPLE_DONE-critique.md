# R2_EXAMPLE_DONE 보조 critique

2026-09-11 · design-critic 보조 · 문서/정적 보드 정합 보완 필요 · 독립 authority pending.
범위는 recording/homeflow 설계와 정적 도면이다. 독립 Stage 승인·디자인 잠금·구현 준비 승인이 아니다.

## 확인 근거

- 두 topic generator: [R2_EXAMPLE_DONE.md](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_EXAMPLE_DONE.md)의 recording/homeflow 및 상태 정의. 공통 [설계 방향](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/R2_DESIGN_DIRECTION.md)도 확인했다.
- recording: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png).
- homeflow: [320 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [390 PNG](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png).
- 최신 기본 보드 4개와 [320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 열었다. SVG 별도 렌더는 하지 않았다.
- 원 ImageGen 보드의 score 78 / revise를 이전 평가로 보존한다. 이 화면을 포함한 두 주제 4화면군 전체 점수이며 개별 화면 점수가 아니다.
- geometry 기록은 읽었다. 리더 전달값: controls 122개, 최소 높이 44px, panel 밖 0, MENU 마지막 선택 하단 recording390/320=480/500, homeflow390/320=504/500, ink/blue 5.54:1, white/blue 2.78:1, body/white 8.18:1. 정적 지정 좌표·대비이며 실측 접근성이 아니다. 새 R2_static-checks.json과 visual-verdict-v1.json은 직접 미검토·미수정이다.

## 두 주제 결과

recording은 먹은 분량의 추정 영양, homeflow는 보유 재료를 빼고 장보기부터 남은 요리 관리까지 요약한다. 예시 다시 보기가 있다.

## 해결

mascot 표시·homeflow 핵심 요약 해결. 320 전체 완료 변형에서 알림/의견은 접수 확인으로 표현된다.

## 남은 finding

major: 문서는 메뉴 우선, 도면은 알림 우선으로 완료 행동 위계가 다르다. minor: 문서의 실서비스가 아닌 예시 안내·text 밑줄은 도면과 일치하지 않는다.

완료 위계가 다른 경우에는 종료 허용 다음 메뉴 복귀를 우선하는 generator 기준으로 맞추는 것을 권고한다. 원본은 수정하지 않았다. 실제 동작 결함으로 단정하지 않는다.

## 허용된 단계 제약과 Stage4 pending

재보기 중 완료 유지·중복 저장 방지, 부분 완료/390 변형, 긴 요약 뒤 선택지의 짧은 화면 스크롤.

런타임 미구현, 미승인 설문/동의 카피, 일부 대표 장면만 있는 도면은 이번 보조 검토의 허용된 단계 제약이며 초안 작성 blocker가 아니다. 최종 카피·문항 전체·실제 저장/복원/이동은 Stage4에서 확인한다.

SVG의 음절 분리·짧은 마지막 줄·마침표 고립은 현재 내용/행동을 가리지 않아 minor 도면 한계로 수용한다. 다음 출력에서 정리하고 실제 화면 확정 시에는 재검토한다. 최신 완료 변형의 외부 topic/state 라벨은 식별 가능했고 본문을 덮는 충돌은 직접 재현하지 못했다.

Stage4는 두 topic × 320/390폭, 높이 844 및 짧은 568/600, 200% 글자 확대, 자연 스크롤·실제 터치/포커스·필요 화면의 키보드·오류 연결을 검증한다. 320 전체 완료 그림은 부분 완료·390 완료 및 실제 서버 복원 증거가 아니다. 계약 동기화와 독립 authority 승인은 별도 pending이다.

## 후속 메모: 지정 변경만 확인

major 해결: homeflow 320 기본판과 두 topic 320 전체 완료 변형에서 메뉴 복귀가 blue+ink 주버튼이고 알림/알림 접수 확인은 보조버튼이다. 기존 버튼 위계 불일치는 확인 범위에서 종료한다. 실서비스가 아닌 예시 안내의 정확한 카피·텍스트 행동 표시 차이는 유지한다.

직접 확인한 최신 근거는 [homeflow 320 기본판](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png)과 [두 topic 320 전체 완료 변형](/Users/cwj/.codex/worktrees/d4df/homecook/ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) 두 PNG뿐이다. 이 메모가 위 이전 finding의 해결 여부를 갱신하며, 다른 기본판·390폭은 이번에 다시 열지 않았다. 문서·코드 추가 탐색이나 실측은 하지 않았고 독립 Stage/authority 승인은 계속 pending이다.
