# v74 웹·gen49 worker 운영 확인 — 2026-10-16

승인된 추출기 release `3e58467499c63ba20c3b3191d9dd7dec77a7aa44`를 웹과 worker에 반영했다. 전체 P5 통과 선언은 아니다. 기존 세 영상의 v73 평가28/34와 이번 v74 대표 영상8/10은 서로 다른 실행 묶음으로 보존한다.

## 실제 운영

- 웹: `prelaunch-3e58467499c6-zl8qD7`, 공식 `pnpm deploy:dev` exit0. 배포 선택 검사1451통과/133선택제외/실패0, production build 통과. 기존4개 lint 경고는 유지됐으며 새 경고를 추가한 결과가 아니다.
- worker: v74/verifier47, gen49 단1회 발급·등록·교체, PID49750. 만료 `2026-10-22T14:27:30.000Z`. 모델 `gpt-5.6-luna`, configured selector `gpt-5.6-sol`은 deterministic bypass이며 별도 judge 호출은 없다. CLI `0.154.0-alpha.6.2`, execution signature `06bdcbd216cd40f307ddbb74`.
- source snapshot `6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121`, pipeline `0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583`, artifact `89d78b374187d70099c63e6c5a1877fb2d360b149e23827cbffabc7da54af1bc`.
- 원 C04·personal/DB232 영수증·기존writer·일반 데이터·catalog·fingerprint current/previous/TTL 보존. schema/signing key/권한 확대/추가 generation 변경0. 검증한 full-local archive117872811bytes를 private로 보존했다. 구48은 등록 commit 시 무효화되며 자동 구버전 복귀하지 않는다.
- OFF/queue0/구48정지→manager 최대300초의 원자CAS→새worker 실제 인증/빈claim 거절/health/동일PID→내구verification→ON을 확인했다. manager 파일 제거, activation 시각 `2026-10-16T14:29:38.899Z`.
- metadata3경로는 실제 웹 plist/배포 env와 private current source env에 반영했고 다른 env 값은 보존했다.

원 웹 전용 commit0ae67과 master3e584의 별도 계보는 [전체85파일 byte pair](evidence/youtube-v74-source-handoff-20261016.json)의 고정 SHA와 실제 웹 전환 영수증으로만 연결한다. 원 DB232 maintenance/closedR2 marker를 수정하지 않았다. [준비·차단·해결 이력](youtube-v74-gen49-preparation-safety-20261016.md)을 함께 보존한다.

## 대표 영상 결과

순살소갈비찜 `pjwILwDVC7U`의 설치된 source를 실제 worker와 같은 소유 임시 사본으로 실행했다. 모델1회/repair0, 43.496초다. 첫 검사용 entry가 읽기 전용 artifact에 미디어를 만들려다35ms에 실패했으나 source/media 단계·모델0을 확인했다. 실패·원 시작 기록을 유지하고, byte 동일 임시 사본과 별도 wx model guard로 남은 모델1회만 소비했다. 자동 모델 재시도나 추가 영상 호출은 없다. CLI 내부 재시도는 metadata null이므로 알 수 없다.

숫자 수량8/10, 재료14/15다. 물엿3숟가락·맛술1/2컵·선택 춘장1숟가락·감자2개·당근1개는 모두 정답이다. 늑간살1kg·갈아만든 배500mL도 이번 실제 응답에서 보존됐다.

| 구분 | 실제 결과 | 판단 |
|---|---|---|
| 진간장1/2컵 | raw/final conflicting·null, 자막 반컵과 OCR90mL 인용 | 수량 미해결.90mL로 강제 환산하지 않음 |
| 다진 마늘 크게1숟가락 | 재료 행과 양념 단계 모두 없음 | 실제 재료·조리 단계 누락 |
| 후추약간 | 재료와 단계는 있으나 final unknown·수량null | 모호량 표현 미반영. 재료 누락과 구별 |
| 식용유·물·참기름 | 구조화량은 null, 단계에 팬에 두르기/부족시 물/조금 표현 | 원문null을 보존하고 단계 의미만 약간으로 정규화 |
| 가래떡 | 원량 미확정·null | 임의 수량을 만들지 않음 |

양파 영상 오일에만 허용한 미기재 예외를 이 대표 영상에 확대하지 않았다. `약간=5g` 같은 영양 기본값은 적용하지 않았다. 원시 물 인용1개는 ledger의 literal 인용과 맞지 않아 별도 표시했고 최종 물 인용은 비어 있다. 최종 비어 있지 않은 인용의 literal 위반0은 모든 재료의 source 근거가 완전하다는 뜻이 아니다.

조리 단계는 한입 크기 자르기·겉면 굽기·기름빼기·양념·선택 춘장·섞기·냉장2시간·약불2시간·부족시 물·채소·가래떡/참기름 마무리를 유지했다. 다진 마늘 추가 단계는 누락했다.

## 검증 범위와 원시 증거

최종 선택 회귀285개/9파일·실패/skip0, 격리 PostgreSQL17의 제한 manager CAS/rollback/중복false/fingerprint·권한9개를 확인했다. 실제 gen49 영수증을 원 보호 검사에 넣어 통과했고, committed resume은 추가 발급/CAS/교체 없는 읽기 검사로 통과했다.

제한 worker HTTP actor로 웹 readiness RPC를 직접 호출하면403이며 권한을 넓히지 않았다. 배포된 원 readiness 함수·원 policy 상수를 그대로 transpile하고 pinned READ ONLY DB readiness 관찰값을 넣어 metadata/pipeline/digest 계약 통과를 확인했다. 로그인 사용자 HTTP enqueue·UI·생산 queue/quota/recipe 저장 흐름의 성공을 주장하지 않는다.

정답 SHA `848c29e69fba85ce2a34b08b6bc9c9b6b39f0e2ef309818f2894e8b50975f7b4`와 grading spec/코드를 모델 전 동결했다. [기계 판독 결과와 raw hash](evidence/youtube-v74-operating-20261016.json)를 보존한다. Mac 원시 결과는 `/tmp/mumeok-v74-deployed-smoke-20261016`에 있으며 source·원 모델 JSON/log·read boundary·raw proposal·verifier trace·최종 결과·실패/성공 outcome을 포함한다. private DB dump나 credential은 공유 보고서에 넣지 않는다.
