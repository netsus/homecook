# PLANNER_WEEK 설계 리뷰

> 검토 대상: `ui/designs/PLANNER_WEEK.md`
> 기준 문서: 화면정의서 v1.2.3 §5 / 요구사항기준선 v1.6.3 §1-4 / API v1.2.2 §3 / `05-planner-week-core` accepted contract / AGENTS.md
> 검토일: 2026-04-13
> 검토자: design-critic

---

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: `PLANNER_WEEK`는 day-card + 4끼 고정 슬롯 baseline을 기준으로 slice06이 기대는 anchor 화면으로 쓸 수 있다. 다만 planner add 이후의 5-column 밀도, 작은 모바일 폭, range bar proximity는 Stage 4 authority evidence에서 다시 잠가야 한다.

---

## 크리티컬 이슈

없음.

---

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | 5-column 밀도 | slice06 이후 5-column 상태에서 slot 텍스트와 상태 메타가 급격히 빽빽해질 수 있다. | Stage 4 authority evidence에 5-column mobile/default+narrow 캡처를 포함한다. |
| 2 | range bar proximity | 주간 범위 바와 첫 day card 사이가 벌어지면 planner add 결과 확인 UX가 느려진다. | first viewport에서 range bar 바로 아래 첫 day card가 읽히도록 spacing을 유지한다. |
| 3 | 상태 뱃지 | `registered` / `shopping_done` / `cook_done`의 의미가 처음 보는 사용자에게는 낯설 수 있다. | badge 텍스트를 유지하고 색상만으로 구분하지 않는다. serving/status chip 분리 시에도 텍스트 의미를 유지한다. |
| 4 | 타이포 과밀/과대비 | HOME에서 PLANNER로 이동할 때 제목과 날짜 타이포가 갑자기 커 보이면 화면이 무겁게 느껴질 수 있다. | headline, range title, 날짜 라벨을 한 단계 절제해 홈과 스케일 격차를 줄인다. |

---

## 체크리스트 결과

- [x] `PLANNER_WEEK` 화면 범위만 다룬다
- [x] 상단 CTA 3개가 노출된다
- [x] 같은 날짜의 4끼가 같은 day card 안에서 읽힌다
- [x] planner add 이후에도 기존 planner mental model을 유지한다
- [x] 로그인 게이트가 planner 탭 진입 기준으로 명시된다
- [x] loading / empty / error / unauthorized 상태가 포함된다
- [x] unauthorized / loading 상태가 shared state shell 기준과 충돌하지 않는다
- [x] small mobile / authority evidence 보강 계획이 문서에 있다

---

## 결론

Stage 1 산출물로 사용 가능하다. 구현 전 blocking issue는 없고, 위 마이너 이슈 3건은 slice06 Stage 4 authority precheck / public review에서 함께 잠그면 충분하다.
