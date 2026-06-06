# COOK_MODE vNext Vision — 조리대 모드 초안

> 목적: 실제 요리 중 멀리서 보고, 손이 젖어도 크게 넘기며, 필요한 재료 양을 즉시 확인하는 요리모드 방향 초안
> 기준: `docs/화면정의서-v1.5.12.md` §14, `docs/요구사항기준선-v1.7.5.md` §1-3, `docs/design/mobile-ux-rules.md`, 기존 `ui/designs/COOK_MODE.md`
> 프로토타입: `ui/designs/prototypes/cook-mode-vision/index.html`
> 브랜드색 기준: `app/globals.css`의 현재 앱 런타임 토큰 `--brand-primary: #00A1FF`

## 사용자 문제

요리 중 사용자는 레시피를 "읽는" 것이 아니라, 손에 든 재료를 보며 "지금 얼마나 넣어야 하는지"를 확인한다. 기존 COOK_MODE는 계약과 기본 UX는 안정적이지만, 긴 조리 문서를 한 화면에 펼친 형태에 가까워서 사용자가 직접 만든 스크린샷/노션 캡처를 확대해 두는 사용 방식과 완전히 경쟁하지 못한다.

이 초안은 요리모드를 일반 화면의 연장선이 아니라, 조리대 위에 고정해 두는 별도 모드로 본다.

## 핵심 방향

이름: **조리대 모드**

- 앱: 한 손가락 큰 탭/스와이프로 넘기는 **단계 큐 카드**.
- 웹: 태블릿이나 노트북을 멀리 둬도 읽히는 **대형 조리 보드**.
- 공통: 전체 재료보다 **이번 단계에 쓸 재료와 양**을 가장 크게 보여준다.
- 공통: 요리 완료/소진 재료 sheet/API 계약은 유지한다.
- 공통: 인분은 진입 전 확정값을 표시만 하고, 요리모드 안에서는 바꾸지 않는다.

## 색상 비교 초안

- **파란 브랜드 배경안**: 현재 앱 런타임 브랜드색 `#00A1FF`를 화면 배경과 CTA에 적극 적용한다. 브랜드 일관성은 강하지만, 장시간 조리 중에는 화면 전체가 밝고 선명하게 느껴질 수 있다.
- **블랙 조리대 배경안**: 원래 앱의 어두운 배경감을 살리고, 행동/선택/수량 강조만 현재 브랜드 파란색으로 유지한다. 요리 중 멀리 두고 볼 때 눈부심이 덜하고, 조리대 위 별도 모드라는 느낌이 더 강하다.
- 둘 다 웹/앱 구조는 동일하게 두고, 최종 선택은 실제 기기 밝기와 주방 조명에서 CTA 가시성, 수량 숫자 대비, 장시간 피로도를 비교해 정한다.

## 앱 화면 초안

### 기본 화면

- 상단에는 레시피명, 조리 인분, 화면 켜짐 상태만 둔다.
- 중앙에는 현재 단계 1개를 크게 보여준다.
- 현재 단계에서 쓰는 재료는 카드 하단이 아니라 별도 `이번에 쓸 양` 영역으로 빼서 숫자를 크게 보여준다.
- 하단에는 이전/다음/완료를 엄지 위치에 둔다.
- 전체 단계 목록은 작은 번호 rail로 표시해 현재 위치를 알 수 있게 한다.

### 재료 확인

- 전체 재료 목록은 기본 화면에서 큰 비중을 차지하지 않는다.
- 대신 현재 단계에 필요한 재료만 상시 노출한다.
- 전체 재료가 필요하면 `재료 보드` 패널에서 한 번에 본다.
- `꺼내둠` 같은 체크는 서버 상태가 아니라 요리 중 로컬 보조 상태로만 다룬다. API/DB 계약을 바꾸지 않는다.

### 스크롤 정책

- 기본 조리 흐름에서는 세로 스크롤 없이 단계 이동으로 본다.
- 조리문이 유난히 긴 단계만 단계 카드 내부에서 스크롤된다.
- 긴 레시피의 전체 목록은 별도 패널/보조 영역에서만 스크롤된다.

## 웹 화면 초안

### 대형 조리 보드

- 좌측: 전체 재료와 총 필요량.
- 중앙: 현재 단계의 큰 instruction, 조리방법, 불세기/시간, 이번 단계 재료량.
- 우측: 단계 목록과 완료 액션.

웹은 화면이 넓으므로 앱처럼 한 카드만 보이게 하지 않는다. 대신 "멀리서도 읽히는 중앙 현재 단계"와 "한눈에 훑는 좌우 보조 정보"를 동시에 둔다.

### 재료량 표시 방식

- 전체 재료량은 좌측에서 확인한다.
- 현재 단계에서 쓰는 양은 중앙에 다시 크게 반복한다.
- 같은 정보를 반복하지만 목적이 다르다.
  - 좌측: 요리 시작 전 꺼내둘 총량
  - 중앙: 지금 손에 들고 넣을 양

## 계약 영향

이 초안은 다음을 바꾸지 않는다.

- `meals.status` 전이 규칙
- 플래너 경유/독립 요리 분리
- 요리모드 내 인분 조절 금지
- `{ success, data, error }` API wrapper
- 완료 시 소진 재료 sheet와 `consumed_ingredient_ids`
- 화면 꺼짐 방지 설정

추후 구현 시 public contract 변경 없이 가능한 범위:

- 현재 단계 index를 클라이언트 local state로 관리
- 현재 단계 재료량은 기존 `ingredients_used` 또는 instruction/ingredient 매핑에서 가능한 범위만 표시
- 전체 재료 보드의 `꺼내둠` 체크는 local-only 처리

추후 문서 승인 또는 contract-evolution이 필요한 범위:

- 단계별 ingredient amount를 API가 구조화해서 보장해야 하는 경우
- 요리 중 진행률을 서버에 저장해야 하는 경우
- 음성/타이머/자동 다음 단계 같은 새 기능을 넣는 경우

## 초안 판정 질문

- 앱 기본 화면에서 스크롤 없이 현재 해야 할 일이 보이는가: 예
- 필요한 재료 양이 instruction보다 먼저 눈에 들어오는가: 예
- 웹 화면이 멀리서도 읽히는 조리 보드인가: 예
- 기존 완료/팬트리/남은요리 계약을 깨지 않는가: 예
- 작은 모바일에서도 CTA와 현재 단계가 가려지지 않는가: 예, `ui/designs/evidence/cook-mode-vision/mobile-layout-430-full.png`에서 앱 프레임 전체를 확인
- 검은 배경안도 웹/앱 모두 비교 가능한가: 예, `ui/designs/evidence/cook-mode-vision/blue-black-comparison-1440-full.png`에서 파란 배경안과 블랙 조리대 배경안을 함께 확인

## 프로토타입 evidence

- 기본 overview: `ui/designs/evidence/cook-mode-vision/overview-1440-full.png`
- 넓은 desktop overview: `ui/designs/evidence/cook-mode-vision/wide-overview-1760.png`
- 모바일 폭 확인: `ui/designs/evidence/cook-mode-vision/mobile-layout-430-full.png`
- 단계 이동 스모크: `ui/designs/evidence/cook-mode-vision/step-2-interaction.png`
- 브랜드색 적용 overview: `ui/designs/evidence/cook-mode-vision/brand-overview-1440-full.png`
- 브랜드색 모바일 폭 확인: `ui/designs/evidence/cook-mode-vision/brand-mobile-layout-430-full.png`
- 브랜드색 넓은 desktop overview: `ui/designs/evidence/cook-mode-vision/brand-wide-overview-1760.png`
- 브랜드색 단계 이동 스모크: `ui/designs/evidence/cook-mode-vision/brand-step-2-interaction.png`
- 파란/블랙 비교 overview: `ui/designs/evidence/cook-mode-vision/blue-black-comparison-1440-full.png`
- 파란/블랙 모바일 폭 확인: `ui/designs/evidence/cook-mode-vision/blue-black-comparison-mobile-430-full.png`
- 파란/블랙 단계 이동 스모크: `ui/designs/evidence/cook-mode-vision/blue-black-step-2-interaction.png`
