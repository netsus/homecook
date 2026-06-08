# RECIPEBOOK_DETAIL 설계 리뷰

> 검토 대상: `ui/designs/RECIPEBOOK_DETAIL.md`
> 관련 슬라이스: `recipebook-diary-port`, `17b-recipebook-detail-remove`
> 기준 문서: 화면정의서 v1.5.12 / 요구사항 v1.7.5 / 유저플로우 v1.3.12 / API v1.2.15 / mobile-ux-rules.md / product-design-authority.md
> 검토일: 2026-06-08
> 검토자: Codex QA

## 종합 평가

**등급**: 조건부 통과 (Yellow-Green)

Yellow-Green은 Stage 1 문서는 통과 가능하지만, Stage 4 구현 시 screenshot evidence와 authority report가 반드시 필요하다는 의미다.

**한 줄 요약**: `RECIPEBOOK_DETAIL`을 diary/book 느낌으로 개선하는 방향은 적합하지만, full reader처럼 상세 내용을 끌어오면 view_count 의미가 깨질 수 있다. 이번 slice는 목록/관리 화면으로 유지하고, desktop split과 mobile card flow까지만 구현해야 한다.

## 크리티컬 이슈

| # | 위치 | 문제 | 필수 조치 |
| --- | --- | --- | --- |
| 1 | data source | 책 안에서 recipe detail preview를 보여주려고 `GET /api/v1/recipes/{id}`를 자동 호출하면 view_count가 증가할 수 있다. | Track 1에서는 금지. full reader는 read-only preview data path contract-evolution 후 별도 slice로 분리. |
| 2 | desktop prototype fit | 기존 prototype처럼 한 프레임에 web book과 app preview를 같이 두면 web recipe area가 지나치게 좁아진다. | 실제 서비스 desktop은 shelf/list route와 detail route를 분리하고, detail은 left rail + right recipe area로 구성. |

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | book rail | 목차가 많아질 경우 rail이 실제 목록 탐색보다 장식처럼 보일 수 있다. | rail은 전체/섹션 jump와 책 정보만 담당하고, 핵심 action은 recipe card에도 유지. |
| 2 | mobile cover | 표지/요약이 길어지면 첫 화면에서 레시피 목록이 늦게 보일 수 있다. | mobile cover는 compact summary로 제한하고, 레시피 첫 카드 일부가 빠르게 보이게 한다. |
| 3 | animation | page-turn 효과를 넣으면 조작 비용과 접근성 리스크가 커진다. | Track 1에서는 animation을 쓰더라도 optional micro-interaction으로 제한. |

## 체크리스트 결과

### A. 계약 정합성

- [x] 기존 route `/mypage/recipe-books/{book_id}` 유지
- [x] 기존 list source `GET /api/v1/recipe-books/{book_id}/recipes` 유지
- [x] saved/custom remove, liked unlike 정책 유지
- [x] full reader와 read-only preview endpoint는 scope 밖으로 분리
- [x] 새 API/DB 변경 없음

### B. UX 품질

- [x] desktop wide에서 목차/책 정보와 recipe area를 분리하는 방향은 적절
- [x] mobile에서 desktop split을 강제 축소하지 않는 기준은 적절
- [x] recipe card click과 remove/unlike action 충돌을 blocker로 명시
- [x] 320px overflow와 tap target 기준 명시

### C. 접근성

- [x] rail navigation 의미 분리 필요성이 명시됨
- [x] keyboard/screen reader가 page effect 없이도 탐색 가능해야 한다는 기준 명시
- [x] remove/unlike aria-label 필요성 명시

## Stage 4 Blockers

- [ ] desktop 1440에서 right recipe area가 640px 미만으로 눌린다.
- [ ] mobile 390/320에서 page-level horizontal overflow가 있다.
- [ ] recipe card click과 remove/unlike action이 이벤트 충돌을 만든다.
- [ ] `GET /api/v1/recipes/{id}`가 목록 화면 진입만으로 호출된다.
- [ ] page/book effect 없이는 keyboard navigation이 불가능하다.
- [ ] empty/error/unauthorized 상태에서 복구 action이 사라진다.

## 권장 구현 방향

1. Desktop은 CSS grid로 `minmax(240px, 320px) 1fr` 구조를 기본으로 둔다.
2. Right recipe area에는 최소 폭 guard를 둔다.
3. Mobile은 cover summary + sticky section tabs + recipe cards 흐름을 사용한다.
4. Card 내부 remove/unlike 버튼은 event propagation을 명확히 차단한다.
5. 테스트에서 recipe detail fetch mock이 호출되지 않았음을 검증한다.

## 판정

Stage 1 문서 기준으로는 통과 가능하다. 다만 Stage 4 구현은 high-risk UI 변경으로 보고, screenshot evidence와 design authority report 없이 confirmed 처리하면 안 된다.
