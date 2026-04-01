# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.

## Happy Path
- [ ] 대표 사용자 흐름이 정상 동작한다
- [ ] 문서 기준 화면 상태와 액션이 맞다
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다
- [ ] 백엔드 계약과 프론트 타입이 일치한다

## State / Policy
- [ ] 상태 전이가 공식 문서와 일치한다
- [ ] read-only 정책이 지켜진다
- [ ] 중복 호출에도 결과가 꼬이지 않는다

## Error / Permission
- [ ] loading 상태가 있다
- [ ] empty 상태가 있다
- [ ] error 상태가 있다
- [ ] unauthorized 처리 흐름이 있다
- [ ] conflict 처리 흐름이 있다
- [ ] 로그인 게이트 후 return-to-action이 맞다

## Data Integrity
- [ ] 타인 리소스를 수정할 수 없다
- [ ] invalid input을 적절히 거부하거나 무시한다
- [ ] 파생 필드와 비정규화 값이 맞다

## Data Setup / Preconditions
- [ ] clean reset 뒤 바로 수동 QA와 exploratory QA를 시작할 수 있다
- [ ] `happy / empty / unauthorized / error / conflict(read-only 포함) / other-user(해당 시)` 상태의 재현 경로가 문서화돼 있다
- [ ] fixture/mock 데이터가 공식 계약 밖의 필드·상태를 만들지 않는다
- [ ] seeded DB 데이터가 합성 데이터이며 reset 가능하다

## Manual QA
1.
2.
3.

## Automation Split

### Vitest
- [ ] 로직 / 유틸 / 상태 전이 / API helper 범위가 분리되어 있다
- [ ] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다

### Playwright
- [ ] 실제 사용자 흐름, 라우팅, 모달, 권한 게이트가 브라우저 테스트로 고정되어 있다
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다

### Manual Only
- [ ] 자동화하지 않은 외부 서비스 또는 운영 의존 시나리오가 별도로 적혀 있다
