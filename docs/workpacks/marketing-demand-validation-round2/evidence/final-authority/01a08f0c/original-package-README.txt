# R2 final authority 인계

**approve / pass / 필수 수정0.** 독립 reviewer task `01a08f0c-bbbb-74b1-ac9b-20feb1ac085f`.

[통합 보고서](docs/workpacks/marketing-demand-validation-round2/evidence/final-authority/01a08f0c/final-authority-report.md) · [최종 결과 JSON](docs/workpacks/marketing-demand-validation-round2/evidence/final-authority/01a08f0c/final-authority-result.json).

제품/브라우저는 `62eff252cdd537c9a849caf1881ac490687abac3`, 최종 metadata는 `1a51971262e758896e725af31f104f42424cff78`다. 두 주제390/320 직접88PNG, 7화면×두 주제×두 폭 대표28장 직접 시각검토와 제공 실제/route-mocked 복구자료를 구분했다.8공통/16canonical 전체pass, blocker/major/minor0이다.

## coordinator 이식 범위

아래 세 경로만 현재PR의 후속 evidence 변경으로 이식한다. 이 패키지는 검토 checkout을 수정하거나 commit/push하지 않았다.

1. `ui/designs/authority/R2_*-authority.md` 8개: **새 final authority 판정**이다. 이전Stage5 원문은 `docs/.../final-authority/01a08f0c/inputs/external-stage5/ui/designs/authority/`에 byte 보존했고,1a519 snapshot도 별도로 있다. 기존 report의 원문/hash 이력을 덮어 없애지 않는다.
2. `ui/designs/evidence/marketing-demand-validation-round2/final-authority-01a08f0c/`: 직접 캡처 최종실행/중단2시도와 제공 actual/route-mocked 복사본. 환경을 서로 합산하지 않는다.
3. `docs/workpacks/marketing-demand-validation-round2/evidence/final-authority/01a08f0c/`: 보고서·구조화 결과·불변 입력·검증·정적 보관스크립트. `inputs/`는 읽기용 역사 snapshot이며 원경로로 되복사하지 않는다. 스크립트 `.mjs.txt`/`.cjs.txt`를 제품 실행코드로 바꾸지 않는다.

`.omx/state/`는 이 리뷰의 시각판정 보관본이며 제품/OMO canonical runtime을 직접 변경하라는 지시가 아니다.

## 이식 이후 필요한 작업

- 6JSON은1a519의 기존 관측/옛보고서hash/Stage5승인 출처를 보존하고, 새 final task·보고서·결과hash를 **별도 항목으로** 추가한다. 과거관측의 source SHA나 prelinkhash를 새판정으로 치환하지 않는다.
- 새 보고서 첫 evidence 블록 합집합은 실제6JSONrefs를 포함한다. 실제 runtime이 있으면 담당자가 report paths/evidence refs와 일치시키고, 이식한 실제head의 strict 검증을 수행한다. 본 패키지의 독립 폴더 형식검사는 live runtime 검증이 아니다.
- 통합 후 새metadata head가 생겼다는 이유만으로 미검토 제품변경까지 승인을 승계하지 않는다. 제품은 계속 동결하며 Stage6는 별도 작업이다.
- global geometry4/visual10/meal-detail 미분류가 남아 있으므로 Ready/merge를 실행하지 않는다. 본인은 confirmed/Stage6/Ready/merge/배포를 실행하지 않았다.

운영 DB/실제 provider/기기/공개 개인정보·activation은 기존 Manual Only 경계다.3126 소유 preview는 그대로 유지했다.
