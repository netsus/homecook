# Acceptance Checklist

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

## Manual QA
1.
2.
3.
