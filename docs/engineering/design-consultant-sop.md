# Design Consultant SOP

> 대상: Claude (디자인 시스템 기반 확정 전)
> 관련 에이전트: `.claude/agents/design-consultant.md`

---

## 언제 실행하나

| 조건 | 실행 여부 |
|------|----------|
| 첫 슬라이스(01) merged, 디자인 시스템 미확정 | ✅ 지금이 적기 |
| `docs/design/design-tokens.md`가 이미 채워져 있음 | ❌ 이미 완료됨 |
| 슬라이스 도중 개별 화면 설계 필요 | ❌ `design-generator` 사용 |
| 완성된 설계 리뷰 필요 | ❌ `design-critic` 사용 |
| 모바일 앱답지 않은 UX, screenshot/Figma 기반 authority 판정 필요 | ❌ `product-design-authority` 사용 |

**권장 타이밍**: Slice 02 Stage 2–3 (Codex 백엔드) 진행 중에 병렬로 실행.
Stage 4 (FE 구현) 시작 전에 토큰 확정 완료.

---

## 실행 방법

트리거 예시를 Claude에게 입력:

```
디자인 컨설턴트 실행해줘
```

에이전트가 Phase 0–5를 단계별로 진행하며 각 Phase 후 사용자 승인을 요청한다.

---

## 산출물

| 파일 | 내용 | 작성 주체 |
|------|------|----------|
| `docs/design/design-tokens.md` | 확정 색상·타이포·간격 토큰 | 사용자 또는 Codex가 에이전트 출력 내용 저장 |
| `app/globals.css` `:root` 블록 | 토큰 변수 업데이트 | Codex Stage 4 전에 적용 |
| `app/globals.css` `@theme inline` 블록 | Tailwind v4 매핑 추가 | Codex Stage 4 전에 적용 |

---

## 슬라이스 Design Status 연동

`design-consultant`는 프로젝트 전체 토큰 기반을 **1회** 확정하는 역할이며,
각 슬라이스의 Design Status 전이와는 별개다.

즉, `design-consultant`가 끝났다고 해서
각 화면의 모바일 UX 품질이나 익숙한 앱 패턴 적합성이 자동 보장되지는 않는다.
신규 화면, high-risk UI change, anchor screen 확장은
`docs/engineering/product-design-authority.md` 기준 authority review를 따로 거친다.

**슬라이스별 Design Status 흐름:**

```
temporary (Stage 1 기본값, FE 화면 있는 슬라이스)
  ↓ Stage 4 완료, Codex가 변경
pending-review
  ↓ Stage 5 리뷰 통과, Claude가 변경
confirmed

N/A (BE-only 슬라이스, FE 화면 없음 → Stage 4~6 스킵)
```

- design-consultant 확정 후: 모든 슬라이스 Stage 4·5에서 `docs/design/design-tokens.md` 기준 적용
- 소급 적용: Slice 01 컴포넌트도 확정 토큰 기준으로 Stage 5 진입 시 리뷰

---

## 에이전트 3종 역할 구분

| 에이전트 | 실행 시점 | 목적 |
|---------|----------|------|
| `design-consultant` | 1회, 개발 초기 | 디자인 시스템 토큰 기반 확정 |
| `design-generator` | Stage 1 산출물 | 신규 화면·high-risk UI change용 화면별 와이어프레임 생성 |
| `design-critic` | Stage 1 산출물 | 신규 화면·high-risk UI change용 **설계 문서** 리뷰 |
| `product-design-authority` | Stage 1/4/5 연결 | screenshot/Figma 기반 모바일 UX · 시각 위계 · 익숙한 앱 패턴 authority 리뷰 |
| Stage 5 (Claude 직접) | Stage 4 완료 후 | **구현 코드** 디자인 리뷰 → `confirmed` 판정 |

---

## 주의 사항

- `design-consultant`는 파일을 직접 수정하지 않는다. 출력만 하며, 저장은 사용자 또는 Codex가 한다.
- `docs/design/design-tokens.md`가 없으면 에이전트가 Phase 5에서 전체 내용을 출력한다.
- 재실행이 필요할 때는 `docs/design/design-tokens.md`를 먼저 확인 후 부분 수정 요청.
- low-risk UI change는 `design-generator`와 `design-critic`을 생략할 수 있으며, 이 경우 근거는 workpack README 또는 PR 본문에 남긴다.
- `design-consultant`는 브랜드/토큰 authority이고, `product-design-authority`는 화면 품질 authority다. 둘은 대체 관계가 아니다.
