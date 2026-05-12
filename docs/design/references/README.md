# Design References

이 폴더는 Holicook(homecook) 디자인 작업에 참고하는 외부 디자인 시스템 reference의 모음입니다.

## 정책 한 줄

**`ohou`가 단일 base이고, `notion`과 `airbnb`는 `borrow-map.md`에 정의된 범위에서만 패턴 차용** — 그 외 영역에서 가져오기 금지.

## 파일

| 경로 | 역할 | 비고 |
|---|---|---|
| `ohou/DESIGN.md` | **Primary base** (오늘의집 톤) | 수동 정리본. 모든 default 토큰의 출처 |
| `ohou/DESIGN.md.original.md` | 자동 추출 원본 | 참고용, 메인 reference 아님 |
| `notion/DESIGN.md` | Borrow source | 긴 글 hierarchy / 워크스페이스 톤 |
| `airbnb/DESIGN.md` | Borrow source | 사진 디스커버리 / 카드 hover 인터랙션 |
| `borrow-map.md` | **차용 규칙 매트릭스** | 어디서 무엇을 빌릴지, 무엇을 빌리지 않을지 |

## AI agent에게 reference를 줄 때

1. 항상 `ohou/DESIGN.md`를 primary로 명시
2. `borrow-map.md`를 함께 보여주고 "반드시 준수"라고 lock
3. `notion`/`airbnb`는 **패턴 차용 용도**라고 명시 — 토큰을 가져오라는 의미가 아님

## 출처

- ohou: 직접 작성 (Chrome 익스텐션 자동 추출 → 9섹션 수동 정리)
- notion: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
- airbnb: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)

업스트림에 OmD v0.1 Philosophy Layer(섹션 10~15)가 추가된 버전이 있습니다 — netsus/oh-my-design 참고.
