# Beta Release Manual Checklist: 2026-05-04

이 문서는 자동화만으로 닫을 수 없는 베타 후보 P2/P3 항목을 실제 배포 환경에서 확인하기 위한 체크리스트다.

## Usage

- 실행 시점: staging 또는 beta candidate가 HTTPS로 배포된 뒤.
- 실행자: 배포 환경 접근 권한이 있는 사람.
- 기록 위치: `docs/workpacks/beta-candidate-qa-issues-2026-05-04.md`의 해당 이슈 행 또는 별도 QA 리포트.
- 공통 증거: 날짜, 배포 SHA, 기기, OS, 브라우저, 테스트 계정, 스크린샷 또는 짧은 화면 녹화.

## BETA-QA-006: Web Share OS Sheet

Prerequisites:
- HTTPS staging/beta URL.
- 인증된 테스트 계정.
- 구매 대상 항목이 있는 장보기 상세 화면.
- iOS Safari와 Android Chrome 중 최소 하나, 가능하면 둘 다.

Steps:
1. 장보기 상세 화면으로 이동한다.
2. 공유 버튼을 누른다.
3. Web Share API를 지원하는 브라우저에서는 OS 공유 sheet가 열리는지 확인한다.
4. 공유 sheet에서 취소해도 앱이 깨지지 않는지 확인한다.
5. Web Share API를 지원하지 않는 브라우저에서는 clipboard fallback이 동작하는지 확인한다.

Pass criteria:
- 지원 브라우저에서 OS 공유 sheet가 열린다.
- 취소 후에도 장보기 상세 화면과 토스트 상태가 정상이다.
- 미지원 브라우저에서는 공유 텍스트가 clipboard로 복사된다.

## BETA-QA-007: 30-day Eaten Leftover Auto-hide

Prerequisites:
- staging/beta DB에 테스트 계정 전용 남은요리 데이터가 있어야 한다.
- `eaten_at` 또는 `auto_hide_at`을 제어할 수 있는 안전한 테스트 데이터 생성 방법이 있어야 한다.
- 운영 사용자 데이터에는 직접 실험하지 않는다.

Steps:
1. 테스트 계정에 `eaten` 상태 남은요리 2개를 준비한다.
2. 하나는 `auto_hide_at`이 현재 시각보다 미래가 되게 만든다.
3. 다른 하나는 `auto_hide_at`이 현재 시각보다 과거가 되게 만든다.
4. `/leftovers/ate`를 새로고침한다.
5. 미래 항목은 보이고, 과거 항목은 숨겨지는지 확인한다.
6. 숨겨진 항목이 `/leftovers`의 먹는 중 목록으로 되돌아오지 않는지 확인한다.

Pass criteria:
- 30일이 지나지 않은 `eaten` 항목만 다먹음 목록에 보인다.
- 30일이 지난 `eaten` 항목은 다먹음 목록에서 숨겨진다.
- 테스트는 테스트 계정 데이터에만 영향을 준다.

## BETA-QA-008: Wake Lock Cooking Mode

Prerequisites:
- HTTPS staging/beta URL.
- 실제 모바일 기기.
- 인증된 테스트 계정.
- 요리모드로 진입할 수 있는 레시피 또는 플래너 식사.
- 기기의 자동 잠금 시간을 짧게 설정한다.

Steps:
1. 설정 화면에서 화면 꺼짐 방지를 켠다.
2. 요리모드로 진입한다.
3. 자동 잠금 시간보다 길게 화면을 터치하지 않고 둔다.
4. 화면이 유지되는지 확인한다.
5. 설정 화면에서 화면 꺼짐 방지를 끈 뒤 같은 조건으로 다시 확인한다.

Pass criteria:
- 설정이 켜진 상태에서는 지원 브라우저에서 요리모드 중 화면이 꺼지지 않는다.
- 설정이 꺼진 상태에서는 기기 기본 자동 잠금 정책을 따른다.
- 미지원 브라우저에서도 요리모드 진행 자체는 막히지 않는다.

## BETA-QA-010: Lighthouse Tooling Noise

Prerequisites:
- 로컬 또는 CI에서 `pnpm test:lighthouse`를 실행할 수 있어야 한다.
- `.lighthouseci/` 아티팩트를 확인할 수 있어야 한다.

Steps:
1. `pnpm test:lighthouse`를 실행한다.
2. performance assertion 결과가 green인지 확인한다.
3. `.lighthouseci/assertion-results.json`이 비어 있거나 실패 항목이 없는지 확인한다.
4. GitHub token, upload, Node `punycode` 같은 환경성 경고가 실제 실패와 섞여 보이는지 확인한다.

Pass criteria:
- Lighthouse assertion은 통과한다.
- 환경성 경고가 있어도 실패 원인을 가리지 않는다.
- 경고가 CI 리뷰를 방해할 정도로 커지면 별도 tooling cleanup 이슈로 승격한다.
