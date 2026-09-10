# 무먹 2차 랜딩 r2 상세 계약

계약 버전: `r2.1` · 작성일: **2026-09-11 KST** · 변경 유형: `contract-evolution`
작성 작업: `01a08c9f-89e0-7f11-8567-9a40e80f1d79` · 조정 작업: `01a07316-265c-7f22-b0af-fa22b7fb2b8a`
상태: 사용자 승인 범위의 공식 계약 작성본, **독립 검토 전 Draft**. 작성자가 승인·병합하지 않는다.

## 1. 권위와 변경 범위

사용자는 2026-09-11 두 영상 주제의 새 랜딩, 세 활동의 자유 순서·독립 완료·완료 보존·중복 방지와 공식 계약 변경을 승인했다. 이 문서는 공식 5종에서 위임받은 r2 요청·저장·화면의 상세 명세다. 공식 파일 경로는 [CSoT](sync/CURRENT_SOURCE_OF_TRUTH.md)가 정한다. 날짜 있는 r2 addendum은 r2에 한해서 기존 선형 퍼널 규칙보다 우선하며 기존 v2에 소급하지 않는다.

| 항목 | r2 계약 |
| --- | --- |
| 새 페이지 | `/beta/r2/recording`, `/beta/r2/homeflow` |
| 새 공개 API | `POST /api/v1/marketing/round2` 하나 |
| 새 public 테이블 | `marketing_round2_participations`, `marketing_round2_events`, `marketing_round2_lead_requests` 세 개 |
| 버전 | `round_version=r2.1`, `survey_version=r2.1-recording` 또는 `r2.1-homeflow` |
| 보존 | `/beta`, `POST /api/v1/marketing/validation`, `marketing_validation_sessions`, 기존 쿠키·질문·4유형·8단계·retention 의미 |
| 적용 전제 | 이 계약 PR 독립 검토·병합 → 별도 Stage 1 workpack/acceptance 재잠금·독립 gate·병합 → Stage 2/4 구현 |

PR #1550의 `marketing-demand-validation-round2` Stage 1 초안은 보류 중이며 이 계약의 권위가 아니다. 본 PR에서는 다른 worktree의 README/acceptance를 대신 수정하지 않는다. 이 선행 계약 PR과 후속 재잠금을 분리하라는 조정 지시가 일반적인 같은-PR workpack sync 규칙의 이번 범위 예외다. 기존 v2 workpack에는 r2 제약을 넣지 않는다. 구현, 운영 DB 접속, migration 실행, 배포, 광고, 메일 발송은 이 작성 작업의 산출물이 아니다.

설계 선택: 기존 v2 단일 row에 nullable 필드를 더하는 안은 짧지만 v2의 순서·이메일 보관 의미와 충돌한다. 승인된 별도 3테이블은 참여 상태, 개인정보 없는 관측 이벤트, 제한된 신청정보의 권한·삭제 범위를 분리하고 기존 데이터 재작성 없이 되돌릴 수 있다. 공개 API 여러 개 대신 action별 엄격한 union을 가진 POST 하나를 사용한다.

## 2. 페이지와 세 활동

`topic`은 서버의 exact pathname에서 `recording | homeflow`로 결정한다. trailing slash는 canonical 경로로 이동하며 그 외 r2 경로는 404다. 광고 UTM, 클라이언트 `topic`, referrer는 페이지 주제의 권한 근거가 아니다. 서버가 서명한 page context와 쿠키의 주제에 일치하는 요청만 저장한다.

첫 메뉴는 서버 HTML로 가치·준비 상태·세 선택지를 표시하며 관측 POST를 기다리지 않는다. 주 버튼은 **베타 오픈 알림 받기**, 보조 버튼은 **사용 예시 먼저 보기**, 세 번째는 **의견만 남기기**다. 자발적인 출시 관심을 바로 표현할 수 있게 하는 판단이며 전환율 상승을 보장하지 않는다. 예시와 질문 열기는 bootstrap 실패 중에도 가능하다. 서버 저장이 필요한 제출만 연결 복구를 기다린다.

| 화면 ID (두 주제 공통 접두사 `R2_RECORDING_` / `R2_HOMEFLOW_`) | 내용·행동·완료 조건 |
| --- | --- |
| `MENU` | `베타 준비 중 · 사용 예시`, 주제별 가치, 세 활동과 서버 확인된 완료 배지. 완료 활동을 다시 열어도 새 완료로 세지 않는다 |
| `EXAMPLE` | 준비된 예시임을 상시 표시. 아래 세 장면을 자유롭게 이전/다음으로 보고 마지막의 `예시 확인 완료`를 명시적으로 누른다. 자동재생·페이지 열기만으로 완료 처리하지 않는다 |
| `EXAMPLE_DONE` | 서버 저장 성공 시 `사용 예시를 확인했어요`. `메뉴로 돌아가기`와 `베타 오픈 알림 받기` 제공. 자동 복귀 없음 |
| `SURVEY` | 1/4부터 4/4까지 선택형 질문, 이전/다음, 마지막 `의견 보내기`. 이메일·유형 결과·체험 완료 요구 없음 |
| `SURVEY_DONE` | 서버 제출 성공 시 `의견을 남겨주셔서 감사해요`. 선택적 메뉴 복귀·알림 신청. 답변 수정 기능 없음 |
| `LEAD` | 이메일, 미리 체크하지 않은 필수 목적 동의, 보관 종료일·privacy 링크·Turnstile. 다른 활동 선행 조건 없음 |
| `LEAD_DONE` | 서버 영수증 확인 후 `베타 오픈 알림 신청을 접수했어요`. 신규/기존 이메일에 같은 화면. 발송 완료·이메일 소유 확인이라고 표현하지 않음 |
| `RECOVERY` | 연결·저장 오류를 해당 화면 안에 표시, 입력 보존·재시도·메뉴 복귀. 성공으로 위장하거나 다른 활동 완료를 지우지 않음 |

기록 메뉴 제목은 `내 레시피로 만든 집밥, 먹은 만큼 영양 기록`, 설명은 `레시피의 재료 정보를 가져와 확인하고, 완성한 요리와 먹은 분량을 기록으로 연결해요.`로 고정한다. 예시 장면은 `재료와 양 확인 → 완성한 요리 무게·먹은 양 입력 → 추정 영양 기록`이다. 실제 음식 입력·추출 요청을 보내지 않는 준비된 fixture다.

집밥 흐름 메뉴 제목은 `뭐 먹을지 정한 다음, 장보기부터 남은 요리까지`, 설명은 `요리 계획에 필요한 재료를 모으고, 집에 있는 재료를 빼서 장보고, 남은 요리를 다음 식사로 이어가요.`로 고정한다. 예시는 `요리 계획 → 보유 재료를 직접 확인·제외한 장보기 → 요리 완료·남은 요리의 다음 식사 연결`이다. 실제 meals/shopping/pantry를 바꾸지 않는다.

두 메뉴 모두 `현재는 사용 예시를 확인할 수 있어요. 실제 서비스는 베타 오픈 후 안내드려요.`를 표시한다. 계량 없이 자동, 정확한 영양 보장, 냉장고 자동 감지, 실측되지 않은 `30초` 약속은 금지한다. 예상 영양 숫자는 `예시·추정치` 표시를 붙인다.

예시·설문·알림은 각각 `not_started | started | completed`이며 순서가 없다. 완료 후 다른 활동으로 바로 이동하거나 메뉴로 돌아갈 수 있고, 모두 완료해도 메뉴를 유지한다. r2에는 v2 유형 결과·공유 결과 URL·강제 8단계가 없다. 링크 공유는 query 없는 해당 주제 canonical URL만 허용하고 개인 상태는 공유하지 않는다.

### 화면 저장·복원·접근성

- bootstrap 중 메뉴 전체 loading overlay를 금지한다. 활동은 열리고 제출 영역에만 `연결 중`을 표시한다. bootstrap 응답의 완료 상태를 받기 전에는 완료 여부를 미확인으로 표시한다.
- 브라우저 내 로컬 draft와 서버 완료를 구분한다. 서버 실패 시 `아직 저장되지 않았어요`를 표시한다. 예시를 끝까지 본 로컬 상태는 유지하되 완료 배지는 API 성공 뒤에만 확정한다.
- 설문 선택값·대기 중 비PII 이벤트만 r2 전용 IndexedDB에 최대 30일 저장한다. 이메일·동의 폼 입력은 메모리만 사용하고 reload/탭 종료 시 버린다. Turnstile 토큰은 메모리에서 제출 즉시 제거한다.
- 뒤로 가기/메뉴 복귀/재시도/reload는 bootstrap으로 같은 참여를 복원한다. 같은 탭에서 다른 주제로 이동하면 별도 참여가 되며 이전 주제 완료 상태는 그대로 둔다.
- 저장 실패 중 완료 이벤트를 건너뛰지 않는다. 동일 참여의 POST는 클라이언트 큐에서 직렬화한다. 최대 50개 비PII 대기 이벤트, 초과 시 관측 재시도 안내만 표시한다. 이메일 제출은 자동 백그라운드 재전송하지 않고 사용자의 재시도 버튼으로만 진행한다.
- 새 bootstrap snapshot으로 기존 완료를 덮어쓰지 않도록 `revision`이 더 낮은 응답은 무시한다. 설문 미제출 답변은 탭별 draft이며 한 탭의 첫 제출만 확정된다.
- 320px 폭부터 자연스러운 세로 스크롤, 키보드 위 제출 접근, safe-area, 44×44px 터치, visible focus, 질문 fieldset/legend, inline error 연결, 완료 알림 `aria-live=polite`, 줄어든 모션을 제공한다. 빈 상태는 `아직 완료한 활동이 없어요`이며 활동을 막지 않는다.
- 저장소 차단/용량 오류면 예시·설문 draft는 메모리에서 볼 수 있지만 새로운 참여 생성·제출은 차단하고 저장소 허용 후 재시도 안내를 표시한다. 중복 방지를 포기한 임시 bootstrap ID를 조용히 만들지 않는다.

## 3. 정확한 설문 (각 주제 네 문항)

모두 단일 선택이다. `answers`는 exact `{q1,q2,q3,q4}`이며 모든 값이 필수다. 다중 선택·자유 텍스트·추가 key·null·빈 문자열은 거부한다. label 변경도 설문 버전 검토 대상이고 의미 변경은 새 버전이다. 문항 수는 API와 UI에서 4로 고정한다.

| 주제·문항 | 질문 label | value → 선택지 label |
| --- | --- | --- |
| 공통 Q1 | `최근 7일 동안 집에서 직접 만든 식사를 몇 번 먹었나요?` | `none` → `0번`; `one_two` → `1~2번`; `three_five` → `3~5번`; `six_plus` → `6번 이상` |
| recording Q2 | `현재 집밥 식단을 주로 어떻게 기록하나요?` | `no_record` → `따로 기록하지 않아요`; `photo_memo` → `사진이나 메모로 남겨요`; `search_app` → `앱에서 비슷한 음식을 찾아요`; `ingredient_entry` → `재료와 양을 직접 입력해요` |
| recording Q3 | `이 중 가장 기대되는 기능은 무엇인가요?` | `reuse_recipe` → `레시피 재료 정보를 기록에 다시 쓰기`; `portion_nutrition` → `먹은 분량에 맞춘 추정 영양 보기`; `record_history` → `집밥 기록을 모아 보기`; `none` → `기대되는 기능이 없어요` |
| recording Q4 | 아래 입력조건 안내 후 `이 방식의 집밥 기록 기능을 사용해 보고 싶나요?` | `yes` → `사용해 보고 싶어요`; `maybe` → `상황에 따라 써볼 것 같아요`; `no` → `사용할 의향이 없어요`; `unsure` → `아직 모르겠어요` |
| homeflow Q2 | `현재 집밥 준비를 주로 어떻게 관리하나요?` | `on_the_day` → `그날그날 생각해서 준비해요`; `memo_list` → `메모나 장보기 목록을 써요`; `separate_apps` → `레시피·장보기 앱을 따로 써요`; `shared_plan` → `가족과 계획이나 목록을 공유해요` |
| homeflow Q3 | `이 중 가장 기대되는 기능은 무엇인가요?` | `meal_plan` → `먹을 요리 계획하기`; `combined_shopping` → `필요한 재료를 모아 장보기`; `pantry_exclusion` → `집에 있는 재료를 장보기에서 빼기`; `leftover_management` → `남은 요리를 다음 식사로 관리하기`; `none` → `기대되는 기능이 없어요` |
| homeflow Q4 | 아래 입력조건 안내 후 `이 방식의 집밥 관리 기능을 사용해 보고 싶나요?` | `yes` → `사용해 보고 싶어요`; `maybe` → `상황에 따라 써볼 것 같아요`; `no` → `사용할 의향이 없어요`; `unsure` → `아직 모르겠어요` |

recording Q4 바로 위 필수 안내: `레시피의 재료와 양을 확인·수정하고, 완성한 요리의 무게와 먹은 양을 직접 입력하는 방식이에요. 영양 정보는 추정치예요.`

homeflow Q4 바로 위 필수 안내: `먹을 요리를 고르고, 집에 있는 재료를 직접 확인하며, 요리 완료와 남은 요리 상태를 표시하는 방식이에요. 보유 재료가 자동으로 감지되지는 않아요.`

서버는 survey 시작 시와 제출 시 각각 실제 저장된 example 상태를 기록한다. 사용자 답변으로 체험 상태를 추정하지 않는다. 기록값은 `not_started | started | completed`이며 제출 답변에 체험 여부 field를 허용하지 않는다. 시작 후 예시를 본 경우 시작·제출 snapshot이 달라질 수 있다. 설문을 먼저 한 사람을 제외하거나 부정 응답을 몰래 비적격으로 분류하지 않는다.

## 4. 버전·첫 유입·안전한 bootstrap

서버 registry의 이번 계약 상수는 다음과 같다. 아래 날짜는 이 Draft의 수집·보관 정책이며 운영 활성화 사실이 아니다. 기간 변경은 새 계약/동의 검토를 요구하고 과거 동의의 기간을 자동 연장하지 않는다.

| 상수 | exact 값 |
| --- | --- |
| `round_version` | `r2.1` |
| campaign 시작 | `2026-09-11T00:00:00+09:00` (`2026-09-10T15:00:00Z`) |
| campaign 종료 (exclusive) | `2026-11-01T00:00:00+09:00` (`2026-10-31T15:00:00Z`) |
| 일괄 보관 종료 (exclusive) | `2026-12-01T00:00:00+09:00` (`2026-11-30T15:00:00Z`) |
| 최초 consent_generation | `1` (철회 fence마다 증가하는 공개 양의 정수) |
| 참여/복원키 유효기간 | 최초 참여부터 30일, campaign 종료보다 늦지 않음; 연장 없음 |
| page context 유효기간 | 발행 후 30분, campaign 종료보다 늦지 않음 |
| 동의 버전·목적 코드 | `mumeok-r2-beta-notice-20260911`, `beta_open_notice` |

### 4.1 서버 page context와 attribution

페이지 GET은 DB를 호출하지 않고 `page_context`를 만든다. exact payload는 `{v:1,topic,round_version,first_channel,utm_source,utm_medium,utm_campaign,utm_content,iat,exp}`다. `iat/exp`는 정수 Unix seconds다. HMAC-SHA256으로 `r2-page-v1.`와 canonical payload bytes를 함께 서명하고 `base64url(payload).base64url(mac)`로 HTML에 넣는다. padding·추가 segment·unknown key·32byte 아닌 MAC·미래 iat(30초 허용 밖)·만료·잘못된 version은 거부한다. 서명은 constant-time 비교, 키는 r2 전용이다. 페이지/POST는 `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`를 사용한다. page context는 로그인 권한이나 사람 검증이 아니라 서버가 표시한 주제·버전·출처의 위변조 방지다.

| URL 입력 | 저장 정규화 |
| --- | --- |
| `utm_source=ig|instagram` / `fb|facebook` | `instagram` / `facebook`; 그 외 null |
| `utm_medium=paid_social|social_profile|share` | exact 값; 그 외 null |
| `utm_campaign=mumeok_r2` | exact 값; 그 외 null |
| `utm_content=video_recording_v2|video_homeflow_v1|profile_link` | exact 값; 그 외 null |
| `utm_term`, `ad_variant`, `result`, email, 그 외 query | 수집하지 않음. raw query/referrer를 저장·로그하지 않음 |

각 UTM key가 중복되거나 decode 오류/128자 초과/제어문자가 있으면 그 key는 null이다. 원문 문자열을 대체 필드에 넣지 않는다. `first_channel`은 UTM key가 전혀 없으면 `direct`; source가 known이고 medium=`paid_social`, campaign=`mumeok_r2`, content가 페이지 주제에 대응하는 exact 영상이면 `ad_tagged`; known source+`social_profile`+`profile_link`면 `profile_tagged`; medium=`share`면 `shared`; 나머지는 `unknown`이다. 다른 주제 영상의 content는 allowlist 값 자체는 보존하되 `unknown`으로 분류하고 주제를 바꾸지 않는다. 첫 광고 소재는 이 저장 content이며 클릭/과금 인증은 아니다. 이번 공개 계약은 실제 광고 ID를 받지 않는다. 이후 광고 ID 매핑이 필요하면 별도 확장한다.

처음 성공한 bootstrap만 attribution을 쓴다. 여러 탭이 서로 다른 소재로 동시에 들어오면 DB에서 참여를 먼저 생성한 유효 요청이 승자다. 클라이언트 발생 시각을 받지 않으므로 실제 가장 이른 광고 클릭이라고 주장하지 않는다. 재시도·메뉴 복귀·다른 UTM으로 재방문해도 덮어쓰거나 신규 참여를 만들지 않는다.

### 4.2 응답 유실·동시 탭 복원

1. 브라우저는 r2 전용 IndexedDB `mumeok-r2`, store `bootstrap`, key=`r2.1:<topic>`의 **하나의 readwrite transaction**에서 기존 값을 읽거나 crypto CSPRNG 32byte `bootstrap_key`와 최초 bootstrap `event_id`(UUIDv4), 로컬 생성시각, status=pending, 최초 page context의 비밀 없는 의미 attribution을 생성·저장한다. 두 탭이 각각 메모리 복원 key를 먼저 발급해 제출하는 구현은 금지한다. 두 탭의 의미 attribution이 같으면 같은 최초 event_id를 재사용한다. 다른 광고/URL이면 복원 key는 유지하고 해당 탭의 bootstrap 요청에 새 event_id를 발급해 응답 확인까지 outbox에 보존한다. 따라서 서로 다른 광고 payload가 같은 event_id를 공유하지 않으며 참여 unique key는 여전히 하나다.
2. `bootstrap_key`는 43자 무패딩 base64url이며 해당 주제의 복원 capability다. URL·로그·이벤트·답변·분석/오류 보고에 포함하지 않는다. 클라이언트는 이 값을 bootstrap POST에만 보낸다. XSS가 이 값을 읽을 수 있으므로 r2에 제3자 분석 스크립트를 추가하지 않고 CSP·입력 escaping을 유지한다.
3. 서버는 `HMAC-SHA256(K_bootstrap, 'r2.1:' + topic + ':' + bootstrap_key)`를 `bootstrap_digest`로 계산한다. `(round_version,topic,bootstrap_digest)` unique로 참여를 INSERT/충돌 시 동일 row lock한다. 동일 event_id 재전송은 기존 이벤트를 비교하고, 다른 탭의 다른 event_id도 새 참여 대신 같은 참여를 사용한다.
4. bootstrap_intent는 신규/pending key면 create_or_resume, 과거 성공 응답을 받아 IndexedDB status=confirmed가 된 key면 resume이다. 성공 응답 뒤 같은 IndexedDB transaction에서 confirmed로 바꾼다. resume은 row가 없으면 cookie 유무와 무관하게 410이며 INSERT하지 않는다. 커밋 뒤에만 서명 쿠키와 snapshot을 응답한다. 응답/Set-Cookie가 유실되어도 브라우저가 이미 저장한 같은 key로 재시도하므로 동일 참여와 최초 expiry의 쿠키를 다시 받는다. key가 다른데 유효한 동일 주제 쿠키가 있으면 `409 BOOTSTRAP_CONFLICT`로 닫고 새 row를 만들지 않는다. 클라이언트는 r2 저장소 상태 복구 안내를 제공한다.
5. 기존 row가 만료됐거나 삭제됐는데 아직 유효한 쿠키가 있으면 `410 PARTICIPATION_EXPIRED`다. 자동 재생성하지 않는다. 만료 시 로컬 key/draft를 지우고 `새 참여 시작` 명시 행동 뒤에만 새 key를 만든다. cookie와 로컬 key가 모두 삭제된 브라우저는 구별 불가능하다. 또한 최초 응답이 끝내 확인되지 않은 pending key의 row가 그 사이 삭제되고 cookie도 없다면, 서버는 미생성 요청과 삭제된 요청을 구별할 수 없다. 이 create_or_resume 예외에서는 새 참여가 생길 수 있음을 집계 한계로 공개한다. confirmed key는 cookie가 없어도 resume으로만 보내어 자동 재생성을 막는다. 영구 복원키 tombstone을 추가하지 않는다.
6. 최초 bootstrap 이후의 mutation에는 유효한 주제 쿠키가 필수다. body participation ID나 bootstrap key로 인증을 대신하지 않는다. 탭 복원은 동일 bootstrap POST로 최신 상태를 읽는다. GET 상태 API는 추가하지 않는다.

쿠키 이름은 production/isolated HTTPS 모두 `__Secure-mumeok_r2_recording`, `__Secure-mumeok_r2_homeflow`다. `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/marketing/round2`, Domain 없음, Max-Age는 저장된 만료까지 남은 정수 초다. 쿠키 payload는 exact `{v:1,pid,topic,round_version,iat,exp}`이고 pid는 서버 UUID, iat/exp는 참여 row의 최초 시각/expiry다. `r2-cookie-v1.` domain separation으로 HMAC 서명한다. 복원 시 값을 재발급하되 expiry를 밀지 않는다. 같은 이름의 Cookie가 중복되면 거부한다. `mumeok_validation_session` 및 그 v1/v2 해석은 읽거나 변경하지 않는다. 두 topic 쿠키가 동시에 있어도 body topic에 해당하는 쿠키 하나만 사용한다.

## 5. POST 요청·응답

UTF-8 JSON object 하나, `Content-Type: application/json`(선택적 charset=utf-8), 실제 읽은 body 최대 **8192 bytes**. 중복 JSON key, unknown key, 중첩 초과, JSON null/array 루트는 오류다. 문자열은 명시된 정규화 외 임의 trim/coercion을 하지 않는다. 요청 필드의 `?`만 생략 가능하며 그 외 필드는 필수다.

```ts
type Topic = "recording" | "homeflow";
type Activity = "example" | "survey" | "lead";
type ActivityState = "not_started" | "started" | "completed";
type UUID = string; // lowercase RFC4122 UUIDv4, 36 chars
// 아래 Common은 모든 action에 exact하게 포함된다.
type Common = {
  action: "bootstrap" | "activity_start" | "example_complete" |
          "survey_submit" | "lead_submit" | "menu_return";
  event_id: UUID;
  topic: Topic;
  round_version: "r2.1";
  honeypot: "";
};
type Request =
  | (Common & { action: "bootstrap"; bootstrap_key: string; page_context: string; bootstrap_intent: "create_or_resume" | "resume" })
  | (Common & { action: "activity_start"; activity: Activity })
  | (Common & { action: "example_complete" })
  | (Common & { action: "survey_submit"; survey_version: "r2.1-recording" | "r2.1-homeflow";
                answers: { q1: string; q2: string; q3: string; q4: string } })
  | (Common & { action: "lead_submit"; email: string; consent: true;
                consent_version: "mumeok-r2-beta-notice-20260911";
                purpose: "beta_open_notice"; consent_generation: number; turnstile_token?: string })
  | (Common & { action: "menu_return"; from_activity: Activity });
```

`page_context`는 1~2048 ASCII자, `bootstrap_key`는 exact 43자 base64url/decoded 32bytes다. survey_version은 topic과 exact 일치하고 답변은 §3의 topic별 enum만 허용한다(각 최대 32 ASCII자). `email`은 입력 최대 254자이며 §8의 정규화를 적용한다. Turnstile token은 존재하면 1~2048자 문자열이며 공백만은 거부한다. `consent`는 boolean true만 허용한다. `consent_generation`은 1~2147483647 정수이며 현재 공유 control 문서 값과 일치해야 한다. bootstrap_intent는 위 두 enum 중 하나가 필수다. 익명 action에 email/consent/purpose/token/answers를 섞으면 422다.

lead_submit의 token 생략은 **이미 성공한 동일 참여·동일 event_id·동일 정규화 payload 영수증 재조회에만** 허용한다. 아직 영수증이 없으면 생략은 422이며 새 token으로 다시 제출해야 한다. 성공한 event_id에 token을 새로 보내도 저장하지 않고 기존 영수증을 반환한다. 다른 event_id를 같은 영수증으로 자동 치환하지 않는다.

모든 성공은 HTTP 200이며 다음 exact envelope를 사용한다. `state`는 커밋 후 해당 요청 transaction에서 본 snapshot이다. 응답에 이메일·중복 여부·UTM·answers·토큰·해시·legacy 존재 여부를 넣지 않는다.

```ts
type Success = {
  success: true;
  data: {
    round_version: "r2.1";
    topic: Topic;
    participation_id: UUID;
    event_id: UUID;
    revision: number; // integer >= 1
    consent_generation: number; // current shared control generation, integer >=1
    state: { example: ActivityState; survey: ActivityState; lead: ActivityState };
    receipt: { event_id: UUID; status: "received" } | null;
    participation_expires_at: string; // UTC RFC3339 seconds, suffix Z
    retention_until: "2026-11-30T15:00:00Z";
  };
  error: null;
};
type Failure = {
  success: false;
  data: null;
  error: { code: string; message: string; fields: string[] };
};
```

`receipt`는 해당 참여가 lead 완료면 원래 성공 lead event_id, 아니면 null이다. receipt ID 자체는 권한이 아니며 타 참여 조회에 쓰이지 않는다. 같은 event replay도 최신 snapshot을 반환할 수 있으므로 timestamp/상태 byte-identical 응답은 보장하지 않지만 receipt/event identity·최초 완료는 불변이다. 클라이언트는 revision으로 응답 순서를 조정한다.

### 5.1 action별 요청 JSON

아래 토큰 문자열은 문서용 placeholder이며 실제 비밀/유효 토큰이 아니다. 각 JSON은 독립 요청 예시다. bootstrap의 placeholder를 실제 서명 context/43자 CSPRNG key로 바꿔야 한다.

```json
{"action":"bootstrap","event_id":"11111111-1111-4111-8111-111111111111","topic":"recording","round_version":"r2.1","honeypot":"","bootstrap_key":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","page_context":"DOCUMENTATION_PLACEHOLDER","bootstrap_intent":"create_or_resume"}
```

```json
{"action":"activity_start","event_id":"22222222-2222-4222-8222-222222222222","topic":"recording","round_version":"r2.1","honeypot":"","activity":"survey"}
```

```json
{"action":"example_complete","event_id":"33333333-3333-4333-8333-333333333333","topic":"recording","round_version":"r2.1","honeypot":""}
```

```json
{"action":"survey_submit","event_id":"44444444-4444-4444-8444-444444444444","topic":"recording","round_version":"r2.1","honeypot":"","survey_version":"r2.1-recording","answers":{"q1":"one_two","q2":"photo_memo","q3":"portion_nutrition","q4":"maybe"}}
```

```json
{"action":"survey_submit","event_id":"55555555-5555-4555-8555-555555555555","topic":"homeflow","round_version":"r2.1","honeypot":"","survey_version":"r2.1-homeflow","answers":{"q1":"none","q2":"on_the_day","q3":"leftover_management","q4":"unsure"}}
```

```json
{"action":"lead_submit","event_id":"66666666-6666-4666-8666-666666666666","topic":"recording","round_version":"r2.1","honeypot":"","email":"reader@example.com","consent":true,"consent_version":"mumeok-r2-beta-notice-20260911","purpose":"beta_open_notice","consent_generation":1,"turnstile_token":"DOCUMENTATION_PLACEHOLDER"}
```

```json
{"action":"menu_return","event_id":"77777777-7777-4777-8777-777777777777","topic":"recording","round_version":"r2.1","honeypot":"","from_activity":"survey"}
```

성공 예시(직접 신청의 시작·완료 후에도 example/survey는 미시작):

```json
{"success":true,"data":{"round_version":"r2.1","topic":"recording","participation_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","event_id":"66666666-6666-4666-8666-666666666666","revision":3,"consent_generation":1,"state":{"example":"not_started","survey":"not_started","lead":"completed"},"receipt":{"event_id":"66666666-6666-4666-8666-666666666666","status":"received"},"participation_expires_at":"2026-10-11T00:00:00Z","retention_until":"2026-11-30T15:00:00Z"},"error":null}
```

영수증 재요청은 위 lead_submit에서 token만 생략할 수 있다. event_id·email 정규화 결과·동의 목적/버전은 동일해야 한다. 기존 이메일 여부와 무관하게 위 성공 shape를 사용한다.

### 5.2 오류 status/code와 처리 순서

모든 message는 아래 고정 문구다. `fields`는 422에서만 허용된 필드 경로(`action,event_id,topic,round_version,honeypot,bootstrap_key,page_context,bootstrap_intent,activity,survey_version,answers,answers.q1,answers.q2,answers.q3,answers.q4,email,consent,consent_version,purpose,consent_generation,turnstile_token,from_activity`)의 정렬·중복 제거 목록이다. 알 수 없는 key는 값/이름을 되돌리지 않고 `fields=[]`다. 그 외 코드는 모두 `fields=[]`다.

| HTTP | code | message / 조건 |
| --- | --- | --- |
| 400 | `INVALID_JSON` | `요청 형식을 확인해 주세요.` / 파싱 오류·중복 key·비object |
| 401 | `PARTICIPATION_REQUIRED` | `참여 정보를 다시 연결해 주세요.` / 쿠키 없음·위조·중복 쿠키·서명 불일치 |
| 403 | `ORIGIN_NOT_ALLOWED` | `허용되지 않은 요청이에요.` / Origin·Host·fetch-site 경계 불일치 |
| 403 | `CONTEXT_INVALID` | `페이지를 새로 열어 주세요.` / page 서명·쿠키/요청 topic 또는 version 불일치 |
| 409 | `EVENT_CONFLICT` | `요청 정보가 달라 다시 확인이 필요해요.` / 같은 event_id의 다른 소유자·action·canonical payload |
| 409 | `BOOTSTRAP_CONFLICT` | `브라우저 참여 정보를 복구해 주세요.` / 유효 쿠키와 bootstrap key 불일치 |
| 409 | `CONSENT_REFRESH_REQUIRED` | `동의 내용을 다시 확인해 주세요.` / 오래된 consent_generation; 체크·토큰 해제 후 새 명시 동의 |
| 409 | `INVALID_TRANSITION` | `활동을 먼저 열어 주세요.` / §6 선행 start 없음 |
| 409 | `ACTIVITY_ALREADY_COMPLETED` | `이미 완료한 활동이에요.` / 다른 설문 답변 또는 새 lead event_id로 재완료 |
| 410 | `CONTEXT_EXPIRED` | `페이지를 새로 열어 주세요.` / page context 만료 |
| 410 | `PARTICIPATION_EXPIRED` | `참여 기간이 끝났어요. 새 참여를 시작해 주세요.` / 쿠키·참여 만료/삭제 |
| 410 | `CAMPAIGN_ENDED` | `이번 알림 신청 기간이 끝났어요.` / 수집 기간 밖 |
| 413 | `BODY_TOO_LARGE` | `요청 크기가 너무 커요.` / streaming body 8192bytes 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `요청 형식을 확인해 주세요.` / content type 불일치 |
| 422 | `VALIDATION_ERROR` | `입력 내용을 확인해 주세요.` / schema·enum·동의·honeypot |
| 422 | `TURNSTILE_FAILED` | `보안 확인을 다시 진행해 주세요.` / 유효하지 않은 토큰·hostname/action·challenge age |
| 429 | `RATE_LIMITED` | `잠시 후 다시 시도해 주세요.` / rate bucket 초과; `Retry-After` 정수초 |
| 503 | `ROUND2_DISABLED` | `현재 참여를 받고 있지 않아요.` / r2 수집 disabled·preview |
| 503 | `ROUND2_UNAVAILABLE` | `연결이 원활하지 않아요. 다시 시도해 주세요.` / DB·서명키·rate 저장소·서버 오류 |
| 503 | `LEAD_CAPTURE_NOT_READY` | `알림 신청 준비 중이에요.` / lead 전용 readiness 미충족 |
| 503 | `LEAD_CAPTURE_UNAVAILABLE` | `신청을 확인하지 못했어요. 다시 시도해 주세요.` / Turnstile 네트워크/서비스 오류·lead transaction 오류 |

예: `{"success":false,"data":null,"error":{"code":"VALIDATION_ERROR","message":"입력 내용을 확인해 주세요.","fields":["answers.q4"]}}`.

순서는 (1) exact method/Host/Origin·content type·body bound (2) r2 enabled/수집 기간/기본 rate (3) JSON/schema/empty honeypot (4) page context 또는 cookie와 참여 expiry 검증 (5) lead면 **현재 lead readiness, consent_generation 및 lead rate** (6) 기존 event/receipt 소유권·canonical 비교 (7) 미완료 새 lead의 Turnstile (8) 잠금 안에서 모든 DB 전제 재확인·원자 commit이다. 쿠키 검증에서 서명은 맞지만 exp만 지났으면 410, 서명이 틀리면 401이다. 승인된 receipt라도 gate 폐쇄·만료·다른 Origin을 우회하지 않는다. POST 외 method는 405 `METHOD_NOT_ALLOWED`, message=`지원하지 않는 요청 방식이에요.`, fields=[]와 `Allow: POST`다. 공개 CORS 허용 응답을 만들지 않는다.

## 6. 상태 허용 행렬·원자성·멱등성

`activity_start(lead)`는 신청 폼 열기일 뿐 동의나 신청이 아니다. lead gate가 닫혀도 다른 익명 활동과 `activity_start(lead)`는 수집 enabled 범위에서 가능하다. 세 활동의 상태는 해당 시작/완료 timestamp로 계산하며 별도 선형 stage column을 만들지 않는다.

| action | 선행 조건 | 첫 성공의 변화 | 재요청/완료 뒤 동일 의미 |
| --- | --- | --- | --- |
| bootstrap | 유효 page context + 복원 key | 참여 1개, bootstrap event, revision=1 | 기존 참여 snapshot; 새 유입 아님 |
| activity_start(example) | 유효 참여 | example_started_at 최초 기록 | no-op, 다른 활동 영향 없음 |
| activity_start(survey) | 유효 참여 | survey_started_at + 당시 서버 example state 최초 기록 | no-op, 최초 snapshot 유지 |
| activity_start(lead) | 유효 참여 | lead_started_at 최초 기록 | no-op, 동의/이메일 없음 |
| example_complete | example started | example_completed_at 최초 기록 | no-op |
| survey_submit | survey started + exact 네 답변 | answers, submitted_at, 제출 당시 example state | 같은 답변 no-op; 다른 답변 409 |
| lead_submit | lead started + 현재 gate + 동의 + 검증 | lead row + lead_completed_at + event 동시 기록 | 동일 event/정규화 payload receipt만 200; 새 event_id는 409 |
| menu_return | 유효 참여 (완료 여부 무관) | 관측 event만 기록; 세 활동 상태·revision 유지 | 같은 event_id는 한 event; 새 ID도 신규 유입/완료 아님 |

`example_complete`는 UI 마지막 확인 버튼과 연결하며 서버는 example start만 강제한다. 시청·실제 이해·세 장면 체류를 검증한 것으로 집계하지 않는다. 세 활동 순서 6가지와 각각 단독 완료를 모두 허용한다. `menu_return`은 로컬에서 즉시 이동하고 관측 실패를 이유로 메뉴를 막지 않는다.

### 이벤트 충돌 규칙

`event_id`는 테이블 전체 UUID PK다. 소유 참여가 다르면 기존 payload를 노출하지 않고 409다. 같은 참여 ID일 때 `action,topic,round_version,activity/from_activity,survey_version,answers`의 **검증·정규화된 의미 payload**를 비교한다. JSON key 순서만 다른 요청은 동일하다. bootstrap은 page context의 `topic,round_version,first_channel,utm_*`를 비교하고 `iat,exp,signature,bootstrap_intent`는 제외한다. bootstrap_intent는 생성/복원 허용 검사에만 쓰고 이벤트 의미를 바꾸지 않는다. key/쿠키/page context/Turnstile 원문을 이벤트에 넣지 않는다. 새 서명 context로 갱신할 때도 기존 bootstrap event의 의미 attribution을 보존해야 하며, 새 URL attribution이면 새 event_id로 bootstrap하되 기존 참여의 최초 attribution은 유지한다.

이 문서의 canonical JSON은 재귀적으로 object key를 ASCII 오름차순 정렬하고 공백 없는 UTF-8 JSON을 쓰는 것이다. array 순서는 보존하고 허용된 정수/문자열/boolean/null만 쓴다. page/cookie HMAC 입력은 해당 domain prefix 뒤에 canonical payload bytes를 붙인다. event HMAC 입력은 exact object `{action,topic,round_version,activity,payload}`이며 receipt HMAC 입력은 exact object `{action:"lead_submit",topic,round_version,email:normalized_email,consent:true,consent_version,purpose,consent_generation}`다. bootstrap HMAC의 ASCII 콜론 구분은 §4.2를 따른다. 모든 HMAC 비교는 constant-time이고 JSON escape 차이는 parse 후 canonicalization으로 제거한다. UUID는 생성·입력 모두 lowercase RFC4122 v4를 사용한다. 쿠키 Unix iat/exp와 공개 timestamp는 DB 시각을 초 단위로 내림하며 Max-Age 역시 남은 초를 내림해 DB 만료보다 늦어지지 않게 한다.

lead 이벤트에는 PII 없는 `{}`만 저장한다. email/consent/purpose/version/consent_generation에 대한 멱등 비교는 lead 테이블의 `request_digest`와 해당 row에서만 수행한다. 이 digest는 전용 keyed HMAC이며 이벤트 테이블/응답에 복사하지 않는다. token은 모든 canonical digest에서 제외한다. 토큰 재발급은 같은 업무 payload의 재시도다.

같은 event_id·같은 payload면 새 이벤트/수정/revision 증가 없이 성공 snapshot을 반환한다. 다른 event_id로 이미 시작/완료한 동일 의미를 보내면 `applied=false` event를 남겨 ID 충돌 검출을 유지하되 완료 지표는 증가하지 않는다(lead는 위 표의 409 예외). 다른 payload에 성공을 반환하는 first-write-wins 방식은 금지한다. 실패한 요청은 세 테이블에 기록하지 않으며 event_id가 선점되지 않는다.

### 트랜잭션 경계

서버 Route Handler는 DB 접근용 기존 internal PostgreSQL 경계를 재사용하고 r2 전용 scope를 최소 권한 allowlist에 추가한다. 브라우저 PostgREST/RPC로 mutation 함수를 공개하지 않는다. 새 public RPC endpoint는 없다. 구현 시 내부 transaction 진입점은 `marketing-round2` scope 하나로 제한하고 구체적인 연결 adapter는 기존 경계를 따른다.

1. bootstrap은 unique key 경합을 해결한 참여 row, 나머지는 쿠키의 참여 row를 `SELECT ... FOR UPDATE`로 잠근다. 잠금 대기 전 transaction_timestamp()를 상태 시각으로 쓰지 않는다. 필요한 row/advisory lock을 모두 얻은 뒤 clock_timestamp()를 한 번 읽어 해당 변경의 write_at으로 삼고, 같은 변경의 상태/event/lead 시각에 명시적으로 동일 값을 넣는다. 최초 bootstrap의 write_at은 새 row의 created_at과 같게 한다. commit 직전 clock_timestamp()를 새로 읽어 campaign/participation 만료와 provider 검증 age를 검사하고, 공유 control의 enabled/consent_generation도 다시 검사하여 달라졌으면 rollback한다. 만료 검사는 고정 transaction 시각을 재사용하지 않는다.
2. 전역 event_id 기존 row를 조회하고 소유·payload를 비교한다. 삽입 중 다른 참여의 동일 ID와 경합해 unique violation이면 transaction 전체 rollback 후 generic EVENT_CONFLICT로 바꾼다. SQL 메시지를 반환하지 않는다.
3. lead는 참여 row 잠금 이후 normalized email의 HMAC으로 정해진 transaction advisory lock을 얻는다. 동일 r2 이메일은 두 주제 모두 같은 lock key를 사용한다. hash 충돌은 추가 직렬화만 만들며 동일 이메일 여부는 full 32byte digest로 비교한다. 외부 Turnstile 호출 중 DB lock을 잡지 않는다.
4. 잠금 안에서 선행 상태·기존 이벤트·동의/검증 맥락·현재 consent_generation을 재확인한다. 유효한 새 변경만 상태 row, lead row(해당 시), event row를 **같은 DB transaction**에 쓴다. 상태변경이 있으면 revision을 한 번 증가시킨다. no-op/menu_return은 revision 유지다.
5. 이벤트 FK·lead FK가 commit 시 만족하도록 insert 순서를 event → lead → participation projection으로 하되 응답 전에 모두 commit한다. 중간 오류는 모두 rollback한다. source-of-truth는 row와 event가 함께 성공한 DB commit이며 클라이언트 성공 화면이 아니다.
6. 동시 lead 요청 둘이 각각 Turnstile 성공을 얻어도 row lock 후 하나만 최초로 적용된다. 같은 event면 같은 receipt, 다른 event면 409다. 검증 성공 후 crash/commit 결과 불명 시 같은 event와 같은 token을 provider idempotency key로 재확인하고 DB receipt를 먼저 조회한다. token이 이미 소비됐고 성공 receipt가 없으면 새 challenge를 요구한다.

## 7. 정확한 DB 스키마

아래는 후속 additive migration의 규범 명세이며 이 PR에서 SQL을 실행하지 않는다. SQL 타입은 PostgreSQL, 모든 시간은 `timestamptz`, 명시되지 않은 default는 **없음**, 명시되지 않은 nullable은 **NOT NULL**이다. UUID default는 `gen_random_uuid()`일 때만 서버 생성한다. 모든 SQL CHECK는 NULL 통과를 이용해 필수 제약을 우회하지 않도록 NOT NULL과 함께 적용한다.

### 7.1 `public.marketing_round2_participations`

| column | SQL type | NULL/default | 제약·의미 |
| --- | --- | --- | --- |
| id | uuid | default gen_random_uuid() | PK |
| round_version | text | default 'r2.1' | CHECK ='r2.1' |
| topic | text | 없음 | CHECK IN ('recording','homeflow') |
| bootstrap_digest | bytea | 없음 | CHECK octet_length=32, 복원 capability의 keyed digest |
| first_channel | text | 없음 | CHECK IN ('direct','ad_tagged','profile_tagged','shared','unknown') |
| utm_source | text | NULL | CHECK IN ('instagram','facebook') |
| utm_medium | text | NULL | CHECK IN ('paid_social','social_profile','share') |
| utm_campaign | text | NULL | CHECK ='mumeok_r2' |
| utm_content | text | NULL | CHECK IN ('video_recording_v2','video_homeflow_v1','profile_link') |
| created_at | timestamptz | default clock_timestamp() | 최초 성공 bootstrap |
| expires_at | timestamptz | 없음 | = least(created_at + interval '30 days', timestamptz '2026-10-31 15:00:00+00') |
| purge_after | timestamptz | default '2026-11-30 15:00:00+00' | CHECK exact 고정 시각 |
| revision | integer | default 1 | CHECK >=1 |
| example_started_at | timestamptz | NULL | 최초 시작 |
| example_completed_at | timestamptz | NULL | 시작 필수, 시작 이상 |
| survey_started_at | timestamptz | NULL | 최초 시작 |
| survey_example_at_start | text | NULL | CHECK IN ('not_started','started','completed'), 시작 시 server snapshot |
| survey_submitted_at | timestamptz | NULL | 시작 필수, 시작 이상 |
| survey_example_at_submit | text | NULL | 같은 state enum, 제출 시 server snapshot |
| survey_version | text | NULL | topic='recording'이면 'r2.1-recording', homeflow면 'r2.1-homeflow' |
| answers | jsonb | NULL | exact 네 key와 §3 해당 topic enum, 추가 key 금지 |
| lead_started_at | timestamptz | NULL | 폼 열기 |
| lead_completed_at | timestamptz | NULL | 검증된 lead commit, 시작 필수 |

PK `marketing_round2_participations_pkey(id)`; UNIQUE `marketing_round2_participations_bootstrap_key(round_version,topic,bootstrap_digest)`; composite FK 대상용 UNIQUE `marketing_round2_participations_identity_key(id,round_version,topic)`.

CHECK 묶음은 다음을 전부 강제한다. 각 start는 null 또는 `created_at <= start < expires_at`, 각 complete는 null 또는 `start IS NOT NULL AND start <= complete AND complete < expires_at`다. `created_at >= '2026-09-10 15:00:00+00' AND created_at < '2026-10-31 15:00:00+00'`; `expires_at>created_at AND purge_after>expires_at`. `survey_started_at IS NULL`과 `survey_example_at_start IS NULL`은 동치다. `survey_submitted_at`, `survey_example_at_submit`, `survey_version`, `answers`는 모두 null이거나 모두 nonnull이다. answers는 `jsonb_typeof='object'`, key 집합 정확히 q1..q4, 각 값의 jsonb_typeof='string'와 §3 enum CHECK를 AND로 적용한다. `first_channel`의 ad/profile/shared 값에는 §4.1 corresponding 조합 CHECK를 적용하고 direct면 UTM 4개 전부 null이다. unknown은 nullable allowlist 조합만 허용한다.

INDEX `marketing_round2_participations_cohort_idx(round_version,topic,first_channel,created_at,id)`; INDEX `marketing_round2_participations_purge_idx(purge_after,id)`. UNIQUE index 외 bootstrap 별도 중복 index는 만들지 않는다.

### 7.2 `public.marketing_round2_events`

| column | SQL type | NULL/default | 제약·의미 |
| --- | --- | --- | --- |
| event_id | uuid | 없음 | PK, client UUIDv4 |
| participation_id | uuid | 없음 | FK participation.id ON DELETE CASCADE |
| action | text | 없음 | CHECK IN ('bootstrap','activity_start','example_complete','survey_submit','lead_submit','menu_return') |
| activity | text | 없음 | CHECK IN ('menu','example','survey','lead') |
| payload | jsonb | default '{}'::jsonb | 아래 action별 exact 비PII projection |
| payload_digest | bytea | 없음 | octet_length=32, HMAC-SHA256(K_event, canonical nonPII payload + action/topic/version) |
| applied | boolean | 없음 | 최초 상태변경만 true; menu_return은 false |
| revision | integer | 없음 | CHECK >=1, 해당 transaction 최종 참여 revision |
| example_state_at_event | text | 없음 | CHECK IN ('not_started','started','completed'), server-derived |
| recorded_at | timestamptz | default clock_timestamp() | client time 금지 |

payload exact shape: bootstrap=`{first_channel,utm_source,utm_medium,utm_campaign,utm_content}`(nullable key도 모두 포함); activity_start=`{}`(activity column 사용); example_complete=`{}`; survey_submit=`{survey_version,answers}`; lead_submit=`{}`; menu_return=`{from_activity}`. root object/unknown keys/enum/문자열 타입은 DB CHECK로 강제한다. bootstrap은 activity=menu, example_complete는 example, survey_submit은 survey, lead_submit은 lead, activity_start는 example/survey/lead, menu_return은 menu이다. menu_return의 from_activity enum은 example/survey/lead다. bootstrap payload UTM은 §4.1 allowlist로 제한하며 키·토큰·이메일 및 그 digest는 payload에 허용하지 않는다.

INDEX `marketing_round2_events_participation_idx(participation_id,recorded_at,event_id)`; 최초 적용 unique partial index `marketing_round2_events_first_apply_key(participation_id,action,activity) WHERE applied AND action <> 'menu_return'`. FK 검사용 추가 participation index는 앞 index가 겸한다. `menu_return => applied=false` CHECK, bootstrap 외 timestamp가 participation 생성/expiry 범위를 벗어나는 행과 survey payload의 다른 주제 enum은 내부 transaction 검증으로 차단한다. 이벤트 PK replay가 no-op 중복 이벤트로 증가하지 않게 한다.

### 7.3 `public.marketing_round2_lead_requests`

**성공 영수증만 저장**한다. 실패·pending·봇 토큰 보관 테이블이 아니다.

| column | SQL type | NULL/default | 제약·의미 |
| --- | --- | --- | --- |
| request_id | uuid | 없음 | PK, 성공 lead event_id; FK events.event_id ON DELETE CASCADE |
| participation_id | uuid | 없음 | UNIQUE, 참여당 성공 신청 하나 |
| round_version | text | default 'r2.1' | CHECK ='r2.1' |
| topic | text | 없음 | CHECK recording/homeflow |
| email_key | bytea | 없음 | octet_length=32; HMAC-SHA256(K_email, normalized_email), 전체 r2 주제 공통 |
| email_normalized | text | NULL | 최초 주제 신청만 normalized email, 중복은 NULL |
| topic_status | text | 없음 | CHECK IN ('new_topic','repeat_topic') |
| contact_observation | text | 없음 | CHECK IN ('existing_legacy','existing_round2','new_observed') |
| consent_version | text | 없음 | CHECK ='mumeok-r2-beta-notice-20260911' |
| purpose | text | 없음 | CHECK ='beta_open_notice' |
| consent_generation | integer | 없음 | CHECK BETWEEN 1 AND 2147483647, 접수 시 공유 control generation |
| consented_at | timestamptz | 없음 | 서버 잠금 획득 후 write_at |
| turnstile_verified_at | timestamptz | 없음 | 서버에서 provider 성공을 받은 시각 |
| request_digest | bytea | 없음 | octet_length=32; HMAC-SHA256(K_receipt, §6 exact receipt canonical object) |
| created_at | timestamptz | default clock_timestamp() | 성공 영수증 기록 시각 |
| purge_after | timestamptz | default '2026-11-30 15:00:00+00' | CHECK exact 고정 시각 |

composite FK `(participation_id,round_version,topic)` → participations `(id,round_version,topic)` ON DELETE CASCADE. unique partial index `marketing_round2_lead_requests_topic_email_key(round_version,topic,email_key) WHERE topic_status='new_topic'`. INDEX `marketing_round2_lead_requests_email_idx(email_key,created_at,request_id)`와 `marketing_round2_lead_requests_purge_idx(purge_after,request_id)`.

CHECK `(topic_status='new_topic' AND email_normalized IS NOT NULL) OR (topic_status='repeat_topic' AND email_normalized IS NULL)`; email nonnull이면 §8 ASCII 정규화/email validation과 동일 SQL CHECK; `consented_at=created_at`; `turnstile_verified_at<=created_at AND turnstile_verified_at>=created_at-interval '5 minutes'`; `created_at<purge_after`. request event는 같은 참여의 lead_submit/applied=true여야 하며 lead_completed_at=created_at이다. 다른 테이블의 참조 조건과 상태 projection 일치는 아래 deferred constraint trigger로 강제한다.

### 7.4 DB 권한·cross-row 제약

세 테이블 모두 ENABLE/FORCE ROW LEVEL SECURITY, anon/authenticated/PUBLIC의 SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER 권한을 revoke하고 일반 사용자용 정책을 만들지 않는다. 브라우저 직접 접근 0이다. internal scope에는 위 세 테이블의 필요한 읽기·insert·participation update만 주고, legacy에는 **기존 허용 읽기 경계**에서 정규화 이메일 일치 여부 확인만 허용한다. 운영 export/purge는 별도 승인된 local runbook 경계이며 웹 요청 scope에 DELETE/TRUNCATE를 주지 않는다. 기존 auth/권한 bypass flag를 재사용해 공개 권한을 넓히지 않는다.

후속 migration은 `DEFERRABLE INITIALLY DEFERRED` constraint trigger `marketing_round2_consistency`를 세 테이블의 INSERT/UPDATE/DELETE에 설치한다. commit 시 살아 있는 관련 참여에 대해 (a) bootstrap applied event 정확히 1개, (b) 각 nonnull 시작/완료 timestamp와 대응 applied event 정확히 1개 및 timestamp 일치, (c) revision = applied 이벤트 수, (d) survey event의 답변/version/snapshot과 참여 projection 일치, (e) lead completed iff 같은 참여·topic/version의 lead request 정확히 1개이며 이벤트 action/applied/timestamp 일치, (f) events.recorded_at은 created_at 이상 expires_at 미만, (g) event revision은 1 이상 참여 revision 이하를 검증한다. 메뉴/no-op event는 applied count에 넣지 않는다. 의도적인 retention/철회 cascade로 참여가 삭제된 경우 orphan이 없어야 하며 살아 있는 참여의 일부 성공 event만 삭제하는 것은 거부한다. trigger/function execute도 PUBLIC/anon/authenticated에 revoke한다. 정규화·HMAC 원문은 오류/NOTICE에 출력하지 않는다.

## 8. 이메일·동의·중복 집계

이메일 정규화는 입력 앞뒤 ASCII 공백/탭/CR/LF를 제거하고 ASCII A-Z만 lowercase한다. 결과 3~254 ASCII자, local-part 1~64자, domain 1~253자, @ 하나, local-part 허용 `[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]`, 앞뒤 점/연속 점 금지, domain은 점으로 구분된 1~63자 label 두 개 이상이며 `[a-z0-9]`로 시작/끝, 중간 하이픈 허용이다. UTF-8 국제화 이메일/quoted local-part는 이번 폼에서 지원하지 않는다. Gmail dot/plus alias 제거·공급자별 동일인 추정은 하지 않는다. 동일 비교를 클라이언트 단독 판단에 맡기지 않는다.

동의 label: `무먹 베타 오픈 알림을 이메일로 받기 위해 이메일 주소와 신청 주제·동의 기록을 수집·이용하는 데 동의해요. 보관 기간은 2026년 11월 30일까지이며, 철회하면 해당 정보를 삭제해요.` 목적은 해당 주제 베타 오픈 알림 1회와 접수 관리이며 일반 광고·뉴스레터·계정 생성 동의로 확장하지 않는다. 미동의자는 예시·설문을 그대로 이용할 수 있다. 폼에서 privacy 링크와 `동의하지 않아도 예시와 의견 남기기를 이용할 수 있어요`를 표시한다. 미성년자 추가 정보를 수집하지 않고 `만 14세 이상인 경우에만 신청해 주세요`를 표시한다. 현재 개인정보 운영자/연락처는 공식 privacy 문서를 따르고 여기서 새로운 운영 사실을 만들지 않는다. 이 문구·목적·기간·위탁 사실의 공개 반영과 독립 개인정보 검토가 실제 lead activation의 필수 gate다.

| 지표 | 정의·중복 처리 |
| --- | --- |
| 참여 수 | 참여 row distinct id, round_version/topic/first_channel별. 브라우저의 보관기간 내 주제 참여이며 고유 사람/광고 클릭 수 아님 |
| 활동 시작/완료 | 각 nonnull timestamp의 distinct participation 수. applied=true 해당 event와 일치해야 함 |
| 주제 신청 행동 | lead_requests distinct participation_id. 같은 이메일이 다른 브라우저에서 신청해도 행동으로는 별개 |
| 회차·주제 고유 관심 | `(round_version,topic,email_key)` distinct 수. 같은 주제 repeat_topic을 고유 관심 증가로 세지 않음 |
| 보관 중 r2 고유 연락처 | email_key distinct 수, 주제별 고유 수를 더하지 않음 |
| 보관 중 전체(v1/v2+r2) 고유 연락처 | 같은 시점 read-only snapshot에서 legacy의 실제 보관된 normalized email과 r2 new_topic email을 같은 규칙으로 비교한 union distinct. email_hash와 email_key의 byte값을 직접 union하지 않음 |
| 관측상 신규 연락처 | 아래 new_observed, 잠정치. 역사적 최초 사람/확정 신규 고객이라는 이름 금지 |
| 메뉴 복귀·재시도 | 신규 참여/시작/완료 지표에 포함하지 않음. menu_return 별도 관측 수는 event_id distinct |
| 설문 응답 | topic/survey_version/문항별 submitted 참여 분모, Q4의 no/unsure 포함. 시작·제출 시 체험 snapshot별 분리 가능 |

새 lead 처리 시 같은 r2 email advisory lock 안에서 (1) legacy의 보관된 accepted 이메일 일치 확인 (2) 모든 r2 topic의 기존 email_key 조회 (3) 해당 topic 신규 여부 판정 (4) row 생성한다. legacy가 있으면 contact_observation=`existing_legacy`, 아니고 r2가 있으면 `existing_round2`, 둘 다 없으면 `new_observed`. 해당 주제 첫 row만 email_normalized를 저장하고 그 외 repeat_topic row는 NULL이다. 이미 legacy에 있어도 새로운 topic 관심과 그 목적의 새 동의는 기록하되 신규 연락처로 세지 않는다. 동일 참여는 이메일 변경·다중 신청을 허용하지 않는다.

legacy lookup 실패 시 신규로 추정하지 않고 503으로 rollback한다. r2 내부 동시 신청은 lock+partial UNIQUE로 보호하지만 **기존 v2 writer가 r2 lock을 잡지 않기 때문에 동시에 들어온 legacy 신청의 부재 판정까지 직렬화하지는 못한다**. 그때 new_observed는 사후 동일 snapshot union으로 재집계하며 잠정 관측값과 확정된 현재 보관 연락처 수를 구분한다. 기존 v2 writer/table/cookie를 바꾸거나 legacy 신청을 막아 이 한계를 숨기지 않는다. retention/철회로 삭제된 메일은 다시 알아낼 수 없으므로 역사적 전체 고유 수·평생 신규 여부는 복원할 수 없다. 영구 이메일 해시 tombstone을 새로 만들지 않는다. 식별자는 사람의 증명이나 mailbox ownership 인증이 아니다.

legacy 실측 계약은 `trim().toLowerCase()`, 입력 최대 320자, `lower(email) WHERE email IS NOT NULL`의 전역 unique다. accepted row만 email을 갖고 duplicate row는 NULL이며 주소 연결키도 없다. r2의 더 좁은 254자 입력 검증을 legacy 데이터에 소급하여 유효 연락처를 통계에서 빼지 않는다. 비교 조회는 현재 미만료 `lead_submission_status='accepted' AND email IS NOT NULL AND retention_until>조회시각`만 읽고 저장 이메일을 trim/lower로 비교한다. legacy 전체 union에는 같은 미만료 기준의 기존 허용 주소 전체를 유지한다. 기존 v1/v2 캠페인/creative로 잘라 조회하지 않는다. 실제 구현 근거는 `lib/server/marketing-validation.ts`, `supabase/migrations/20260831100000_marketing_validation_sessions.sql`, `supabase/migrations/20260903010000_marketing_validation_sessions_v2.sql`이다. 기존 export는 이 전체 snapshot 집계를 보장하지 않으므로 재사용 결과를 곧바로 전체 고유 수라고 부르지 않는다.

`topic_status/contact_observation/email_key/normalized_email`은 lead 전용 PII 영역이며 public 응답·이벤트 payload·클라이언트 분석에 금지한다. accepted/duplicate마다 status, 메시지, 응답 field, cookie 정책, UI를 달리하지 않는다. 이메일 lookup API를 추가하지 않으며 모든 최초 신청에 같은 동의/Turnstile/gate를 요구한다. 정보 존재 여부를 timing classification으로 사용하는 기능도 제공하지 않는다.

### 삭제·보관

세 테이블의 purge_after는 고정된 보관 종료 시각이다. 종료 이후 즉시 읽기/수집을 차단하고 승인된 purge가 24시간 안에 participation을 삭제해 event/lead를 cascade 제거한다. 그 전 동의 철회는 검증된 본인 요청을 기존 개인정보 처리 절차로 접수한다. 승인된 local runbook은 공유 control의 lead_enabled=false → 모든 collector가 새 lead를 거부함을 확인 → 진행 중 r2 lead 요청과 DB transaction이 0이 될 때까지 drain(최대 30초, 확인 불가면 닫힌 상태 유지) → consent_generation 증가 → 같은 email advisory lock 아래 해당 email_key의 r2 lead와 연결된 participation/event 모두 삭제 → commit 후 남은 matching row 0 확인 → 승인된 lead gate 복원 순서다. 삭제 완료 시각은 이 commit 시각이며 그 전에 접수된 in-flight 요청이 뒤늦게 저장될 수 없다. 오래된 클라이언트의 consent_generation은 재개 후에도 409이므로 UI가 동의 체크/토큰을 지우고 새 generation snapshot과 새 명시 동의·challenge·event_id를 받아야 한다. 삭제 뒤의 명시적 새 신청만 새 동의로 취급한다. 다른 이메일의 과거 성공 receipt도 오래된 generation을 그대로 재전송하면 409지만, bootstrap snapshot의 기존 completed 상태는 유지된다. 원문 email/key/digest와 해당 export를 함께 지우며 주제 대표 email row만 지우고 duplicate 해시를 남기지 않는다. legacy 삭제는 기존 privacy 절차의 별도 권한으로 수행하며 r2 웹 scope에서 자동 수정하지 않는다. browser local data는 로컬 생성 30일/서버 expiry/철회 인지 중 먼저인 시점에 제거한다.

email_key, bootstrap_digest, request_digest도 가명 식별정보로 취급하고 공개 통계에 내보내지 않는다. raw IP/user-agent/referrer/cookie/page context/Turnstile token은 DB/이벤트/로그/URL/오류 보고/설문 답변에 저장하지 않는다. 운영 export는 승인된 로컬 경로에 필요한 normalized email+주제+동의시각만 일시 제공하고 같은 보관 종료/철회 정책을 따른다. 기존 v2 export/dashboard가 r2 테이블을 자동 읽거나 기존 선형 퍼널에 합치지 않는다. 통계 구현은 별도 작업이며 이 문서의 분모/한계를 유지한다.

## 9. 보안·비활성 기본값·로컬 분리

`MUMEOK_ROUND2_ENABLED=false`, `MUMEOK_ROUND2_LEADS_ENABLED=false`가 기본이다. 첫 flag가 false면 public r2 페이지 404, POST는 503 ROUND2_DISABLED다. 첫 flag만 true면 예시/설문 수집은 가능하되 lead 폼은 준비중·disabled이며 lead_submit은 503이다. 어떤 v2 enabled/ready flag도 r2를 암묵적으로 켜지 않는다.

lead readiness는 enabled 둘 모두 true, 수집 기간 안, 전용 키 모두 유효, production exact origin/hostname, 실제 Turnstile 검증, DB migration·권한 검증 evidence, 공개 동의/개인정보 문서·보관삭제 runbook·운영자 승인 evidence가 모두 있어야 열린다. boolean 하나만 켜는 것으로 evidence를 대체하지 않는다. readiness 자료는 환경의 secret-free exact 승인 release와 연결하고 서명/credential 원문을 문서/브라우저에 넣지 않는다.

서버 secret은 `MUMEOK_ROUND2_PAGE_SECRET`, `MUMEOK_ROUND2_COOKIE_SECRET`, `MUMEOK_ROUND2_BOOTSTRAP_SECRET`, `MUMEOK_ROUND2_EVENT_SECRET`, `MUMEOK_ROUND2_EMAIL_SECRET`, `MUMEOK_ROUND2_RECEIPT_SECRET`, `MUMEOK_ROUND2_RATE_SECRET`(각 독립 CSPRNG 32bytes 이상)과 `MUMEOK_ROUND2_TURNSTILE_SECRET_KEY`다. 브라우저에 전달 가능한 것은 r2 전용 site key뿐이다. v2 secret과 공유하거나 `NEXT_PUBLIC_`로 비밀을 노출하지 않는다. 키 누락/약한 키/동일 키는 fail closed다. 이번 campaign 안에서는 서명·digest 키를 임의 교체하지 않는다. 유출 시 수집 중단과 별도 승인된 키 교체·참여 재시작·중복집계 한계 공지가 필요하며 무검증 old-key fallback을 두지 않는다.

production exact Origin은 `https://app.mumeok.kr`, Host는 `app.mumeok.kr`, Turnstile hostname은 `app.mumeok.kr`이다. Origin absent/null/다른 scheme·port·subdomain은 거부한다. `Sec-Fetch-Site`가 있으면 `same-origin`만 허용하고 없으면 exact Origin 검증을 유지한다. 임의 forwarded header를 신뢰하지 않고 기존 신뢰 proxy 경계에서만 client IP를 얻는다. 신뢰 IP를 얻지 못하면 rate 차단을 해제하지 말고 503이다.

Turnstile action은 topic별 exact `mumeok_r2_recording` / `mumeok_r2_homeflow`다. 서버 Siteverify가 success=true, exact hostname/action, challenge_ts가 미래 30초 이내·과거 300초 이내인지 확인한다. Siteverify `idempotency_key`는 lead event_id, remoteip는 보내지 않는다. provider 요청 timeout=5초, 같은 token/event_id로 네트워크 재시도 최대 1회. timeout/비정상 응답은 503, 검증 실패는 422, 새 challenge 안내다. token은 DB에 보관하지 않는다. 원문 token의 2048자/300초/1회성 및 provider idempotency는 [Cloudflare 공식 server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)을 확인했다(2026-09-11). 그 외 수치와 gate는 이 서비스가 정한 정책이다.

서버 rate는 **새 r2 전용 local-file fixed-window adapter**로 구현한다. 현재 Auth의 process-memory Map을 공유형 adapter로 간주하거나 재사용하지 않는다. 새 의존성/네 번째 DB table 없이 Node 내장 fs/crypto를 사용한다. 이 계약의 collector는 단일 서버 host로 제한하고 모든 process가 같은 rate/control 경로를 사용한다. 여러 host로의 확장은 별도 계약과 공유 저장소 검증 전 금지한다.

저장 경로는 운영 승인 시 지정하는 저장소 밖 절대경로 MUMEOK_ROUND2_RATE_STATE_DIR이며 owner-only 0700 directory, state.json은 0600 regular file이다. 심볼릭 링크/다른 owner/네트워크 파일시스템은 거부한다. counter key는 HMAC-SHA256(K_rate, canonical {day,bucket,subject})의 hex이고 subject는 신뢰 IP 또는 참여 UUID다. raw subject를 저장하지 않는다. state exact shape는 {version:1,counters:{[hexKey]:{count:integer,window_end:integer}}}이며 값은 epoch seconds다.

각 요청은 같은 directory의 lock을 atomic mkdir로 독점 취득하고 만료 counter 정리 → 모든 해당 bucket 검사 → 허용이면 모든 counter를 함께 증가 → 같은 directory의 exclusive 임시 file 쓰기/fsync/atomic rename/directory fsync → lock 해제 순서로 처리한다. state를 읽거나 persist하기 전에 요청을 성공 처리하지 않는다. bucket 초과 요청도 다른 아직 미초과 bucket은 증가시키고 초과 bucket은 limit에서 포화시키며, counter persist 뒤 429를 반환한다. lock 대기는 25ms 간격, 총 250ms 한도이고 실패하면 503이다. state 누락/손상/저장 오류/4MiB 한도 초과는 503이며 살아 있는 counter를 임의 evict하지 않는다. crash로 남은 lock은 자동 탈취하지 않고 승인된 운영자가 모든 collector가 멈췄음을 확인한 뒤 정리한다. 정상 restart는 state를 그대로 재사용한다. 초기 빈 state 생성/분실 복구는 collector가 정지된 runbook에서만 하며 분실 복구 시 최대 window인 1시간 동안 수집을 닫은 뒤 초기화한다.

시간창은 UTC epoch 정렬이다. 모든 요청 IP당 60회/분, bootstrap IP당 20회/분, 유효 참여당 60회/분, lead_submit IP당 10회/시간 및 참여당 5회/시간을 모두 적용한다. IP key day는 UTC 날짜이고 시간창 종료 때 counter를 제거하며 TTL은 1시간 이하, 운영 장애 시에도 24시간을 넘겨 보관하지 않는다. 실패·영수증 재요청도 rate에 포함한다. multiple bucket 거부면 가장 긴 남은 초를 Retry-After로 준다. edge rate는 추가 방어다. 여러 process의 경쟁/동시 file replace/crash 후 재시작/lock orphan/잘못된 owner/clock 경계 테스트를 activation 전 통과해야 한다.

공유 제어 파일 MUMEOK_ROUND2_CONTROL_PATH도 저장소 밖 owner-only regular file이며 exact {version:1,collection_enabled:false,lead_enabled:false,consent_generation:1}로 초기화한다. 승인된 운영자가 atomic replace로만 갱신한다. 환경 flag와 control flag가 모두 true일 때만 열린다. every request 및 DB write 직전 control을 새로 읽고 누락/손상이면 503이다. generation은 증가만 허용하며 운영 기록으로 rollback을 금지한다. collection/lead off와 generation 변경은 현재 승인 evidence와 함께 적용한다. state/control 경로는 응답·로그에 노출하지 않는다.

로컬 preview는 별도 `MUMEOK_ROUND2_LOCAL_PREVIEW=true`와 exact loopback Host로만 열며 브라우저가 메모리 mock adapter를 사용한다. production Host에서는 이 flag가 있어도 활성화하지 않는다. `로컬 미리보기 · 저장되지 않아요`를 모든 화면/완료에 표시하고 실제 POST/DB/Turnstile 호출 0, 실제 email 대신 `preview@example.com` fixture만 사용한다. public POST는 preview에서 항상 ROUND2_DISABLED다.

isolated 통합 테스트는 HTTPS `https://localhost:3443`, hostname=`localhost`, 테스트 전용 키·Turnstile mock/test fixture·별도 DB·rate namespace를 사용한다. production origin/secret과 한 프로세스에서 혼합하지 않는다. 일반 collect/lead flags는 테스트 fixture 전용 환경에만 설정하고 loopback+isolated identity 확인 실패 시 시작을 막는다. 실제 provider 검증/인앱 성능/이메일 발송이 mock 테스트로 검증됐다고 보고하지 않는다.

## 10. 구현 검증과 추가형 migration·runbook 인수 조건

후속 Stage 1은 이 계약의 exact Git SHA/문서 경로를 README·acceptance·automation-spec에 잠그고 PR #1550의 v2 선형 제약을 r2에 적용한 부분을 제거해야 한다. 이 PR에서는 workpack 검증 완료나 제품 구현 완료를 선언하지 않는다.

| 영역 | 후속 구현 단계가 반드시 남길 검증 evidence |
| --- | --- |
| 계약 타입 | 모든 action의 허용/누락/추가 필드, 잘못된 topic/version/question enum, unknown key·중복 JSON key·token 길이·email 경계·body streaming 한도 |
| bootstrap | 최초 응답/Set-Cookie 유실, 같은/다른 event_id 재시도, 같은 주제 동시 탭 서로 다른 광고, IndexedDB 원자 생성, 두 주제 동시 탭, key-cookie 불일치, cookie 위조/중복/expiry, storage 차단 |
| 상태 | 단독 3활동·완료 순서 6가지·교차 중단/복귀, 모든 invalid start/complete, survey 시작/제출 체험 snapshot 차이, 같은 답변/no-op/다른 답변 409, 낮은 revision 응답 무시 |
| DB 원자성 | event insert/lead insert/state update 각각 fault injection 시 부분 저장 0, event ID cross-owner 충돌, parallel lead 20개, 같은 email 양 주제 unique, deferred trigger 직접 위반 차단 |
| 연락처 집계 | 같은 참여 retry, 다른 참여 동일 email, 두 주제 관심/전역1명, existing legacy, 동시 legacy 삽입의 provisional 한계, 삭제 email 재유입, lookup 실패 503 |
| 보안 | direct anon/authenticated SELECT/mutation/RPC deny, 다른 cookie 참여 접근, wrong origin/hostname/action, missing secret/disabled gate, 모든 replay에도 gate/rate 유지, token·PII log/event redaction |
| 유지·삭제 | expires_at/purge_after 경계, 철회 fence/drain/generation 변경·재개 후 stale 요청 거부, 모든 topic matching row cascade, 부분 이벤트 삭제 거부, export 삭제, legacy row/cookie/API checksum 보존 |
| 화면 | 두 주제 각각 모든 MENU/EXAMPLE/SURVEY/LEAD/DONE/RECOVERY, 비활성·loading·empty·error, 모바일 320×568/390×844/393×852·desktop·키보드·reduced-motion·인앱 브라우저·실패 후 입력 보존 |
| 기존 회귀 | v2 exact 4유형·8단계·질문/endpoint/cookie/table/retention, 기존 광고 attribution·선형 dashboard 값 불변 |
| 테스트 격리 | preview 실제 POST 0, isolated DB target provenance, fixture email only, full-local 운영/Cloud 연결 0 |

migration artifact는 새 세 테이블·index·CHECK·FK·RLS·trigger·scope allowlist만 추가한다. 기존 테이블 ALTER/UPDATE/백필/삭제, 기존 v2 constraint 변경, migration history 재작성은 금지한다. schema/security 테스트는 [Supabase local-only 운영 기준](engineering/supabase-local-only-operations.md)의 pinned isolated local stack에서 실행한다. 웹/백엔드 단계는 변경 유형에 맞는 lint/typecheck/targeted tests/build와 gate를 실행하고 결과를 기록한다.

배포 runbook 인수물은 exact candidate SHA·migration SHA256·isolated replay/중복 재시도/직전 앱 호환 결과·DB backup freshness 확인 방식·RLS negative evidence·disabled default·production secret/Origin/Turnstile/동의/retention 준비 체크·권한자·중단/복원 절차를 포함한다. 실제 적용은 별도 승인된 배포 경로에서만 수행한다. 복원 기본은 r2 수집 flag off와 호환 앱 복원이며 새 테이블/수집 데이터 DROP·reset·자동 restore가 아니다. campaign 종료는 신규 쓰기 차단, 보관 종료는 삭제로 각각 처리한다. 운영 apply 전에 이 문서의 날짜가 지났으면 날짜만 바꾸어 켜지 말고 계약/동의 재검토를 한다.

문서 작성 단계의 검증은 CSoT 경로 sync, 공식 5종 위임·endpoint/table 총계, 링크·필수 상세항목, diff whitespace, branch/commit/PR 본문 정책이다. executable implementation이 없으므로 위 표의 기능/DB/브라우저 검증은 후속 단계의 미완료 요구사항으로 남긴다. independent reviewer에게는 exact base/head SHA, 이 문서와 공식 5종 diff, 문서검증 결과, bootstrap/PII/동시성·보관 정책을 입력한다.
