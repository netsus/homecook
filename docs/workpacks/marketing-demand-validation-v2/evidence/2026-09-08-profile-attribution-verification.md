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

- 실제 운영 배포와 광고 관리자 프로필 링크 교체는 이 구현 검증에 포함하지 않는다.
- 개인정보처리방침의 운영자·보호책임자 공개값은 사용자 입력 후 서버의 공개 환경 설정으로 반영해야 한다.
