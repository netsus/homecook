# 무먹 주간 영양 광고 연계 수요검증 랜딩 계획

- 상태: Stage 1 contract-evolution approved — independent Codex internal 1.5 Findings 0
- 기준 계획: `.omx/plans/mumeok-weekly-nutrition-ad-landing.md`
- 범위: 랜딩, 퀴즈, 결과 공개, 이메일 베타 신청, 후속 질문까지의 검증 설계만 다룬다.

## 1. 한 줄 목표

광고 메시지와 동일한 문제 인식으로 시작해, 5문항 퀴즈와 결과 공개를 거쳐 실제 사용 의향과 베타 이메일을 분리 측정한다.

## 2. 고정 퍼널

`hero → quiz → result → concept → intent → email → followup → done`

고정 원칙:

- 광고와 Hero의 핵심 메시지는 같다.
- 결과는 이메일 전에 공개한다.
- 해결 아이디어는 "이렇게 바뀐다면 어떨까요?"라는 중립 콘셉트로만 보여준다.
- 이메일은 베타 초대 목적만 받는다.
- 후속 질문은 이메일 제출 뒤에만 노출한다.

## 3. 단일 데이터·API 계약

이 단계에서는 다음 두 개만 추가한다.

- `public.marketing_validation_sessions`
- `POST /api/v1/marketing/validation`

금지 사항:

- 관리자 대시보드
- 로그인
- 가격표
- 후기
- 장문 FAQ
- 외부 분석 SDK
- 다중 이벤트 테이블

## 4. 운영·보안 계약

세션은 서버가 발급한다.

- cookie: `mumeok_validation_session`
- scope: `Path=/api/v1/marketing/validation`
- policy: `HttpOnly`, `SameSite=Lax`
- HTTPS preview/staging/production에서는 `Secure=true`
- local HTTP에서만 `Secure=false`

검증은 fail-closed다.

- `MARKETING_LEAD_PROTECTION_READY=1`
- Turnstile secret
- allowlisted production hostname
- request Origin이 `ALLOWED_MARKETING_ORIGINS` allowlist와 일치
- 배포 플랫폼 edge rate-limit rule evidence

위 다섯 조건 중 하나라도 빠지면 lead action은 저장하지 않고 거부한다.

## 5. target_qualified 판정

`target_qualified`는 서버와 분석 SQL이 같은 pure rule을 사용한다.

판정은 다음 조건을 모두 만족해야 한다.

- Q1이 "해보려 했지만 시작하지 못함", "시작했지만 중단함", "가끔 기록 중" 중 하나다.
- Q2가 `2~3일` 또는 `4~7일`이다.
- Q4가 "특별히 불편하지 않음"이 아니다.
- Q5가 "현재 방식으로 충분함"이 아니다.

## 6. 기록 원칙

- quiz step과 선택 답변은 sessionStorage에만 임시 저장한다.
- 브라우저 URL에 답변, 결과, 이메일을 넣지 않는다.
- stage action은 순서대로 전송한다.
- non-lead action 실패는 작은 순차 재시도로만 복구한다.
- lead 제출 실패는 명시적 error로 처리한다.
- 동일 session lead 재시도는 generic success로 끝낸다.

## 7. 배포 의존성

아래는 구현 전에 먼저 확인해야 하는 운영 의존성이다.

- canonical `/privacy` 반영
- 실제 operator privacy data 제공
- Turnstile site key/secret 확인
- allowlisted production hostname과 `ALLOWED_MARKETING_ORIGINS` 확인
- edge rate limit rule과 evidence 캡처 확인

이 문서는 위 의존성이 충족되기 전까지 launch 가능성을 주장하지 않는다.
