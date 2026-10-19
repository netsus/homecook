# 최근 레시피 영양 연결·출처 검토

2026-10-17. 운영 접근 중단 전 확보한 공개 응답 캐시와 제한된 승인 profile 투영, 저장소의 기존 출처 검토만 사용했다. 운영 backup/data 쓰기0. 최신 상태를 새로 확인한 결과가 아니다.

PR1785의 정확 v4 계량값 부분 계산을 기존 캐시6개에 적용하면 카레·통삼겹바비큐·두부볶음·잡채는 부분 계산, 만둣국·소갈비찜은 미확인이다. 캐시에는 scalable/recipe basis가 빠져 별도 이전 확보 자료와 합쳤고, 총량 진단에서 모든 행을 fixed로 두었다. 선택 인분·운영 결과 검증으로 확대하지 않는다.

## 원인과 최소 수정 후보

| 대상 | 구분 | 조치/남은 조건 |
|---|---|---|
|만둣국 식용유10g|옛 ingredient ID가 현재 승인 profile에 연결되지 않음|현재 식용유 `d6d92b38-853f-43c2-b2e1-2b4a591de334`로 정확 연결 후보. 원명·양·원문 보존.|
|통삼겹바비큐 오일|일반명 옛 ID·수량 미확인|동일 식용유로 연결 후보. 연결해도 미확인 양은 그대로 유지하며 완전 영양으로 바뀌지 않는다.|
|만둣국 냉동만두/육수코인|catalog는 있으나 승인 영양 profile 없음|실제 만두 유형·제품과 육수코인 제품/희석전 질량·라벨 확인 필요. 다른 브랜드 만두·완성 육수 수치 대입 금지.|
|소갈비찜 늑간살/갈아만든배|catalog/source 연결·제품 기준 불명|고기 부위/손질 상태와 제품의 포장·일반/제로 등 버전을 확인한다. 이름 유사 ‘자연마을 배주스’는 다른 제품이라 제외.|
|카레|승인 영양원천 있음, 분량 미확인·환산 부족|기존 정확 질량은 부분 계산. v4로 미확인된 큰술/개수 값을 옛 대표 환산으로 덮어쓰지 않는다.|
|두부볶음 대파흰대/조청/후추가루|부위·원료·가공 상태별 연결 불명|대파 전체, 조청유과/고추장, 종류 불명 후추를 이름 부분일치로 대입하지 않는다.|
|잡채 생표고버섯|기존 표고 profile은 approved이나 `as_published`만 확인|원자료가 생/건조 어느 상태인지 확인 전 동일 식품으로 단정하지 않는다.|

이 두 oil 행의 대상 canonical recipe는 각각 `e0ead6ed-184d-40d9-add6-2181d5042992`, `3c4e9cec-ab39-478a-ab28-26ca30780958`다. 실제 editable JSON·행 키·현재 revision·파생 snapshot 범위는 아직 백업하지 않아 UPDATE SQL을 실행 가능 상태로 만들지 않았다. 잠금 해제 뒤 두 레시피의 정확 before-image와 수정 후 preview를 별도 검토하고 CAS로 최소 연결만 반영해야 한다. 과거 cooking/meal pins와 원문은 변경하지 않는다.

## 출처와 날짜

- 기존 식용유 승인 profile은 `HOMECOOK_USER_STANDARD`, ‘Homecook 대표재료 영양 프로필’, version `2026-09-15`,100g 기준이다. 공공 실측값이라고 표시하지 않는다.
- 오일 부피 환산은 [제조사 Nisshin Oil handbook](https://www.nisshin-oillio.com/oil/pdf/book.pdf)의 큰술15mL≈14g 안내를2026-10-17 확인했다. 일반 물의15mL=15g을 식용유에 대입하지 않는다. 영양 profile의 대표성·부피 환산 근거는 서로 다른 정보다.
- 기존 표고 후보는 USDA FDC SR Legacy `2018-04-final`,100g, 기존 청양고추·후추는 RDA10.4 `2026-09-14` 수입본100g이다. 승인 상태만으로 생표고/땡초/가루의 정체성과 조리 상태까지 확정하지 않는다.
- [RDA 공식 DB 안내](https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562)를2026-10-17 확인했다. 이번 조사에서는 누락 식품에 정확 대응하는 새 수치를 확보하지 못했다. 기존 `ingredient-nutrition-followup-review-20261006.json`도 냉동만두의 종류, 조청의 원료 확인을 요구한다. `nutrition-completion-research-20261010.json`도 육수코인 제품 정체를 요구한다.
- 갈아만든배 제조사 htb 공개 제품 정보 검색은 했으나 제품 페이지403으로 라벨 기준량·영양 수치를 확보하지 못했다. 다른 제품이나 소매점의 출처 불명 수치로 채우지 않았다.

확보하지 못한 수치는 null/부분 상태로 유지한다. 향후 새 source를 저장할 때 원자료 URL·식품/제품 코드·버전·기준량/단위·조리 상태·조회일·검토 상태를 함께 남기고, 추정이 필요하면 그 근거와 추정 표시를 별도로 저장한다. 이번 조사에서 사용자 건강·식사기록·인증 정보를 외부로 전송하지 않았다.

## 후속 반영 계획

[기계 판독 계획](data/recent-nutrition-link-plan-20261017.json)에이전캐시의정확old ingredient행과target profile기준량·버전,미확인분량수,제품/원료보류,최소backup→CAS→readback조건을기록했다. 실행플래그는모두false이고backup/운영쓰기0이다. 공개UUID GET은재시도하지않으며잠금해제후부모가필요한사용자확인을조율한다.


## 2026-10-19 현재 행 재확인 — 두 연결 후보의 구조 차단

최신 플랫폼 백업/별도 매체/격리 복원 검증 뒤 두 레시피만 읽기 전용으로 다시 확인했다. 둘 다 editable revision2이며 과거 캐시의 old ingredient ID는 실재 catalog 행이 아니라 미연결 snapshot 재료의 합성 UUID였다. 이를 영양 profile에 연결하는 UPDATE/INSERT는 적절한 해결이 아니다. 실제 승인 식용유 profile은 현재도 active/approved·100g/HOMECOOK_USER_STANDARD/2026-09-15이며 새 수치는 필요하지 않는다.

현재 만둣국은 사용자가 수정한 식용유10g과 source pointer null을 갖는다. 원source의 ‘오일2큰술’로 되돌리면 현재 양을 덮어쓰므로 금지한다. 바비큐는 오일/양·단위 미확인/source pointer 유지 상태다. `project_youtube_saved_recipe_ingredient_links`는 응답 시 계산하는 STABLE 함수이며 물리적인 link table/별도 link writer는 없다. 기존 editable CAS writer도 명시 ingredient_id 필드를 지원하지 않아 두 ID만 바꾸는 기존 권한 RPC는 없다.

비공개 beforeimage와 link preview, 과거 snapshot/meal/session의 count/hash를 보존했고 운영 쓰기는0이다. 원문·현재 양·과거 pin을 유지하는 명시 catalog 선택 저장 계약이 다음 별도 작은 묶음의 후보이며 DB235/web 배포에 섞지 않는다. 이전 계획의 `ready_to_execute=false`를 유지한다. 정확 제품·식품 정체가 불명인 나머지 영양 수치는 계속 미확인/부분으로 표시한다.
