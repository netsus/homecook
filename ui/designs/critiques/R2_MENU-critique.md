# R2_MENU 보조 critique

## 최신 결론: r2.1 최종 보조검토

보조 design-critic 등급: 🟢 green. 필수 미해결: **0건** (확인한 설계·정적 evidence 범위).
독립 runtime authority: **pending**. 독립 Stage 승인·자가승인·실측 접근성 통과가 아니다.

Canonical 매핑: `R2_RECORDING_MENU` / `R2_HOMEFLOW_MENU` → [공유 설계 R2_MENU.md](../R2_MENU.md). [전체 16 ID 매핑](../R2_SCREEN_MAPPING.md)과 계약 §2에서 확인했다.

확인 결과: recording의 고정 제목·설명과 추정 영양, homeflow의 고정 제목·설명과 보유 재료 제외 장보기를 확인했다. 알림 primary → 예시 secondary → 의견 text, 준비·자유 순서·privacy·미완료 안내와 전체 완료 변형이 문서와 맞는다.

이전 finding 처리: 음식/대비/자유 순서/privacy/밑줄/카피/완료 변형 관련 이전 finding 해결. 아래 역사에 남은 '미해결/보류' 중 위에서 해결한 항목은 이 최신 결론으로 대체한다. 남은 필수 도면 수정 요청은 없다.

정책·후속 단계: bootstrap 실패에도 메뉴·예시·질문은 열고 저장만 대기. cookie_resume으로 기존 서명 쿠키 참여를 복원하면 제출 가능; 저장소·유효 쿠키가 모두 없으면 draft 열기만 허용하고 신규 메모리 참여를 만들지 않는 문서 규칙이 계약 §2와 맞는다.

### 실제 확인한 근거와 제한

- [공식 r2.1 계약](../../../docs/marketing-demand-validation-r2-contract.md) §2·3·8, 최신 generator 문서 및 [정적 콘텐츠 JSON](../evidence/marketing-demand-validation-round2/R2_design-content.json)의 준비 안내·Q1 도움말·동의 콘텐츠/구조를 참고했다. JSON 전체 패널 좌표를 재검증한 것은 아니다.
- [recording 기본 320](../evidence/marketing-demand-validation-round2/R2_recording_320.png), [homeflow 기본 320](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png)의 해당 canonical 상태를 직접 확인했다.
- [두 topic 전체 완료 320](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 확인했다. 이 보드는 MENU와 세 DONE에 한정된다.
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

- 두 topic generator: [R2_MENU.md](../R2_MENU.md)의 recording/homeflow 및 상태 정의. 공통 [설계 방향](../R2_DESIGN_DIRECTION.md)도 확인했다.
- recording: [320 PNG](../evidence/marketing-demand-validation-round2/R2_recording_320.png), [390 PNG](../evidence/marketing-demand-validation-round2/R2_recording_390.png).
- homeflow: [320 PNG](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [390 PNG](../evidence/marketing-demand-validation-round2/R2_homeflow_390.png).
- 최신 기본 보드 4개와 [320 전체 완료 변형](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png)을 직접 열었다. SVG 별도 렌더는 하지 않았다.
- 원 ImageGen 보드의 score 78 / revise를 이전 평가로 보존한다. 이 화면을 포함한 두 주제 4화면군 전체 점수이며 개별 화면 점수가 아니다.
- geometry 기록은 읽었다. 리더 전달값: controls 122개, 최소 높이 44px, panel 밖 0, MENU 마지막 선택 하단 recording390/320=480/500, homeflow390/320=504/500, ink/blue 5.54:1, white/blue 2.78:1, body/white 8.18:1. 정적 지정 좌표·대비이며 실측 접근성이 아니다. 새 R2_static-checks.json과 visual-verdict-v1.json은 직접 미검토·미수정이다.

## 두 주제 결과

두 주제 모두 알림/예시/의견 위계, 자유 종료, 베타 안내가 보인다. recording은 추정 영양, homeflow는 보유 재료 제외·장보기 가치를 전달한다.

## 해결

제육 표시·주버튼 ink 대비·homeflow 장보기 요약 해결. 320 전체 완료 변형의 접수 확인/다시 보기 확인.

## 남은 finding

minor: 문서의 개인정보처리방침 링크·텍스트 행동 밑줄·자유 순서 문구가 기본 도면과 다르다.

완료 위계가 다른 경우에는 종료 허용 다음 메뉴 복귀를 우선하는 generator 기준으로 맞추는 것을 권고한다. 원본은 수정하지 않았다. 실제 동작 결함으로 단정하지 않는다.

## 허용된 단계 제약과 Stage4 pending

부분 완료/조회 중/오류, 390 완료 변형, 메뉴를 가리지 않는 초기 연결, 실제 복원·포커스·스크롤.

런타임 미구현, 미승인 설문/동의 카피, 일부 대표 장면만 있는 도면은 이번 보조 검토의 허용된 단계 제약이며 초안 작성 blocker가 아니다. 최종 카피·문항 전체·실제 저장/복원/이동은 Stage4에서 확인한다.

SVG의 음절 분리·짧은 마지막 줄·마침표 고립은 현재 내용/행동을 가리지 않아 minor 도면 한계로 수용한다. 다음 출력에서 정리하고 실제 화면 확정 시에는 재검토한다. 최신 완료 변형의 외부 topic/state 라벨은 식별 가능했고 본문을 덮는 충돌은 직접 재현하지 못했다.

Stage4는 두 topic × 320/390폭, 높이 844 및 짧은 568/600, 200% 글자 확대, 자연 스크롤·실제 터치/포커스·필요 화면의 키보드·오류 연결을 검증한다. 320 전체 완료 그림은 부분 완료·390 완료 및 실제 서버 복원 증거가 아니다. 계약 동기화와 독립 authority 승인은 별도 pending이다.

## 후속 메모: 지정 변경만 확인

일부 해결: homeflow 320 기본 MENU에서 '하나만 해도 괜찮아요. 순서는 자유예요.'와 개인정보처리방침 링크 추가를 직접 확인했다. 기존 자유 순서·개인정보 링크 누락 finding은 이 확인 범위에서 종료한다. 텍스트 행동 밑줄 등 남은 표현 차이와 다른 폭/상태의 정합 검증은 유지한다.

직접 확인한 최신 근거는 [homeflow 320 기본판](../evidence/marketing-demand-validation-round2/R2_homeflow_320.png)과 [두 topic 320 전체 완료 변형](../evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png) 두 PNG뿐이다. 이 메모가 위 이전 finding의 해결 여부를 갱신하며, 다른 기본판·390폭은 이번에 다시 열지 않았다. 문서·코드 추가 탐색이나 실측은 하지 않았고 독립 Stage/authority 승인은 계속 pending이다.
