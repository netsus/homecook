# 진도·활동 조회의 동일 SDK 경계 정리

## 범위와 동작 보존

기준 `ee6b41f95a364e12264a0a6d5d7d25d4e4d4ba50`에서 진도 GET과 활동 공통 helper의 기존 SDK 계약을 그대로 사용한다. 원163 목록의 두 ID는 아래 파일의 기존 snippet hash/occurrence로 추적하며 위치·원문·hash는 바꾸지 않는다.

- `app/api/v1/users/me/progress/route.ts`: `routeClient as unknown as UserProgressDbClient & UserBootstrapDbClient`를 동일 객체의 직접 타입 대입으로 바꾼다.
- `app/api/v1/users/me/gamification/_helpers.ts`: 동일한 직접 타입 대입으로 바꾸고 타입 단언 대입만 감싸던 `try/catch`를 제거한다. 단언은 런타임 변환이 아니고 초기화된 지역 변수 읽기에는 실패 분기가 없다. 실제 client 초기화·getUser·bootstrap의 실패 처리와 세션/owner 검사는 그대로다.

새 API 검증·공유 추상화·SDK schema·의존성·런타임 권한 변경은 없다. service-role fallback·정책·PIN·인증 설정·SQL·플래너·P5 경로는 수정하지 않는다. 두 항목의 과거 held-scope는 광범위 인증 분류에 의한 승계 보류였고 이번 명시적 잔여 검토 요청 아래 query 소비 경계만 좁혀 재검토했다. 다른97개 범위를 자동 해제한 것이 아니다.

## 검증

수정 전 기존5 suite40 PASS, 수정 후 동일40 PASS/0 SKIP다. 기존 테스트가 비로그인401·client/auth/bootstrap 실패500·동일 SDK 객체 전달·성공 응답·활동 세션 불일치409·알림/튜토리얼/아카이브 조건을 확인한다. SDK wire 계약 테스트는 가짜 fetch만 사용하고 운영 요청은 없다. 전체 비증분 `tsc --noEmit --incremental false`, 변경2파일 ESLint `--max-warnings 0`, `verify:anti-slop` fixture/tool type/baseline 신규 거부·diff-check가 통과했다. 독립 최종 검토 전에는 머지 가능으로 간주하지 않는다.

Anti **116→114 /baseline207/신규0**: 연쇄52·배열37·조건부25·누산0. 원163 ID는49해결/114잔여다. 원29계약29완료와 별도인 후속2건이며 원275 전체/별도49 완료가 아니다. 기존 TS2589 실험은 과거 공유 타입 변경 당시 기록으로 보존한다. 이번 직접 대입의 현재 전체 타입 통과가 과거 실패를 없애거나 모든 SDK 경계의 안전을 증명하지 않는다.

## 유지 후보와 다음 우선순위

배열37건 중 오류 문자열4필드의 `map/filter/join` 3건은 명시적 유지 후보로 기록한다: hybrid-auth/bootstrap, hybrid-auth/session-observability, supabase/server. 고정 길이4의 분류 경로이며 큰 배열/빈번한 할당 비용 증거가 없다. observability는 키 순서와 줄바꿈도 다르다. 단일 순회나 새 공용 helper로 바꾸면 얻는 이익 없이 인증 분류와 결합을 건드릴 수 있으므로 제품 코드를 바꾸지 않는다. 기존 held-scope에 유지 후보 근거를 추가할 뿐 해결/영구 불가로 계산하지 않는다.

우선순위는 실제 중복 수기 계약·불가능 분기 제거, 소스상 중복 순회/분기의 실익 검증, 나머지 짧은 체인/own-key 의미 보존 순이다. 원본 ID를 유지하며 개선 근거가 없으면 유지한다. 참고8·명시 보류3·개선 근거 없음5·조율1 및 범위 보류97을 현재 남은114에서 구분한다. 이 세 유지 후보는97에 포함되며 합산하지 않는다.

별도49 원본 미발견·기존 권한3·보류444fe1f6f·과거 넓은10실패는 그대로다. 잘못된 장보기 ID의 LOW 후속도 이 묶음에서 해결하지 않는다.

## 운영 인계

부모가 e5face/build `prelaunch-e5face22af6f-tQHGcl`의 인증 장보기 선택→새로고침 동일 상세/URL, 뒤로 목록→앞으로 동일 상세, 완료 read-only/수량 유지·관측 콘솔오류0을 확인했고 점유를 해제했다. 데이터 변경·신규 식사 생성0, legacy 실제 완료는 미실행이다. 이는 이 후보의 신규 인증 QA가 아니다.

현재 이 두 소스 정리는 로컬 후보이며 운영은 e5face·DB238/Anti116이다. 독립 검토·최종 코드 검사·draft PR 이후 기존 승인 범위의 일반 머지와 공식 앱-only DB238 plan/deploy를 순차 진행한다. 실제 배포 후 ref/build/status를 확인하기 전에는 운영 반영으로 세지 않는다.
