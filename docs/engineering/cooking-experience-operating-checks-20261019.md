# 실제 요리 경험 운영 확인 — 2026-10-19

## 현재 운영

- 웹 `196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6`, build `prelaunch-196c498f4e1e-CuEg9C`.
- DB235 committed, plan SHA `51c22588ebf813e32537577205177b6083ad5f9965fd19a92ecfad2f6a55db35`. 원235 receipt SHA `8ebf54657f7d47c97c0cfdb575ff81bcf0ae5dbea1e3dcb555efdd2360bc78b6`와 reader floor `1802b2276b6e938e317e7e2cabd6d234547354da`를 보존했다.
- worker gen50·PID73976·policy ON·고정 만료 `2026-10-22T14:27:30Z`. 마지막 읽기 전용 관측은 running/healthy, queued0/processing0/permit0/sharedHolders0/unclassified0이다. Round2/lead/C05 OFF·구키 fallback 금지를 유지한다.
- PR1804의 테스트 전용 후속과 PR1806의 cook-mode label readback을 공식 `pnpm deploy:dev` 경로로 반영했다. 운영 변경과 격리 검증을 아래에서 구분한다.

## 9개 실제 QA 범위

| 요구 | 현재 운영 웹에서 확인한 범위 | 남은 범위 |
| --- | --- | --- |
| 1 완성 무게 | 실제 Chrome 완료 저장·DB 재조회에서 추정600g/직접 입력90g/미확인null 구분. 기존 mix 추정기가75% fallback보다 우선 | 75% fallback 자체는 격리 SQL·단위 검사 통과, 최종 웹의 해당 분기 실제 확인 대기 |
| 2 남색 배경 | 1440px body/root 모두 rgb(17,25,35), 문서 폭1440=viewport1440 | 후속 배포 영향 시 재확인 |
| 3 실행분 수량 수정 | 단위500g→0.5kg, 취소, 명시 수정·새로고침, 4인분 단일 배율, 영양·완료 저장, 원본1/3L·1/7kg 보존 | untouched1/7kg proof의 JSON 정밀도 차이로 다른 행만 수정하면422. [238 수정](cooking-frozen-quantity-json-echo-20261019.md)은 격리51검사·독립 리뷰 통과, 운영 미적용 |
| 4 완료 안내 | 375px 간결한 모달, 보조 설명 접힘, 실측/추정/미확인 구분, 가로 넘침0 | 최종 배포 재확인 |
| 5 오일 연결 | 정확 일반명 alias와 단위 환산 표적 검사 통과 | 최근 두 행은 explicit catalog 선택236·발행237 후 최소 CAS로 반영 대기. 사용자 수정10g/미확인량 보존 |
| 6 원입력 제거 | 상세 모바일·데스크톱에서 라벨 제거,1/3L·1/7kg 양 정보 보존 | 후속 배포 영향 시 재확인 |
| 7 영양표 | 상세 모바일·데스크톱 표, QA 끼니 상세의 계획2인분/1인분 표. 375px 가로 넘침0, 미확인은 ‘정보 준비 중’으로 표시 | 최신 canonical 영양 발행 후 새 끼니·요리의 실제 값 재확인 |
| 8 최근 영양 누락 | 현재 부분 계산은 운영 반영. 정확 DB 선택·현재 내용 발행236/237은 격리 SQL15+20, API/UI72 통과 | 새 운영 authority/최종 source·Chrome 검증·두 오일 CAS 미실행. 상품 불명 자료는 별도 확인 대기 |
| 9 목차 | 실제18개 북에서 데스크톱8개×3페이지, 키보드13쪽 선택/본문 일치, 하단 중복 목차0. 모바일18개 목차 창·이전/다음 유지 | 최종 배포 영향 시 재확인. 화면 크기 전환 시 현재 선택 복원은 별도 확인 사항 |

UI 검증은 사용자 Chrome의 QA 레시피 두 개와18개 북으로 수행했다. 첨부 Library4개의 실제 픽셀을 본 것으로 세지 않는다. 과거 확보한 OCR과 실제 Chrome 관측을 혼동하지 않는다.

## 완료 저장 재조회

읽기 전용 증거 SHA `66066ef9db153a6b2b848192fb842d1e8d56d8b1e2f37be1c8f748a13056f62d`:

- QA batch `40afe86c-5545-4156-8fdb-97e4db609757`: standalone/completed,2인분, finished null·missing, prediction unavailable, execution revision1·nutrition partial.
- QA batch `ab448890-6091-493b-9a86-6db17c93886a`: standalone/completed,4인분, finished600g·known, conditional estimate600g, execution revision1·nutrition complete.
- QA batch `84a0db85-7da9-4265-8016-220b42960f12`: standalone/completed,2인분, finished90g·known, prediction125g와 reported_measurement90g 별도 기록. 실제 음식 계량의 정확도를 주장하지 않는다.
- 세 건 모두 개인 측정 인증0, 팬트리 차감 알림0. UI에서 팬트리 선택0을 확인했다. QA 계획 `7fcbc6fe-d3a0-4760-b60a-20768c965fe6`은 registered이며 원본 재료량도 보존됐다. 다른 사용자 기록은 조사하지 않았다.

## 백업과 다음 배포 경계

암호화 DB·Storage·인증 포함 플랫폼 백업 `cooking-experience-backup-20261019-5OioFg`의 SHA는 `10f8d72f108c3506cf77a1bfa890660bf2c70190b8cfc7f3f17205f870912974`다. 사용자가 승인한 별도 매체의 정확한 새 경로 복사·SHA/HMAC 검사, 격리 DB+Storage 복원과 별도 escrow 키 복구를 완료했다. 원본·기존 승인·이전 실패 기록은 보존했다.

236–238은 원235 승인에 추가하지 않는다. 별도 PIN/guard/receipt, 정확10함수·원235 전체 원장·실행분 전행·scope OID·worker gen50 보존, transaction snapshot 백업과 ACK 미확인 reconcile 검증 뒤에만 반영한다. 기존 C04/개인 실측 writer ON/OFF·retry 권위는235 이후 미지원 상태이며 이번 후속이 새 토글 권한을 만들지 않는다.

## 부모 세션에서 모을 상품 확인 자료

운영과 독립 작업은 계속 진행하며, 아래를 임의의 제조사 수치로 대체하지 않는다.

| 실제 레시피·원본 영상 | 정확한 원천을 정하는 데 부족한 정보 |
| --- | --- |
| [얼큰 만둣국](https://www.youtube.com/watch?v=Y-WKwWA-6-o) | 냉동만두 제품·종류, 육수코인 제품과 희석 전 건조량 |
| [뼈 없는 순살 소갈비찜](https://www.youtube.com/watch?v=pjwILwDVC7U) | 갈아만든배 제품/일반·제로 구분, 늑간살 손질·조리 상태 |
| [꽈리고추 두부볶음 · 연결 검증 · 감사1013](https://www.youtube.com/watch?v=tqpwhtw54mQ) | 조청 원료·제품. 추가 수치 보완 시 대파 흰대/전체, 후추 종류 |
| [하루가 지나도 불지 않는 잡채 · 배포 확인](https://www.youtube.com/watch?v=vqb3WyZmL_8) | 표고가 생것인지 건조 후 불린 것인지 |

일반 식용유의 기존 HOMECOOK_USER_STANDARD 자료는 사용자 대표 기준이며 제조사 실측 자료라고 표시하지 않는다. 건강 정보의 외부 전송은0이다.
