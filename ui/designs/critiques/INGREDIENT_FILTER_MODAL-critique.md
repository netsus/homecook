# INGREDIENT_FILTER_MODAL 설계 리뷰

> 검토 대상: `ui/designs/INGREDIENT_FILTER_MODAL.md`
> 기준 문서: 화면정의서 v1.2 §2 / 요구사항 v1.6 §1-1 / 유저Flow맵 v1.2 §① / 디자인 토큰 / workpack `02-discovery-filter`
> 검토 메모: Stage 0 docs-governance 잠금 반영본

---

## 종합 평가

**등급**: 🟢 잠금 완료

**한 줄 요약**: 이전 설계의 비공식 API 의존성과 UX 미결 항목이 문서 잠금으로 정리되었고, 현재 설계는 공식 문서 / workpack 계약과 충돌 없이 구현 가능한 상태다.

---

## 해결된 항목

| 항목 | 잠금 결과 |
| --- | --- |
| `count_only` / `ingredients` 의존성 | 제거 완료. CTA는 `[적용]` 고정 |
| `[레시피 N개 보기]` | 제거 완료 |
| `category=all` 사용 | 제거 완료. `전체`는 UI sentinel, 서버 미전달 |
| 카테고리 + 검색 동시 사용 | 검색어 유지, `q + category` AND 조회로 고정 |
| 체크리스트 vs 칩 충돌 | 체크리스트 의미 우선, pill 시각 스타일만 허용 |
| 터치 타겟 미결 | 각 항목 `min-h: 44px`로 고정 |
| `--panel` / `--surface` 혼선 | 시트는 `--panel`, 선택 가능한 항목은 `--surface`로 구분 |
| PANTRY 경유 플로우 모호성 | 이번 슬라이스 범위에서 제외 |

---

## 체크리스트 결과

- [x] 화면정의서의 핵심 요소(검색 입력, 카테고리 탭, 체크리스트, [적용], [초기화])가 모두 반영됐다
- [x] 공식 API 문서에 없는 파라미터 / 엔드포인트 의존성이 제거됐다
- [x] workpack README의 URL mirror / hard refresh 초기화 정책과 충돌하지 않는다
- [x] 체크리스트 의미와 다중 선택 UX가 함께 유지된다
- [x] Stage 4 구현에 필요한 상태(`loading / empty / error`)가 모두 문서화됐다

---

## 다음 리뷰 포인트

- Stage 4 구현 후 Stage 5에서는 실제 코드가 이 잠금 문서를 그대로 따르는지 확인한다.
- 특히 아래 항목을 우선 본다:
  - `[적용]` / `[초기화]` 레이블 유지
  - `전체` 탭 서버 미전달
  - `q + category` 유지
  - hard refresh 시 초기화
