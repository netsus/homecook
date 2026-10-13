# C01-W2 제한된 무게 예측 계산 준비

> 아래는 최초 순수 계산 단계의 역사적 기록이다. 현재 W1/W3 로컬 통합·v2 MIX 추론·검사와 남은 경계는 [후속 통합 기록](cooked-weight-evidence-integration-20261014.md)을 따른다. 최초 단계의 미연결 설명/41검사는 현재 전체 완료 상태를 뜻하지 않는다.

상태: **로컬 순수 계산 함수와 직접 검사 준비**. 완료/API/DB/UI와 연결하지 않았고 C01 기능 출시 완료를 뜻하지 않는다. 기존 `cooked-batch-weight-estimate.ts` parser·hydration은 이 작업의 변경 대상이 아니다. 새 의존성·운영 적용·외부 AI·학습·개인정보 목적/기간 변경0.

작업 기준: master `4838132875b9446bab54d18bf08245b706445a1b`, managed worktree `cooked-weight-prediction`, branch `codex/cooked-weight-prediction`. 다른 작업자의 parser/제품 기능 수정은 되돌리지 않는다.

## 입력과 계산 범위

`lib/server/cooked-weight-prediction.ts`의 `predictCookedWeight`는 신뢰된 서버 정규화 결과만 받는다. 네트워크 요청·JSON decoder·DB 권한·실측 저장·모델 학습 기능이 아니다. 사용자 입력을 이 타입으로 단언해 바로 넘기지 않는다.

행은 **대상 배치에 이미 맞춘** 원양·원단위·g·환산 근거·계획/보고된 실사용/미확인 출처·원천 ID/버전·식품/물/기름 역할·생/익힘 상태를 보존한다. `cookingServings`는 맥락이며 이 함수가 수량을 다시 배율 계산하지 않는다. 같은 recipe snapshot을 참조하여 원래 기본 인분/양도 재현할 수 있게 후속 writer가 연결해야 한다.

조건은 `confirmed/inferred/unknown`과 evidence reference를 분리한다. 필요한 조건이 확정되지 않거나 근거가 없으면 null과 사유를 반환한다. API/화면의 새 필수 입력을 요구하지 않으며 현재 데이터에 없는 조건은 서버 mapper가 명시 unknown으로 놓는다.

| 지원 변환 | 조건과 결과 |
|---|---|
| 명시 폐쇄 혼합 | 가열 없음·전체 가식부·배수 없음·물/기름 존재와 모든 양이 확인된 닫힌 경계. g 합을 한 번 사용한다. 이 결과도 추정이며 전체 실측으로 분류하지 않는다. |
| 확인된 외부 질량 손실 | 모든 외부 유출을 포함한다는 근거와 그 g이 확정된 경우 한 번 차감한다. 국 내부 고형→국물 이동은 별도 손실로 만들지 않는다. 미상 유출을0으로 치환하지 않는다. |
| 조건 수율 | 검토된 rule ID/버전, 정확한 식품 식별·원상태·조리법·완성 음식 경계·배수·물/기름·프로토콜이 모두 일치할 때만 적용한다. |

구간은 **서로 겹치지 않는 독립 음식 경계**다. 같은 row/구간의 중복, 빈 구간, 누락 행, 같은 수율에 추가 손실·흡수·추가량을 덧붙인 변환은 거절한다. 같은 재료를 여러 단계로 가열하는 그래프·부모/자식 구성요소 모델은 이번 작은 함수가 지원하지 않는다. 그 경우 caller가 임의 중복 행을 만들지 말고 unknown/별도 후속 모델로 남겨야 한다.

정량 행 한 개라도 g·유효 근거가 없으면 완성 총무게는 null이다. 적당량·미상 원량·미상 물/기름·알 수 없는 quantity origin을0으로 만들지 않는다. 제품은 자기 고정 버전의 관계만 사용하며 일반 재료 밀도를 차용하지 않는다. 양수·유한수, 원양/직접 g/kg 일치, 물 부족·입력 질량 초과, 중복 규칙과 상한도 검사한다.

입력 행/구간/행참조는 각각200 이내, 규칙 목록은32 이내로 제한한다.200행은 기존 영양 predecessor 입력 상한을 따르며 이 helper가 고객의 신규 UI 한도를 바꾸는 것은 아니다.

## 현재 필드와 미래 mapper 경계

| 예측 입력 | 지금 있는 근거 | 이번에 하지 않는 추정/연결 |
|---|---|---|
| recipeSnapshotId·cookingServings | `cooking_sessions.recipe_content_snapshot_id/cooking_servings`, 고정 `recipe_content_snapshots` | 현재 recipe를 다시 읽어 고정 내용 대체0. 실제 writer/세션 권한 검증은 후속 C01-W1 경로다. |
| rowKey/sourceKind/sourceId | 현재 recipe 재료 행 ID·ingredient_id/제품 쌍; C03의 안정 row key·제품 분기 계약 | 이름이나 대표 재료 ID만으로 행 합치기0. snapshot 내 안정 key가 필요하고 mapper는 그 snapshot에 실제 존재하는 행만 투영해야 한다. |
| 원양·g·원천 버전 | 저장 amount/unit/scalable와 선택 인분, 기존 승인 밀도/개수/제품 관계 resolver | C03/C04 정규화/배율 코드를 복제하지 않는다. 이미 배치용 양으로 맞춘 결과를 받으며 이 함수가 새 환산 근거를 생성하지 않는다. |
| quantityOrigin | 현재 계획/레시피 양은 planned로 표시 가능 | 완료·편집 저장만으로 reported_actual 승격0. 실제 사용량 확정 근거가 없으면 unknown이며 학습용 실사용 정답으로 취급하지 않는다. |
| preparationState/foodIdentity | 승인 source/evidence와 명확한 구조화 정보가 있는 경우 | 현재 parser가 preparation_state를 null로 두는 경로를 raw로 가정0. NDB23565와 generic 다진 소고기의 자동 동일시0. |
| method/protocol | 현재 cooking method ID·duration/heat는 일부 구조화 근거다 | `볶기` 태그나 자유문장만으로 USDA 연구 장비·시간·추가지방·배수 프로토콜 확정0. 약한 단서는 inferred, 누락은 unknown. |
| 음식/물/기름 역할·배수·외부 흐름 | 현재 전체 레시피 양은 있지만 구조화된 경계·배수·외부 손실은 일반적으로 없다 | 기존 데이터에 없는 사실을 채우거나 사용자에게 추가 필수 질문을 만들지 않는다. 없으면 null이 정직한 준비 결과다. |

공개 API 계약/기존 completion 호출을 이 새 타입으로 교체하지 않았다. 현재 기존 레시피 대부분에 exact 프로토콜·폐쇄 경계가 없을 수 있으므로 이 helper를 자동 연결하면 기존0.75 계산보다 unknown이 늘 수 있다. 실제 coverage 비율을 조사하지 않았고 정확도 개선 완료를 주장하지 않는다. 다음 W1/W3 통합에서 현재 필드를 대표하는 fixture의 산출 가능률/unknown 사유와 기존0.75 기준을 나란히 확인해야 한다. 역사적0.75 결과를 새 조건 추정의 근거 있는 fallback으로 숨기지 않으며, 실제 표본·정규화·변환/실측 안내 검증과 별도 통합 결정 전 운영 기본값을 바꾸지 않는다.

## 수율 자료와 테스트 전용 계수

기본 등록은 **USDA Release2/2014 NDB23565 한 행의 로컬 계산 후보**뿐이다. [공식 Data.gov 메타데이터](https://catalog.data.gov/dataset/usda-table-of-cooking-yields-for-meat-and-poultry)의2014 PDF·CSV·dictionary CC0 표시와 [공식 연결 CSV](https://ndownloader.figshare.com/files/43365402)를 독립 조회했다. CSV SHA-256 `e6144d36488781c3eab2428bd4fd576d85092a93fc709aa05868d20fe6ba1f4f`, 해당 지방12%미만 crumbles/Pan-fried 행69를 확인했다.

[ARS 2014 PDF](https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/USDA_CookingYields_MeatPoultry02.pdf)도 독립 읽었다.30쪽 문서 SHA-256 `69492fdf8334e8fbcf4a9204e70d685cbca5cf32f6e99a6648976db833e53765`,5쪽의 뜨거운 조리 결과/생 시료 분모와6쪽의 전기팬5.3분·colander 배수를 확인했다. CSV release-year2002와 자료 판본2014는 구분한다. 원표 전체는 소스/DB에 복제하지 않는다.

이 후보는 정확한 프로토콜 식별이 없는 일반 다짐육·찌개·지방/배수 미상·추가 물/기름에는 적용되지 않는다. 모듈 안의 `reviewed_candidate`는 자료 검토와 로컬 산술 상태이며 운영 rollout 승인이 아니다. 공급 source/권리·조건 검증은 별개이며 임의 client rule 정의를 신뢰해서는 안 된다.

Bognár2.98은 권리 검토 보류 상태를 유지하고 **기본 규칙에 등록하지 않는다**. 검사는2.98을 명시적인 synthetic test coefficient로 넘겨100g→298g/흡수수 재합산 금지를 시험한다. `availability=test_fixture`, `rights=test_fixture`, 결과 `scope=test_fixture`를 유지해 운영 rule이나 라이선스 확보로 포장하지 않는다. inactive/미등록/물 부족/이미 익힘은 null이다.

## 불변 결과·다루지 않는 영양/실측/학습

결과는 model version, nullable total g, 사유, 원입력의 분리된 불변 snapshot, 적용 rule/원천 버전·checksum을 반환한다. caller 입력을 수정하지 않고 선언된 특징만 복사하며 불필요한 자유문장·추가 payload를 끌고 가지 않는다. 같은 입력은 같은 결과다. 시각·UUID는 여기에서 새로 생성하지 않으며 C01-W1의 원자적 writer가 그 맥락을 별도로 저장해야 한다.

숫자 결과는 항상 `estimated`, 산출 실패는 `unavailable`이다. `learningEligible=false`이며 자동 예측이 measured 관찰로 바뀌지 않는다. `reported_actual` 재료량도 완성 음식 실측을 뜻하지 않는다. 영양 총량·잔존율·섭취량·잔량 원장을 계산하거나 과거 snapshot을 재작성하지 않는다. 소수 정밀도는 내부에서 보존하며 사용자 표시/오차 보증/신뢰 확률을 만들지 않는다.

## 검증과 후속

직접 검사는 폐쇄 혼합/국 내부 이동·외부 손실/정확 USDA 조건/테스트 흡수/물 부족/이미 익힘/미상 물·기름·g/제품 버전/적당량/중복 구간/부분합/비정상 수치/입력 상한/불변 snapshot을 포함한다.

- `pnpm exec vitest run tests/cooked-weight-prediction.test.ts`: **41통과, 실패·건너뜀0, exit0**.
- 변경 source/test ESLint와 `pnpm typecheck`: **exit0**, 오류·경고 출력0.
- `pnpm verify:anti-slop`: **exit0**,705파일/current191/baseline207/**신규 위반0**. baseline을 갱신하지 않았다.
- 전체 build·DB·API·UI·실제 음식 정확도/실측 학습은 미실행이며 위 검사로 대신하지 않는다. 소스/검사 해시는 인계 메모에 고정한다.

W-A01~07의 순수 계산 부분과 W-A08/10/11의 출처·불변성 준비를 다루지만, 권한·완료 멱등성·실측 시점 제한·운영 배포·전체 개인정보/학습의 W1/W3/W5/D0~D5 검증을 대신하지 않는다. 후속 mapper와 실제 저장·화면을 별도로 합쳐 검증하기 전 **서비스 기능 완료로 보고하지 않는다**.
