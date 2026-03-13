# Security, Performance, Design Review

## Security Reviewer

주요 체크 포인트:

- 인증/인가 누락
- 입력 검증 부족
- XSS, CSRF, SSRF 가능성
- 비밀정보 또는 토큰 노출
- 사용자 간 리소스 경계 위반
- dependency risk

PR에는 보안 영향이 없더라도 근거를 간단히 남긴다.

## Performance Reviewer

주요 체크 포인트:

- 불필요한 client component 확장
- 중복 fetch 또는 비효율적 렌더링
- bundle 증가 가능성
- 이미지/스크립트 최적화 누락
- 서버와 클라이언트 경계 혼선

UI나 데이터 fetching이 바뀌면 Lighthouse 또는 수동 성능 검토 근거를 남긴다.

## Design and System Reviewer

주요 체크 포인트:

- 공식 문서와 실제 화면의 정합성
- spacing, typography, hierarchy 일관성
- loading, empty, error, read-only 상태 제공
- 기본 접근성 준수

wireframe은 참고 자료이며, 공식 문서가 충돌 시 우선한다.
