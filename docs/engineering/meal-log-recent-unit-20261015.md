# 새 식사 검색 선택의 최근 저장 단위 제안

## 2026-10-15 운영 반영 — 최근 단위와 T9 식사 수정 표본

#1714를 master `13495fdadb3785874c4a3457e6ce2d6e4ed3dbc7`에 병합하고 웹 `10cfaa6b245ef7cd9e74488b91cc33f1377aab49`·build `prelaunch-10cfaa6b245e-QkMzLR`를 반영했다. 배포 exit0·1,449 PASS·선택 범위 밖133 skipped, DB228·migration0이다. 아래 로컬/운영 반영 전 문장은 당시 기록이며 이 절이 최신이다.

실제 우유 검색 선택에서 최근 L을 제안하되 양은 빈칸이었다.320/375/1440 가로 넘침 없음을 확인하고 새1/4L를250mL로 전환해 double click 저장 후 entry e941 한 건만 생겼다. 원1/4 L은 보존하고 `normalized=null`·`DENSITY_REQUIRED`·영양unavailable을 유지했다. 다음 선택은 저장된 mL·빈칸이고, 저장하지 않고 취소한 L은 기억하지 않았다. 기존 당일4행·원 batch/evidence/attestation은 같았다. guest는 예시 플래너·개인 QA 항목 비노출→점심 추가 로그인 안내·같은 날짜/segment next→계속 둘러보기 닫기까지 확인했으며 실제 OAuth 복귀는 미실행이다. 제품 version 불일치·다른 소비자의 최근 단위는 이 일반 우유 한 표본으로 완료 처리하지 않는다.

앞선 T9에서는 수정 취소 후 원본이 같았고30→35g 저장 뒤 원실측160g·잔125g, 같은35g을 아침→점심 이동/reload 뒤75kcal·당일 표시157kcal를 확인했다. 양 변경 때 `weight_basis.batch_revision`1→3은 기존 SQL의 당시 근거 재캡처 계약이며 다른 원근거는 같았다. 최초 whole-basis 비교 실패는 보존한다. 같은 양 이동에서는 basis의 batch_revision을 포함한 영양객체 전체 exact equality를 유지했고 당일 다른3행·원 evidence/attestation도 같았다. 이 해석으로 모든 비교에서 revision을 빼지 않는다.

수동 발행 #1712의 웹 dd399/NYuI8l 배포·1,449검사 통과와 실제 발행 성공은 다르다. 실제503/pending·원 recipe1/receipt1/nutrition0이 남았고 실제 prepare/payload 연결과 v4 사유5종·estimated 코드 누락을 후속 검증 중이며229는 미적용이다. C05 수집 OFF·기간 미정, 정확도/전체 v9 미완료·새 추출/외부 AI0을 유지한다. 근거는 비공개 `mumeok-beta-meal-recent-unit-20261015-mzwu0jz5`의 요약/원수량/화면·guest 기록, `mumeok-beta-t9-meal-edit-20261015-7cw_m0bl`의 전후 JSON/화면과 독립 weight_basis 검토다. root의 실제 실행과 제공 이미지 직접 읽기를 구분하며 문서 작업에서 운영·DB·브라우저를 재실행하지 않았다. [진행 장부](mumeok-beta-v9-progress-20261013.md#최근-저장-단위-운영-반영t9-식사-수정-확인--2026-10-15)를 따른다.

2026-10-15 로컬 변경, 기준 master `66aea3564c18d431bc7e8f47acc639b96f2e6cf8`. 운영 반영 전이다. C04 U-A11 중 **식사기록의 제품·재료 새 검색 선택** 한 곳만 연결한다. 최근 기록 직접 선택의 원량 복원과 다른 입력 소비자의 U-A11을 새로 완료했다고 세지 않는다.

## 선택 규칙

- 기존 `fetchMealLogRecent()`로 이미 읽은 식사기록 목록만 사용한다. 같은 source type+ID이고, 현재 제품 영양 version 또는 일반 재료 profile이 비어 있지 않으며 저장된 `source_version`과 정확히 같아야 한다.
- 현재 `sourceUnitOptions()`에 있는 저장 단위만 우선 제안한다. 현재 profile에 따른 상태·환산 근거와 제품 고정 version의 기존 옵션 검증을 재사용하며 단위 허용 범위를 넓히지 않는다. 일반 식품명·브랜드 문자열로 추정하거나 다른 source/용도로 전파하지 않는다.
- 조건을 만족하는 현재 로드 목록의 첫 저장 단위를 사용하고, 이력이 없거나 version/profile이 미확인·불일치이거나 단위가 지원되지 않으면 기존 `sourceUnit()` 기본 추천을 유지한다. 보지 않은 다음 페이지 이력을 추정하거나 추가로 가져오지 않는다.
- 제안은 **단위만**이다. 새 수량과 원입력은 빈칸이며 최근 양·원분수를 새 섭취량으로 채우지 않는다. 저장된 display 단위와 raw 단위가 다르면 제안에는 display 단위를 사용하고, 이후 사용자가 입력한 새 원문만 저장 요청에 사용한다.
- 같은 음식을 새로 선택할 때도 v4의 로컬 수량·raw·이전 원입력 ref를 비운다. 저장 실패 후 동일 source를 다시 고르면 이전 effect 의존값이 같아 로컬 양이 남던 경계도 이 명시 새 선택에서 닫는다.

최근 목록이 늦게 도착해도 작성 중인 양·단위를 덮지 않는다. `chooseRecent`, 초안/편집/로그인 복귀, 기존 원량·제품 version·단위 환산과 저장/권한 API는 그대로다. 취소·미리보기·실패 저장을 최근 이력으로 만들지 않으며 새 설정/전역 메모리/브라우저 저장소를 추가하지 않는다. quantity-v4 OFF 경로는 기존 동작을 유지한다. 이력의 저장 단위를 이용하는 것이며 별도 단위 버튼 클릭 이력이 있다고 주장하지 않는다.

## 검증

- 변경 전 새 회귀14개 중4개 실패를 보존했다. 단위 제안만 연결한 중간13/14 통과에서 실패 저장 후 같은 음식의 양200 잔존을 재현했고, v4 명시 새 선택 초기화 후 회귀를 닫았다.
- 새 전용16개와 기존 quantity-v4/추가창36개, 관련3 suite52개가 통과했다. 일반 profile/제품 version·다른 source·미확인/불일치 version·지원하지 않는 단위·raw/display 구분·새 양 빈칸·기존 초안·늦은 이력·취소/실패·legacy OFF를 포함한다.
- 실제 Next의 모형 API에서 일반 재료/제품 ×320/375/1440을 확인했다. 최근 L/팩 제안과 빈 수량·사용자가 새로 입력한 분수·기존 단위 전환·실패 후 새 선택 빈칸을 확인한다. 실제 DB/저장은 실행하지 않으며 각 저장 실패는 의도된500 모형이다.
- 타입·대상 ESLint·`verify:anti-slop` 새 위반0·production build가 exit0이다. build의 기존 무관 경고4건은 유지한다. 자체 브라우저·dev3295·가짜 backend3296을 정리했고 dev/build는 순차 실행했다. 정확 종료값과 모형 화면/정리 증거는 `/tmp/mumeok-meal-recent-unit-final-freeze.json` 및 handoff에 고정한다. 실제 운영·OAuth·DB·AI·worker 실행은 하지 않는다. 총괄이 독립 리뷰와 커밋/PR/운영 반영을 담당한다.
