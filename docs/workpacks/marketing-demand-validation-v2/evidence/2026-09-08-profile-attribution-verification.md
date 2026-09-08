# Instagram·Facebook 프로필 링크 유입 분리

## 결정

- Instagram 기본 프로필 링크는 `/beta`, 명시 링크는 `/beta?profile_source=instagram`이다.
- Facebook 프로필 링크는 `/beta?profile_source=facebook`이다.
- 두 플랫폼 모두 Hero A를 사용한다. 광고 A/B/C 화면 실험과 프로필 플랫폼 유입은 각각 `ad_variant`와 기존 UTM field로 분리한다.
- 새 Hero variant나 DB/API field를 추가하는 대안은 기존 a/b/c 비교 의미와 public contract를 넓히므로 사용하지 않았다.

## 구현

- exact 프로필 링크는 `ad_variant=a` redirect를 하지 않아 사용자가 등록한 링크를 유지한다.
- 첫 view에만 `utm_source=instagram|facebook`, `utm_medium=social_profile`, `utm_campaign=weekly_nutrition_2026`, `utm_content=profile_link`, `ad_variant=a`를 전송한다.
- reset 뒤에도 플랫폼 URL과 attribution을 보존한다. known result 공유 링크는 기존처럼 view를 만들지 않는다.
- 분석 SQL은 `instagram_profile`, `facebook_profile`, `paid_or_other`별 전체 funnel을 집계한다. 이메일·답변 원문 등 PII는 선택하지 않는다.

## 검증

- 변경 전 회귀 테스트에서 bare `/beta`, Instagram/Facebook explicit profile URL, 플랫폼별 view attribution이 실패하는 것을 확인했다.
- focused Vitest 4개 파일 86개 통과.
- 전체 product Vitest 261개 파일, 3,090개 테스트 통과. 환경 의존 14개 파일·177개 테스트는 기존 기준대로 생략.
- 전체 TypeScript, ESLint, source-of-truth sync, `git diff --check` 통과.

## 남은 작업

- 운영 배포 완료: exact SHA `7748382ba8bb3265547a9c45f885cdbf87a75c9a`, build `prelaunch-7748382ba8bb-wGnk0m`.
- 서버 제품 테스트 3,091개 통과 후 production build, 임시 포트·asset 검사와 웹 교체가 성공했다. rollbackAvailable=true, recoveryPending=false, DB 변경 없음.
- 공개 브라우저에서 API 요청을 가로채 운영 DB에 test row를 만들지 않고 Instagram/Facebook URL·Hero A·exact UTM payload를 확인했다. 실제 view API 전송, 운영 시험 session, 이메일 제출은 모두 0이다.
- 광고 관리자에서 각 플랫폼 프로필 링크를 실제 교체하는 작업은 외부 광고 계정 범위로 남는다.
