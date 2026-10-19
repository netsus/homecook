# 로컬 후속: Gamification native 소비 계약

기준 `origin/master d7d865ac2fa86ad5ebc445ad8266ad78080a87dc`. 전용 worktree `anti-slop-gamification-native-20261020`에 선행 Progress 두 커밋 `e823fbc34`·`9887d303c`만 cherry-pick했다(로컬 `1e4ca7fc5`·`679d7dc6c`). 공유 선행 구현은 최종 검사 인계 뒤 부모의 별도 로컬 커밋 승인을 받았다. 이 작업자는 push·PR·머지·배포를 실행하지 않았다. 기존 실패 실험과 메인/P5 작업 파일은 수정하지 않았다.

## 이번 공유 변경의 범위

- `user-gamification.ts`의 수동 fluent query·고정 결과 인터페이스를 단일 native SDK schema의 7표 `from` 계약으로 대체한다. 소비하는 행·필터·기존 insert/upsert/update payload만 선언하며 조인 소비가 없어 Relationships는 빈 목록이다.
- badge·achievement·quest·notification 행과 nullable 값, JSON의 `unknown` 경계를 유지한다. DB에서 non-null인 notification priority/channel/toast 필드와 quest source-event의 nullable 값을 정확히 표현하되 기존 DTO의 legacy optional 필드는 바꾸지 않는다.
- 이 schema는 완전한 DB schema·입력 검증·권한 부여가 아니다. `Insert/Update: never` 표에도 SDK `delete()`가 보이며 deep read-only도 아니다. 실제 owner/RLS/세션/기존 부가 projection 실패 처리가 계속 권한 경계다.
- 기존 보상·성장 원장·멱등성·secondary failure·query 순서·RPC/직접 쓰기 분기 실행 코드는 바꾸지 않는다. 신규 any/단언/억제/옵션 완화와 SQL·환경·자격·정책 변경은 없다.

## SQL 근거

- `20260610183000_33c_user_gamification.sql`: badge/quest/notification의 owner UUID·nullable source-event/seen·기존 payload와 고유 키.
- `20260611152000_34b_growth_backend_model.sql`: growth 원장·JSON 및 notification priority/channel/toast non-null, nullable group key.
- `20260613220000_35b_growth_achievement_awards.sql`: achievement nullable track/badge/source 참조와 기존 payload.
- `20260615143000_35c_remove_quest_completed_notifications.sql`: 현재 notification enum 4종. 다른 표의 consumed id/owner/source 필드는 core bootstrap을 따른다.
- 이 검토는 체크인 SQL 근거이며 실제 DB 재조회나 정책 검증을 대신하지 않는다.

## 검사와 실패 기록

편집 전 기존 7 suite 49 PASS, 신규 실제 SDK/fake-fetch 8 PASS로 동작을 고정했다. 신규 타입 검사는 편집 전 전체 비증분 compiler에서 TS2322/TS2589 및 exact projection TS2344 세 건으로 실패했다. 첫 Vitest 실행은 새 worktree의 node_modules 링크 누락으로 시작하지 못했고 기존 로컬 의존성 링크만 연결해 재실행했다.

native 교체 후 전체 비증분 typecheck와 변경 lint는 통과했다. 제품 transpile JS는 byte 동일(`b47d1ad000adc4f40f63a1d46b46683f4ab376b51f202910083217df225984e9`). 기본 인수로 생성한 실제 SDK를 assertion 없이 직접 대입하고, 선택 결과의 정확한 nullable/enum/unknown 타입을 검사한다. 미등록 표 호출은 독립 compiler program에서 예상 TS2769로 거절된다. type-safe라고 DB/RLS까지 안전하다고 주장하지 않는다.

넓은 인접 24 suite는 처음 136 PASS였다. HEAD count·IS NULL·이중 정렬 실제 HTTP 2개를 보강한 최종 인접 24 suite는 **138 PASS**, 신규 SDK suite만 **10 PASS**다. SDK 회귀는 summary 권한 오류 단락, archive owner/in/order/limit, seen PATCH 소유 필터·ID 중복 제거, activity 중복 단락·projection 오류 뒤 원장 성공 보존을 포함한다. 최종 전체 비증분 typecheck·변경 lint·diff도 exit0이다. `verify:anti-slop`은 도구 fixture·도구 타입·제품 baseline 모두 exit0, **123/baseline207/신규0** 유지다. 실제 route4 연쇄 단언은 아직 수정하지 않았으므로 4건 해결로 세지 않는다.

Progress match 선행을 제거하고 원래 eq 계약만 복원한 memory probe는 native 모듈 내부 `readUserProgress` 연결에서 TS2589가 남았다. 현재 match 선행과 native 계약 조합은 진단0이다. 따라서 native 교체만으로 Progress 선행도 불필요해졌다고 주장하지 않는다.

별도 route 기준 4 suite 66건은 제품 편집 전 64 PASS/팬트리 기존 DELETE 2 FAIL이었다(200 대신422, `required_non_empty` 대신 `invalid_or_empty_ids`). 이 실패·기존 권한3건·보류 `444fe1f6f`는 수정하거나 통과로 계산하지 않는다. 이번 공유 계약 자체는 route의 원래 연쇄 단언4개를 아직 제거하지 않았으며 잔여 해결로 먼저 집계하지 않는다. 후속 route는 파일별로 분리 검증한다.
