# R2 독립 final authority 결과

**approve / authority pass / 필수 수정 0.** 8개 공통 화면, 두 주제의 canonical 16개를 검토했다. 이 판정은 R2 디자인 범위이며 기존 전체 검사 실패를 면제하지 않는다.

- reviewer task: `01a08f0c-bbbb-74b1-ac9b-20feb1ac085f`, `product-design-authority`, `final_authority_gate`.
- 직접 제품/브라우저 검토: `62eff252cdd537c9a849caf1881ac490687abac3`.
- 최종 metadata 검토: `1a51971262e758896e725af31f104f42424cff78`.
- 제품 commit: `7bfe0d3b48f771bf5c3fa26421fac54ad6e53e77`, base `8c6573bf594fa15613205ce97e4435d751c7d87c`, [PR #1555](https://github.com/netsus/homecook/pull/1555).
- Stage4 `01a08e24-2609-77e2-b303-3fb8bd6223e8`, Stage5 `01a08e8f-6c04-7233-a12c-b256f460e6cb`와 다른 실제 task다. 보조 에이전트는 참조 검증만 지원하며 이 승인을 대신하지 않았다.
- coordinator `01a07316-265c-7f22-b0af-fa22b7fb2b8a`가 통합 및 별도 Stage6를 소유한다.

> evidence:
> - `ui/designs/evidence/marketing-demand-validation-round2/final-authority-01a08f0c/direct/recording-390-MENU-initial.png`
> - `ui/designs/evidence/marketing-demand-validation-round2/final-authority-01a08f0c/direct/homeflow-320-MENU-initial.png`
> - `ui/designs/evidence/marketing-demand-validation-round2/final-authority-01a08f0c/provided-route-mocked/recording-320-200-edited-recovery-cta.png`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-screen-coverage.json`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-viewport-coverage.json`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-flow-traces.json`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-accessibility-observations.json`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-environment-provenance.json`
> - `docs/workpacks/marketing-demand-validation-round2/evidence/stage4/authority-review-independence.json`

## 화면별 판정

점수는 /5 정성 평가다. 순서는 모바일 사용성 / 행동 명확성 / 시각 위계 / 색·재질 / 익숙한 패턴이다. 4점은 사용 가능한 범위이며 결함 개수나 픽셀 일치율이 아니다. 아래 각 보고서에 양 주제의 기본390·좁은320 근거, 점수와 다음 행동을 연결했다.

| 화면 | 판정 | 점수 | 근거 요약 |
| --- | --- | --- | --- |
| [R2_MENU](../../../../../../ui/designs/authority/R2_MENU-authority.md) | pass | 4/5/4/5/5 | 알림→예시→의견 위계, 출시 전·자유 선택 안내 |
| [R2_EXAMPLE](../../../../../../ui/designs/authority/R2_EXAMPLE-authority.md) | pass | 4/5/4/5/5 | 직접 입력과 예시·추정치, 세 장면·명시 완료 |
| [R2_EXAMPLE_DONE](../../../../../../ui/designs/authority/R2_EXAMPLE_DONE-authority.md) | pass | 5/5/4/5/5 | 예시 확인과 실제 서비스 구분, 종료·메뉴 primary |
| [R2_SURVEY](../../../../../../ui/designs/authority/R2_SURVEY-authority.md) | pass | 4/5/4/5/5 | 네 문항·부정/없음 선택·Q4 직접 입력 조건 |
| [R2_SURVEY_DONE](../../../../../../ui/designs/authority/R2_SURVEY_DONE-authority.md) | pass | 5/5/4/5/5 | 감사·접수·재제출 불가, 명시 메뉴 복귀 |
| [R2_LEAD](../../../../../../ui/designs/authority/R2_LEAD-authority.md) | pass | 4/5/4/5/5 | 미체크 동의·보관·철회·14세·미동의 대안 |
| [R2_LEAD_DONE](../../../../../../ui/designs/authority/R2_LEAD_DONE-authority.md) | pass | 5/5/4/5/5 | 신청 접수 의미만 표시, 발송/소유확인 주장 없음 |
| [R2_RECOVERY](../../../../../../ui/designs/authority/R2_RECOVERY-authority.md) | pass | 4/4/4/5/5 | 원 신청 확인과 편집 취소·재동의 구분 |

blocker **0**, major **0**, minor **0**, `required_fix_ids: []`. 이전 R2-AP-001/002와 R2-S5-001의 종료 근거를 확인했으며 새 required finding은 발견하지 못했다. 기존 앱 anchor/Wave1 exact parity/하단 탭을 이번 별도 캠페인에 새로 요구하지 않았다.

## 직접 캡처와 행동

제공된 `127.0.0.1:3126`의 실제62eff 페이지/production build를 사용했다. 새 서버를 만들거나 소유 wrapper66451/child66453/session48056을 변경·종료하지 않았다. BuildID `ojaiIGyjDlOMvWFrlUvf9`, compiled-tree `bb836c65288d4a57917d3ee96788a177e9442df2987a287567ad757b0cc56c9c`는 작성자의 보존된 빌드 출처다. 이 reviewer가830개 compiled hash를 다시 계산한 것은 아니다.

1. 두 주제·390×844/320×568에서 첫 메뉴의 세 선택지를 확인했다.
2. 알림만 먼저 완료하고 메뉴에 해당 활동만 완료 표시되는 것을 확인했다. 동의 없는 제출은 오류와 체크박스 초점으로 안내했다.
3. 예시 세 장면을 진행해 직접 입력·추정치·준비된 예시 안내, 명시 완료와 메뉴 복귀를 확인했다.
4. 설문 네 문항을 진행하고 완료 후 메뉴로 돌아왔다. 접수 확인 재진입은 질문/신청 폼을 다시 열지 않았다.
5. 새로고침하면 메모리 미리보기 완료가 사라지는 것을 확인했다. 이 동작을 실제 저장 복원으로 해석하지 않았다.

최종 실행은 **88 PNG / 238 GET**, 실제 POST·외부 요청·차단된 요청·localStorage/sessionStorage/IndexedDB·cookie·console warning/error·pageerror **모두0**이다. 요청은3126의GET만 허용하는 방어 규칙을 두었으며 실제 차단 발생도0이었다. 88개 화면 관측의 페이지 가로넘침0, 관측한 버튼 높이 최소44px이다. 대표28장(7화면×두 주제×두 폭)을 이 reviewer가 직접 열어 읽었다. 나머지 캡처는 행동/상태 보조 원본이며 전부를 개별 시각 판정했다고 쓰지 않는다.

MENU 세 번째 버튼의 하단은390에서569.70px, recording320에서561.64px, homeflow320에서585.64px다. homeflow의320×568에서는 세 번째 버튼의 끝이 초기 뷰포트 아래로 이어지지만 primary가 보이며 자연스러운 세로 스크롤과 설계 목표y≤600을 충족한다. 긴 동의와 질문은 축소·절단하지 않고 같은 문서에서 제출로 이어진다. 하단 고정 UI가 입력을 가리지 않는다.

직접 실행 순서는 알림→예시→의견 한 가지이며, 양 주제·두 폭에서 진행했다. 나머지 단독 활동·6순서·두 탭·실제 저장 복원은 제공 기록이다. [직접 로그](../../../../../../ui/designs/evidence/marketing-demand-validation-round2/final-authority-01a08f0c/direct/capture-log.json).

처음 두 캡처 시도는 완료 배지까지 포함한 버튼 이름을 찾는 reviewer 스크립트가 timeout되어 중단됐다. 제품 오류로 세지 않았다. 두 중단 로그/이미지를 별도 보존했고 실제 관측한 버튼 목록에서 정확한 항목을 선택하도록 스크립트를 고친 최종 실행은 exit0이다. 브라우저 기본 바이너리 revision이 없었던 준비 시도도 있었으며, 이미 설치된 Chromium145를 명시해 실행했다. 의존성 설치나 제품 수정은 없다.

## R2-S5-001: 직접 UI와 제공 실제 근거의 경계

3126은 메모리 preview이므로 실제 오류를 재현하지 않았다. 실제 오류 판정은 exact 제품과 일치하는 제공 원자료와 캡처를 읽었다.

| 경계 | 확인된 의미 |
| --- | --- |
| 이메일 편집 후 이전 신청 접수 확인 | 원event·원이메일·원동의 generation의 tokenless 조회이며 편집 이메일을 보내지 않음 |
| 영수증 미존재 | 실제 API422·새 lead0; 성공으로 꾸미지 않음 |
| 이미 접수된 응답 유실 | 원영수증200, 추가 lead write0 |
| 편집 취소 | 원입력 복원·동의 해제·token 제거, 이 조작 자체 POST0 |
| 새 동의·challenge 후 명시 재시도 | 같은 원event·원payload로 실제200·lead1 |
| generation409 | 오래된 동의/요청을 무효화하고 새 명시동의·challenge·generation/event 경계 유지 |

제공 route-mocked 자료는 실제 client/view/CSS에 fixture page props/API/challenge를 공급한10조건이며, 새 복구변형의320/390×100/200%8조합/16PNG다. 100% 전체4장, 200% 전체4장과 CTA4장을 직접 열었다. 원 이메일이 마스킹되어 있음을 명시하며, 가려진 실제 캡처의 문장을 상상하지 않고 다른 마스킹 범위의 자료와 exact 코드로 대조했다. 글자 확대는 root16→32px·복구본문14→28px이며 제공 geometry의 잘림/가로넘침0·두 CTA hit와 일치한다. 현재 새 수리를393/desktop까지 새로 확대검증한 것으로 표현하지 않는다.

실제 최종 실행은 `--lead-edit`를 사용한 **28조건**이다. 1,316관측은 UI767/request273/response210/assertion66이고, response210 중2개는 intercepted-commit 관측이므로 **파싱된 envelope208**과 구분한다. 캡처기록115/고유PNG113, 참여27/mock provider19이며 실제 provider0이다. 첫 실패·집중4실행·최종28실행을 합쳐서 성공처럼 표현하지 않는다. 실행 후 기본 dispatch 변경은 별도 단위 동등성22테스트 기록이며 최종 무옵션 DB 전체 실행을 다시 했다고 주장하지 않는다.

일부 화면 관측과 응답 파싱 로그는 비동기여서1~2ms 순서가 뒤바뀐다. 배열 시각만으로 응답 이후 렌더를 입증하지 않았으며, 코드와 명시 assertion·접수 전/후 관측을 함께 사용했다. DB·키·실제 provider는 다시 실행하거나 탐색하지 않았다.

## 원문·해시·metadata 대조

제품62eff의 옛Stage5 request_changes는 역사다. 처음 입력으로 받은 별도 외부 Stage5 `recheck-62eff252`는 approve/required0/17pass+final authority1대기이며 이를 현재 Stage5 결과로 읽었다.

최종1a519와62eff의 전체 Git 차이는73개 R2 문서/근거 파일이다. 승인한 metadata 범위 밖 파일 변화0이며 제품·테스트·harness·설정·package·공식계약은 그대로다. 외부 Stage5 원문23파일과8 authority report가 최종Git에 byte동일하고, pre-link62eff의8개 원문 보관본도 이전Git bytes와 동일하다. 원 request_changes의 report/result는 unchanged다. [직접 대조](metadata-comparison.json).

6JSON은 존재만 확인한 것이 아니라 화면/폭/흐름/접근성/환경/독립 역할 내용을 검토했다.62eff의850참조 발생·328고유 path/hash·201pointer는 불일치0이었다. 최종1a519의1,004참조 발생·347고유 path/hash·217pointer도 불일치0이다. 새 참조는 별도 [metadata 보조검증](metadata-helper-result.json)을 따르며 원문 hash와 새 projection을 구분한다. final authority task 배정만 기록하고 본인 판정을 미리 생성하지 않았음을 확인했다.

[불변 입력 보관](input-preservation.json)은62eff의6JSON·이전8보고서·외부Stage5의8보고서를 별도로 보존한다.1a519의 변경파일 snapshot은 `inputs/1a519-metadata/`다. 본 패키지의 새8보고서를 이식할 때 조정자는 기존Stage5/1a519 보고서 hash를 그대로 보존하고 새final report/projection을 별도로 연결해야 한다. 아직 존재하지 않는 미래 commit/hash나 Stage6 reviewer를 만들지 않았다.

## 남은 gate와 다음 단계

- 이 final 디자인 판정은 **R2만 pass**다. coordinator가 정확한 입력/원문/새 결과를 동기화하고 별도의 Stage6를 진행할 수 있다.
- 기존 전체 gate mobile geometry4·desktop visual10 실패는 남는다. meal-detail의 후보65,906px/기준63,377px 차이와 후보PNG 미보존은 미분류다. 본 판정으로 면제하거나 Ready/merge하지 않는다.
- 실제 provider/메일, 실제 기기·인앱·가상 키보드·스크린리더 발화, 공개 개인정보 검토·운영 activation은 Manual Only다. 화면 캡처로 전체WCAG 준수를 인증하지 않는다.
- production_mutation=false, release_lock_mode=none, release SHA/tag/approval=N/A.3100·운영DB·full-local·Cloud·기존baseline·root/author worktree 수정0. 제공preview의 시작/종료/변경0.
- 본 작업에서 confirmed/Stage6/Ready/merge/배포를 실행하지 않았다. 코드를 단순화하거나 제품 파일을 수정하지 않은 검토 작업이다. 변경 산출물은 별도8보고서·구조화 결과·직접 캡처·불변 입력 보관뿐이다.

[구조화 최종 결과](final-authority-result.json) · [시각 판정 JSON](visual-verdict.json) · [패키지 검증](package-validation.json). 실제 근거를 복사한 별도 폴더에서 strict evidence 형식·활성 보고서 링크·16ID 구조 검사 모두 오류0이다. 제품 변경이 없는 검토이므로 lint/typecheck/단위테스트/전체gate를 새로 실행하지 않았다. 작성자의 검증 기록은 제공 근거로만 유지한다.
