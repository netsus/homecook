# 영양 JSON·중복 조건 정리와 잔여 종료 분류

## source84 / 운영87 — 소스 검토 시점

기준 c103790a6, 제품7809c1d37(영양JSON1)/0031da9f6(검색q2), 행동잠금549fec481이다. 실제 운영은62c20d4bd/buildprelaunch-62c20d4bd305-ktOrhp·DB238·Anti87이다. 새소스84는 아직 머지/배포하지 않았다. 원163은79해결/84잔여, 원275 전체/별도49 완료가 아니며 자동0이 목표가 아니다.

## 실제 단순화와 행동 잠금

영양 읽기의 수기 재귀 query계약을 실제 SDK 선택열/FK로 바꿔 JSONB5필드는unknown으로 유지했다. 기존 mapper/의미검증기를 assertion predicate로 정확히 표현하고, 이미 검증된 mapped값을 scale의 실제4필드 입력으로 직접 전달한다. 중복17줄 계산 객체와 cast-only서버뷰 helper를 삭제했다. 전역RecipeNutrition optional계약과 기존full calculation호출의반환타입은 유지한다. 검증된 nutrient순회에서complete/available을 함께 구하고 source검증과canonicalMap을 합쳤다. typeofnumber는 기존Number.isFinite가이미거부하던비number를정적으로좁히며, JSON source의AI/other판정·오류코드·entry별unavailable·조회/RPC전체500·핀우선·owner/date/order는 유지한다. 임의getter/Proxy/sparse JS객체까지동등하다고주장하지않는다.

검색picker는API의기존truthy q URL생략과중복된조건2줄만삭제했다. 내부인수에는빈q키가생기지만wireURL은동일하다. trim/cursor/중복/재시도/stale응답차단은변경0. provider/마케팅·factory·SQL·scripts·환경·YouTube2제품파일diff0이다.

snapshot38·legacy4 행동검사는제품코드변경없이추가했다. snapshot의원소null은throw지만일부primitive는NaN/undefined로허용되고문자열수량은분기별coercion/throw라일괄guard로409를만들면기존동작이아니다. legacy는안정local RPC-only와키없음null외에환경재읽기불일치시TypeError또는raw client반환을mock으로고정했다. 실제remote/Cloud/DB접근이아니다. 이3항목은소비계약/권위상관설계후속으로종료분류했지영구불가로판정하지않는다.

## 검증·실패 기록

변경전기존5suite64PASS/12명시적native SKIP, 새44JSON/SDK의첫실행43PASS/1FAIL은빈warnings배열을잘못거부로예상한테스트오류였다. 기존허용을확인해기대만바꾸고44PASS후제품을수정했다. 추가server-view/계산포함4suite118PASS다. 이선택들은중복합산하지않는다. 존재하지않던planner-meal-nutrition-view파일명은server/pages정확경로로정정했다.

전체타입초기실패는SDK GenericSchema의Record요건과interface Row, JSON unknown이된손상fixture, 역사적offline SQL mock transport, Array.isArray의원소any추론이었다. Rowtype별칭·실제unknown[]반환·손상fixture구성만수정했고제품단언/규칙완화는없다. 역사적격리DB fixture는제한된기존SQL transport임을주석과test-only단언으로명시했고실SDK직접대입은새fixture가검증한다. native12개는이번실행하지않았고미실행을성공으로넓히지않는다.

최종15suite345PASS/0skip·전체비증분tsc·변경12파일lint(max0)·diff·verify84/new0 PASS. baseline207/규칙/scope불변, counts assertion24/array37/conditional23이다. 독립영양3suite73PASS+8파일lint/source APPROVE, 검색6wire PASS/lint/source APPROVE이며root와중복합산하지않는다. baselinec103의기존mapper/writer검증기와JSON-roundtrip 1,112개결과(반환또는오류name/code)를비교해불일치0이다. 전체JS도메인증명이나DB/RLS실검증은아니다.

## 고정 ID별 84개 종료

[배열/조건부62개정적감사](evidence/anti-slop-array-conditional-value-review-20261020.json)에는각ID의문맥·유지이유·재검토조건이있다. 이감사의sourceEdits/testsExecuted0은코드수정전정적감사에만해당한다. 후속으로실제중복q2만검증후채택했다. 나머지60은작은정제의가독성/희소배열·순서·옵셔널키의미/참고prototype/보호된추출기범위별로구분했다. extractor의반복find 경계2와중복필터1은가치가능성이있지만YouTube보호해제·동작golden·실측후속조건으로남겼다. 단순loop/flatMap치환으로숫자만줄이지않는다.

[전체84개종료장부](evidence/anti-slop-residual-closeout-20261020.json)는snapshot1·legacy2·provider1·YouTube17·명시보류3·배열/조건부60을모두유일ID로대응한다. 이번pass종료이지자동범위해제/영구불가가아니다. 원163×8식별필드·과거52/19/117/191스냅샷은불변이다. provider는Draft1836/원R2plan거절·YouTube기존dirty·권한3/static3/444/PR1745·원49미발견을보존한다. 현재인증QA/실제삭제/legacy실제완료미실행이며운영후인증QA는실제검사경로만기록한다.
