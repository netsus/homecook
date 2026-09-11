# Stage 5 수리 재검토 결과

**approve / required 0. R2-S5-001 해결 확인.**

- 검토 head: `62eff252cdd537c9a849caf1881ac490687abac3`
- 제품 수리: `7bfe0d3b48f771bf5c3fa26421fac54ad6e53e77`; 최종 head와 제품·검증 코드 차이 없음.
- base: `8c6573bf594fa15613205ce97e4435d751c7d87c`
- reviewer: `01a08e8f-6c04-7233-a12c-b256f460e6cb`, Stage4 작성자와 다른 실제 작업.
- 범위는 public Stage5다. `pending-review`를 유지하며 final authority·Stage6·confirmed·Ready·merge·배포를 승인하지 않는다.

## R2-S5-001 종료 근거

원 신청 요청과 편집 중인 입력이 분리됐다. 기존4실패 조건·무수정대조2건 모두 원 event를 유지하며 재시도했고, 추가 요청 없이 성공을 반환하던 경로는 재현되지 않았다. 원문 Git 소스를 메모리에서 변환하고 가짜 전송 함수로 실행한 결과이며 실제 서버·DB를 다시 실행하지 않았다.

| 경계 | 확인 결과 |
| --- | --- |
| 이메일을 바꾼 뒤 접수 확인 | 토큰 없이 원 event·원 이메일·원 동의 generation만 조회. 편집 주소는 전송하지 않음 |
| 영수증이 없는 경우 | 가짜 저장 모델과 제공 실제 API에서 tokenless422, 새 lead 생성0 |
| 이미 접수된 응답 유실 | 원 영수증 확인, 새 lead 생성0. 제공 실제 실행에서도 두 주제 확인 |
| 편집 취소·원 입력 복원 | 원 이메일 복원, 동의 미체크, 토큰 제거. 복원 동작 자체 POST0 |
| 복원 후 재동의 전 명시 접수 조회 | 계약이 허용한 원 영수증 POST만 수행 가능. 새 lead 생성0과 조회 요청 수를 구분 |
| 재동의·새 challenge 후 명시 재시도 | 같은 원 event·원 payload 사용 |
| 동의 generation 증가·409 | 이전 요청 무효화·동의 해제. 새 동의와 challenge 이후에만 새 generation/event로 제출 |
| 재연결 | 편집 입력을 자동으로 신청하지 않음 |

새 UI는 ‘이전 신청 접수 확인’과 ‘편집 취소하고 이전 입력으로 돌아가기’를 구분하고, 편집한 이메일이 전송되지 않았음을 안내한다. 원 이메일은 사용자 화면의 탭 메모리에만 표시하며 제공 캡처에서는 가렸다. 두 주제의320/390×100/200% 전체8장·CTA8장을 직접 읽었고, 새 글자 잘림·겹침·CTA 가림은 발견하지 못했다. 제공 geometry도 본문14→28px, overflow/clipping0, 두 버튼 중앙·하단 hit를 확인한다.

[재시도 재현 결과](reproductions/lead-edit-repro-result.json) · [영수증·409 경계](reproductions/receipt-boundary-result.json) · [직접 복원 경계](reproductions/restore-boundary-result.json). 재현 원문은 `.cjs.txt`로 byte 보존했으며 [보관 매핑](archive-relocations.json)을 따른다.

## 직접 실행과 제공 근거

- **직접 코드 재현**: 원 실패4+대조2, 영수증/409 경계4, 부모 reviewer의 양 주제 복원 경계2. 모두 fake transport이며 실제 DB 쓰기 수로 오인하지 않는다.
- **직접 최종 미리보기**: 현재 source62eff의 production 메모리 미리보기3126을 in-app Browser로 확인했다. recording320 신청→완료→메뉴의 단독 완료 표시, homeflow390의 독립 초기 상태·신청→완료와 초점을 확인했다. 이 미리보기는 실패/실제 접수를 검증하지 않는다. [기록](live-preview/homeflow-390-lead-done.png), [작성자 빌드 출처](inputs/stable-preview-author-readme.md). 소유 서버는 변경하지 않았다.
- **제공 route-mocked 브라우저**: 실제client/view/CSS + fixture page/API/challenge,10조건·8크기/확대조건.16장 직접 시각 검토,6개 비페이지 소스 hash는 최종head와 일치. 페이지 fixture 교체를 실제 서버 페이지 검증으로 표현하지 않는다.
- **제공 실제 전체 실행**: `--lead-edit` 한 번의28조건(기존24+추가4), hcg_74053_7748de. 1,316관측·115캡처기록/113고유PNG·27참여·mock19. 새 수리의8캡처파일(6고유이미지)도 읽고 hash를 확인했다. 첫 실패와 집중4실행은 최종 전체PASS와 구분해 보존됐다.
- **수치 의미**:208은 파싱된 응답 수다. trace는 request273/response210이며 response의2개는 별도 intercepted-commit 표식이다. 전체 송신수·응답수·DB행수를 섞지 않았다.
- **제공 테스트**:345 PASS/7 skip, lint/type 및22 harness 검사. 최종 무옵션 DB 명령은 재실행하지 않았다. 실행 후의 기본 dispatch helper 추출·기본 선택 변경은 명시 diff/단위검사로 분리한다. 물리적인 한 줄 diff나 최종 무옵션 전체 실행이라고 주장하지 않는다.

## 6개 JSON 내용 검토와 연결

| JSON | 판단 |
| --- | --- |
| authority-screen-coverage | 8 shared / 16 canonical, 정적 설계와 실제 관측 연결 일치 |
| authority-viewport-coverage | 4폭·200%의 과거64셀과 새 수리320/390확대 근거를 구분 |
| authority-flow-traces | 3단독·6순서×두 주제·복원/탭/주제 등28조건의 실제 관측 범위 일치 |
| authority-accessibility-observations | 초점/조작/오류·확대와 실기기·safe-area 한계를 구분 |
| authority-environment-provenance | memory/route mock/실제 isolated/provider 미실행을 구분 |
| authority-review-independence | 작성자와 독립 reviewer 구분, 과거 request_changes 및 미래 gate pending 보존 |

원문6개 요구 문장과ID를 보존했고850참조/328고유 path+hash 및 JSON pointer가 모두 맞았다. 실제 산출물256개와 캡처 소스1,869개도 일치했다. `next-env.d.ts`는 generated/untracked로 분리했다. [참조 검증](inputs/six-json-reference-check.json) · [의미·수치 검증](inputs/six-json-semantic-check.json).

6JSON 경로는 R2_MENU 첫 evidence 블록에 지원되는 bullet/backtick 형식으로 넣었다. 8보고서 합집합에 정확히6개가 연결되며 기존 시각 근거는 유지했다. LEAD/RECOVERY에는 새16장 중 전체8장의 지원 참조와 Stage5 추가 설명을 넣었다. [변경 파일·해시](authority-report-link-revision.json).

동일62eff입력의 별도 검증 폴더에서 strict report/file-presence 검사는 오류0이었다. [형식 검증](strict-evidence-validation.json). 이 결과는6JSON 내용 검토의 대체가 아니며, 실제 OMO runtime 상태·전체 CI 통과를 뜻하지 않는다.

## 체크리스트와 후속 이식

frontend/review5 대상18개는17개 일치, `accept-r2-authority`는 별도 final authority가 남아 있으므로 downstream pending이다. Stage5의 필수 수정은0이다. 8shared/16canonical의 Stage5 코드 리뷰는 모두 통과다. [18개 결과](checklist-review.json), [구조화 결과](stage5-result.json).

원래 request_changes 결과와 근거 파일을 덮어쓰지 않고 이 `recheck-62eff252/`에 새 결과를 남겼다. 6JSON의 current_report/pre-link hash는62eff원문을 가리키므로, 이식 때 작성자/조정자가 불변 원문 경로를 보존하고 새 report/projection hash를 명시적으로 연결해야 한다. 이후 문서 projection 변경의 경로/hash 대조는 별도다. 이번 승인을 미검토 미래변경에 자동 승계하지 않는다.

전체 global geometry4 baseline 실패·visual10 실패(9동일수치,meal-detail 후보65,906px/기준63,377px 차이 미분류·candidatePNG 미보존)는 여전히 열려 있다. 실기기/인앱/키보드·전체WCAG·스크린리더 발화·실provider/메일·운영은 이번 검증이 아니다.

다음은 조정자가 별도 작업에 맡기는 final product-design-authority이며, 이 작업은 Stage6이나 confirmed 처리로 진행하지 않는다.
