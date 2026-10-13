# 베타 v9 — 조리 안내·데스크톱 요리·추출 알림

상태: T7/B08/C02, T10, T11 구현·독립 리뷰 확인, 운영 미반영.

## 계약과 변경

- 조리법 시작에 ‘재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다’를 정확히 표시한다. 기존 조리문·시간·온도·숫자를 변경하거나 수량을 추가하지 않는다. 현재 cooking 입력에 신뢰 가능한 원본 인분 필드가 없어 임의 숫자를 덧붙이지 않는다.
- 요리 전용 CSS Module의 local root 아래에서만 데스크톱 폭·재료/단계 열·조작 가시성을 조정한다. 모바일320/375 배치는 유지한다. 기존 app/globals.css는 HEAD와 byte 동일하며 변수·마케팅 화면 변경0이다.
- 알림의 유튜브 추출 결과를 성장·활동 영역보다 DOM/시각적으로 먼저 둔다. 각 영역 내부 정렬·읽음·링크·loading/empty/error 처리는 유지한다. 새 추출·모델 호출0.
- 요리모드 인분 조절 UI, 단계별 수량 삽입, 별도 전체량 패널, 사용자의 수동 재료 연결을 만들지 않는다. 완료/저장·세션·영양·권한 계약은 불변이다.

## 검사와 한계

- 독립 GPT-6.1 Sol xhigh 리뷰:6파일125검사 통과·차단0. 원문/안내·snapshot/legacy 경로·알림순서·스타일 경계를 확인했다.
- 로컬 실제 브라우저10검사:320/375/1280/1440의 요리·알림 새/지난 상태, legacy planner1280/1440. 데스크톱은 module root 밖 같은 기존 클래스의 폭/스크롤이 바뀌지 않는 negative 검사를 포함한다. 독립 리뷰자는 제공된 PNG와 검사 구현/결과를 검토했으며10검사를 직접 재실행했다는 주장은 하지 않았다.
- local class3개와 rule15개, cooking component3개 import만 사용한다. global stylesheet SHA256 `500928c1cf6c0d6fd7510844335d5ec0c552b63da84bbe0508cb936573582976` 유지. Vitest에서는 저장소의 기존 패턴으로 CSS Module을 mock하고 실제 스타일은 Next 브라우저 검사로 확인한다.
- 구현 당시 lint/typecheck/Anti Slop 신규0/diff check 통과. 첫 묶음과 C06 main 통합 후 재검사 및 최종 배포 빌드를 이어간다.
- 실제 운영 계정의 요리 화면/기존 결과 알림·실제 완료 여정·Safari는 미확인. 로컬 fixture를 실제 운영 결과로 확대하지 않는다.
- 별도 상세: `/tmp/mumeok-v9-cooking-handoff.md`, `/tmp/mumeok-v9-cooking-style-scope.json`, `/tmp/mumeok-beta-cooking-review.md`; 화면은 이 worktree의 test-results에 보존.
