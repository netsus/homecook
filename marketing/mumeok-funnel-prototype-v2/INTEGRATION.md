# 무먹 광고 퍼널 프런트 통합 인수인계

- 상태: 검증된 standalone 프런트 프로토타입
- 전달 브랜치: `feature/demand-validation-funnel-integration`
- 대상 운영 저장소: `netsus/homecook`
- 운영 대상 아키텍처: Next.js App Router + 내부 Route Handler + Supabase
- 주의: 이 브랜치는 운영 DB/API 연결이나 배포를 수행하지 않는다.

## 1. 이 폴더의 역할

이 폴더는 광고 A/B/C/D에서 시작해 4문항 진단, 결과 유형, 5단계 체험, 주간 식단, 완제품 기록, 베타 이메일 신청으로 이어지는 프런트 기준 구현이다.

독립 실행과 디자인 검증을 위해 Vite 모바일 런타임을 포함하지만, 운영 Next.js 랜딩에 통합할 때는 iPhone/Pixel 프레임과 기기 선택기를 그대로 배포하지 않는다.

상위 Next.js 저장소의 PostCSS 설정이 중첩 Vite 앱으로 전파되지 않도록 이 폴더는 빈 로컬 `postcss.config.mjs`를 소유한다.

운영 이식의 주 소스는 다음이다.

- `src/Prototype.tsx`: 화면, 상태, 카피, 데모 데이터
- `src/prototype.css`: 랜딩 전용 시각 규칙과 모션
- `public/assets/funnel/`: Hero, 캐릭터, 음식, 제품, 브랜드, 공유 카드
- `tests/funnel.spec.ts`: 현재 사용자 흐름의 회귀 계약
- `docs/product-decisions.md`: 사용자 확정 결정
- `docs/test-spec.md`: 세부 테스트 기준

`src/mobile/`, iPhone/Pixel 자산, `src/styles.css`는 standalone 디자인 검증용 런타임이다. 운영 페이지에서는 현재 `homecook`의 Next.js shell, 공용 컴포넌트, 접근성·모션 정책으로 교체한다.

## 2. 독립 실행

```bash
cd marketing/mumeok-funnel-prototype-v2
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

광고별 진입:

```text
/?ad_variant=a
/?ad_variant=b
/?ad_variant=c
/?ad_variant=d
```

기존 Instagram URL과의 호환 진입:

```text
?utm_content=hook_reentry
?utm_content=hook_cooked_weight
?utm_content=hook_calorie_quiz
?utm_content=hook_workaround
```

## 3. 현재 검증 상태

- Playwright: 22개 통과
- Sites worker: 4개 통과
- 보호 모바일 런타임: 28개 통과
- 프로덕션 빌드: 통과
- 디자인 QA: 94/100, `final result: passed`
- 브라우저 콘솔 오류: 0건
- 현재 핵심 흐름의 외부 네트워크 요청: 0건

렌더링 근거는 `evidence/design-qa/final/`에 있다.

## 4. 운영 통합 전 반드시 잠글 계약

기존 저장소의 마케팅 문서는 5문항·이전 결과 유형을 전제로 한 부분이 있고, 이 프런트는 사용자가 최종 확정한 4문항·4결과를 사용한다.

현재 프런트 기준:

| 구분 | 값 |
|---|---|
| 질문 | `q1`, `q2`, `q3`, `q4` |
| 결과 | `homecook-passer`, `eyeballing-master`, `ingredient-tracker`, `pro-measurer` |
| Hero | `a`, `b`, `c`, `d`, `default` |
| 집밥 합계 | `1,607 kcal / 탄177g / 단111g / 지60g` |
| 완제품 반영 합계 | `1,712 kcal / 탄184g / 단131g / 지61g` |

CWJ MacBook의 실제 DB enum, 이벤트 허용값, Route Handler request/response와 대조한 뒤 아래 중 하나를 먼저 선택해야 한다.

1. 운영 계약을 현재 4문항 프런트로 변경한다.
2. 프런트를 운영 DB의 기존 계약으로 되돌린다.
3. API에서 명시적인 버전별 매핑 계층을 둔다.

공식 요구사항·화면·Flow·DB·API 계약이 바뀌면 `contract-evolution` 문서 PR과 관련 workpack Stage 1이 구현보다 먼저다. 이 전달 브랜치에서는 공식 계약을 임의 변경하지 않는다.

## 5. 권장 Next.js 구조

실제 경로명은 기존 운영 시스템 기준으로 결정한다. 아래 이름은 책임 분리 예시이며 새 public endpoint 제안이 아니다.

```text
app/(public)/<landing-route>/page.tsx
components/marketing/funnel/FunnelClient.tsx
components/marketing/funnel/screens/*
lib/marketing/funnel/backend-adapter.ts
public/marketing/funnel/*
```

`FunnelClient`는 화면 상태만 담당하고, DB·분석 연결은 adapter 경계로 분리한다.

```text
Funnel UI
  -> existing Next.js Route Handler
    -> validation / idempotency / consent checks
      -> local-only Supabase authority
```

브라우저에서 Supabase service-role key를 사용하거나 DB table을 직접 쓰지 않는다.

## 6. 이벤트 연결 체크리스트

실제 운영 이벤트 이름이 현재 DB와 일치하는지 먼저 확인한다.

- 랜딩 노출과 Hero CTA
- 질문별 답변과 퀴즈 완료
- 결과 유형 노출과 공유
- 데모 시작·레시피 반영·재료 변경
- 완성 중량·섭취량·영양 결과
- 집밥·완제품 식단 반영
- 베타 폼 노출·제출 시도·성공·실패

UTM과 `ad_variant`는 이메일 원문과 분리한다. 이메일을 분석 이벤트, URL, 로그에 복제하지 않는다.

## 7. 베타 신청 연결 체크리스트

- 실제 API의 이메일 중복 정책 확인
- 제출 멱등키 확인
- `consent_version`, 동의 시각, 보유 기간 확인
- 행동 세션과 이메일의 분리 연결키 확인
- 오류 response wrapper와 안전한 오류 코드 확인
- 같은 버튼의 연속 탭이 한 번만 저장되는지 확인
- 성공 응답 뒤에만 완료 화면을 표시

## 8. 공개 자산 주의

- 실제 YouTube 레시피 썸네일은 데모 예시로 포함됐다. 공개 광고·랜딩 사용 전 채널/권리 정책을 다시 확인한다.
- 제품 이미지는 `제품 예시`로 표시하며 제휴로 오해시키지 않는다.
- 원본 대형 작업 보드, 임시 생성본, 로컬 상태, 빌드 결과는 이 공개 브랜치에서 제외했다.

## 9. CWJ MacBook 권장 실행 순서

1. 이 브랜치를 fetch하고 standalone 프로토타입을 실행한다.
2. 현재 운영 DB/API/동의 버전과 4문항 계약의 차이를 문서화한다.
3. 계약 변경이 필요하면 fresh Stage 1 문서 작업으로 handoff한다.
4. 승인·merge된 계약과 workpack을 기준으로 Next.js 프런트 Stage를 시작한다.
5. 이벤트와 베타 신청 adapter를 연결한다.
6. Vitest, Playwright, 개인정보·중복 제출 검증을 수행한다.
7. 이 브랜치를 직접 production release로 승격하지 않는다.
