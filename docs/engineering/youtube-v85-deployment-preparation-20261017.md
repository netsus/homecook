# v85 운영 전환 준비 — 운영 미반영

완성 무게 후속은 PR1746/웹06a3369f5c5e/build `prelaunch-06a3369f5c5e-EWuEsS`로 반영·Chrome 확인을 완료했다. 이 문서는 별도 v85 후보의 통합·배포 준비이며 운영 worker는 여전히3e58467499c6-v74/gen49다.

## 통합 범위와 검증

masterf511d3f95 위에67e6d0c2b에서 갈라진 선행93de94d97→9ceae22c5→8b67afed9→47d8e67f4 전체를 merge한다. 세 후속 커밋만 가져와 출처 충돌 우선순위를 빠뜨리지 않는다. SOT 상단의 유일한 충돌에서는 기존 무게/접수 복구 기록과 새 로컬 추출기 기록을 모두 보존했다. 원 사용자 checkout과 별도 원 후보 작업 폴더는 수정하지 않았다.

- 관련15파일525 PASS, 프로젝트typecheck, Anti Slop 신규0, diff검사 통과.
- 병합 범위17개TS/MJS ESLint 오류0·기존 경고1. `source-quantity-owner-hints.mjs`의 `_private` 미사용 경고는 기존 master에도 있던 줄이며 평가 번들을 바꾸는 인접 정리를 하지 않았다.
- 저장된 실제 v85 응답3개를 통합된 웹 parser로 다시 읽었다. 정상 수신3/3이며 반환 재료/단계는 낙지18/11, 양파9/5, 소갈비15/12다. 낙지 추가 조건부 대체 재료를 포함한 행 수이며 정답지 재현17/17과 다른 지표다. 추가 모델0이다.
- 번들 manifest SHA256은 평가 후보와 같은 `11290b3c16276664e9a3ecce4711a8493779b96be7c80a8e58e08f82236ca6ed`다. 새 실제 평가·운영 신청은 하지 않았다.

원 후보의 숫자34/34·재료41/41·모호량 포함38/41은 [최종 고정 평가](evidence/youtube-text-first-final-evaluation-20261016.json)의 결과다. 소갈비 오일/후추/물 모호량3건과 낙지 당근 선택 속성 오류를 남긴다. 최신 평가8호출·누적27시도74호출을 추가 호출로 덮지 않았으며 전체P5 통과가 아니다.

## 기존 gen49를 재사용할 수 없는 이유와 정확한 다음 대상

worker credential과 기존 C04/v74 권위는 release SHA·schema·allowed snapshot·generation에 묶여 있다. 새 pipeline에 gen49를 임의 연결하거나 원 영수증/guard를 덮으면 안 된다. 기존 v74 실행 도구도48→49에 고정돼 있어 v85에 실행하지 않는다.

읽기 전용 현재 확인은generation49·만료`2026-10-22T14:27:30Z`, policyVersion3·fingerprintVersion2다. v85 pipeline은 `6dd494410f160937b550bc23fb355d6669b3abe7805c00eabd40fed1e799c618`, 같은policyVersion/options에서 새 snapshot은 `9307203ad29f0048655a62e6d2f430ef977dad75405ce606fbf68319a7a36d51`다.

다음 전환은 새 signing key나 역할/권한 확대 없이 기존 issuer의 동일 worker role/scope/iss/aud에 새 release·snapshot을 결속한generation50이 필요하다. 만료는 기존49의 위 시각으로 제한해 기간을 연장하지 않는다. 등록에는 기존 범위의 manager최대300초가 필요하며 사용 후 소유 파일을 제거한다. **아직50/manager 발급0, DB policy/credential 전환0, 웹/worker 변경0이다.**

먼저 최종 merge SHA로 artifact/descriptor를 봉인하고, 원 C04/v74/V2 복구 영수증을 보존하는49→50 successor·메타데이터 handoff·잠금/CAS·불확실 commit 대조·같은50 forward repair를 준비/검증해야 한다. 일반 배포 guard를 완화하거나 현재 관측을49로 위장하지 않는다.50 등록 후49 즉시 복귀는 허용하지 않는다. 기존42작업·일반자료·DB232·기존writer·C05/R2 OFF·fingerprint2/previousnull은 보존 대상이다.

운영 완료 판정에는 공식 웹/worker의 실제 새 identity·인증·health·같은PID·V2 접수 연결 증거가 필요하다. 기존 v74 신청 성공과 로컬 v85 평가를 합쳐 운영 성공으로 표시하지 않는다. 운영 재평가가 필요하면 대표신청1건의text1+조건부vision1+단계판정1(최대3Luna low) 범위와 실제 호출 수를 별도 기록한다. 이번 준비 단계의 새 모델 호출은0이다.
