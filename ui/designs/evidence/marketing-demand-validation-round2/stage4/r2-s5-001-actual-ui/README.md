# R2-S5-001 실제 UI / API / DB 관측 근거

이 패키지는 Stage4 작성 작업의 검증 산출물이며 독립 Stage5 승인 결과가 아니다. 최종 실제 실행은 `node scripts/verify-marketing-round2-ui-isolated.mjs --lead-edit`였다. 최종 무옵션 명령을 실행했다고 주장하지 않는다.

## 실행 구분

| 디렉터리 | 격리 target | 전체 결과 | 범위 |
| --- | --- | --- | --- |
| `2026-09-11T05-12-03-095Z` | `hcg_62361_25ba35` | FAIL | 기존24조건과 추가1조건의 완료 뒤, 미접수 retry 요청 발행을 기다리기 전 배열을 확인한 검증 코드의 대기 누락. trace 마지막에는 실제 새 token 요청이 관측된다. 전체 PASS로 사용하지 않는다. |
| `2026-09-11T05-17-43-601Z` | `hcg_70927_a2354a` | PASS / exit0 | 수정 후 S5 추가4조건만 실행. 기존24는 명시적으로 제외. |
| `2026-09-11T05-19-39-943Z` | `hcg_74053_7748de` | PASS / exit0 | 기존24조건과 S5 추가4조건을 한 번의 전체 실행에서 검증. 위 두 실행의 합산으로 대체하지 않았다. |

모든 실행은 pinned CLI `2.110.0`, migration SHA `6e04722b44718c0f3e62579dd5617370b68a4a813d3164c816952079b009d3c8`의 fresh isolated target이다. 실제 Next 페이지 / Next API / PostgreSQL을 사용했고 보안 확인 외부 공급자만 local transport fixture로 대체했다. 운영 DB를 선택하지 않았다.

## 최종 전체 실행 관측

- 기존24: 두 topic의 활동별 단독 완료와 reload, 각6순서, 다중 탭·topic, 실제410 재시작, 실제409 재동의, 예시 commit 후 응답 유실, 실제429 시간 제한과 복원, IndexedDB 차단 후 cookie-resume.
- 추가4: 각 topic에서 lead commit200 후 브라우저 응답 유실 → 이메일 편집 → 원event/원이메일의 tokenless receipt200 → 추가 lead write 없음. 각 topic에서 첫 송신을 서버 도달 전에 중단 → 이메일 편집 → 실제 API tokenless422와 DB0행 → 원이메일 복원·새 동의·새 challenge → 같은 event의 실제 commit200과 DB1행.
- 첫 미접수 실패의 주입 지점은 브라우저 송신 전이다. 실제503 발생 시험이나 실제 공급자 장애라고 일반화하지 않는다. 이후422/200/DB검사는 실제 경로다.
- 응답 envelope208개, 시간순 관측1,316개, 화면 이동 관측50개(reload21개), cookie-resume 요청1개, 마스킹 캡처 기록115건(고유 PNG113개; 공유 탭/주제의 메뉴와 예시 완료 파일명 각1회 재사용), 참여27행, mock provider19회. `apiRequests`는 파싱된 브라우저 응답 envelope 수이며 전체 송신 요청 수가 아니다.
- 외부 provider 요청0, page error0, legacy fixture1행 checksum 동일. real provider / real device / production activation은 실행하지 않았다.
- 세 실행 각각의 `cleanup.json`을 보존했다. 최종 cleanup은 소유 Next child의 실제 종료 확인 이후 Docker / 임시 파일 제거를 확인한다. 보호 포트3100/3118/3124는 변경 대상에서 제외했다.

## 관측 trace와 개인정보

`observed-ui-trace.json`은 실제 브라우저의 click/change, 화면 ID, navigation type과 실제 요청·응답의 허용 enum/수치/boolean을 기록한다. scenario 소스 목록이나 예정된 작업 목록을 trace로 대체하지 않는다. `sameEvent`는 같은 case/topic/action의 첫 event와 비교한 boolean이며 추가 lead assertion의 `sameEmail`은 처음 제출하려던 이메일과 비교한 boolean이다. 원 식별값은 기록하지 않는다.

이메일 주소, token, cookie, page context, bootstrap key, IP, secret, 원 요청/응답 본문, raw HTML을 저장하지 않는다. 허용 필드만 재투영하는 검사와 주소/URL/UUID/credential 표식 검사를 세 실행 trace에 적용해 모두 PASS했다. 이메일 input과 이전 신청 이메일 문단은 screenshot에서 마스킹했다. runtime 로그는 원문 대신 HTTP status 관측과 byte 수만 보존한다. 초기 실패의 출력은 boolean 비교이며 이메일 값이 포함되지 않았다. 최종 runner는 최상위 오류 출력도 고정 문구만 남긴다.

## 실행 소스와 최종 소스

세 실행 모두 `source-manifest.json`에 기록된 모든 제품 파일이 현재 제품 소스와 byte hash가 같다. 최종 full 실행의 scenario/helper 역시 최종 파일과 같다. 전체 실행 뒤 바뀐 runner 부분은 기본 옵션 선택뿐이다. 실제 full 실행 runner SHA는 `b059583ff50129b2e1db5e7932fad55b3b1a9b932894639d101ac1b43d4edcd2`, 최종 runner SHA는 `e333a1adea8f255abd083a2842f5df38021480eb5aa5dbc4821b12369590799a`이다.

`default-dispatch.diff`는 이 둘의 정확한 차이다. 무옵션과 `--lead-edit`가 같은24+4 분기를 선택하고 recovery-only / recovery-zoom-only / focused4 선택은 보존함을 회귀 테스트로 확인했다. 이 변경 뒤 DB 전체 재실행은 하지 않았고 dispatch 동등성 검사와 실제 전체 실행을 분리한다. archive `runner-before-default-dispatch.mjs.txt`는 실행 당시 runner 원문이며 byte/hash를 그대로 보존한다. 원 파일명으로 복원해 검토하려면 `.txt`를 제거한 `runner-before-default-dispatch.mjs`로 복사하면 된다.

`verification.log`: guard10 + trace4 + recovery4 + selection4 = 22테스트 PASS. `navigation-red.log`, `selection-red.log`는 구현 전 실패 근거다. `lint.log`는 관련 변경 파일 ESLint exit0이며 출력이 없어 빈 파일이다. 최초 trace 테스트는 helper 부재로 실패한 뒤3개가 통과했고, navigation 확장 테스트는 별도 RED→GREEN을 보존했다.

`artifact-manifest.json`은 세 실행의 범위·정제 검사·source parity와 산출물의 크기/SHA-256을 기록한다. manifest 자신과 이 설명서는 재귀 hash 대상에서 제외한다. 결과/trace/캡처를 옮길 때 원본 bytes를 유지한다.
