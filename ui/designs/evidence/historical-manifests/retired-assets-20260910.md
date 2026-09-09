# Retired Asset Recovery — 2026-09-10

이 문서는 완료된 디자인 캡처와 사용하지 않는 고해상도 원본을 Git 이력에서 복구하기 위한 기록이다.
현재 runtime 자산, 현행 authority screenshot, visual regression baseline을 대체하지 않는다.

- Source commit: `b499f704b046823075f9bf02bdd27359438ec24c`
- Receipt: [파일별 원본 경로·Git blob·SHA-256·bytes·dimensions](./retired-assets-20260910.json)
- Receipt SHA-256: 320b6accc9e3bd8070c0af909ff90988f3e8c05b35985f7467628d90f95475c2
- 대상: 154 PNG / 61,479,005 bytes. Git 이력은 재작성하지 않았다.
- 원본 검증: 삭제 전에 154개 모두 source blob 및 `git archive` 복구 결과와 byte/SHA-256/Git blob 일치를 확인했다.
- 과거 수동 생성·캡처를 현재 화면에서 동일하게 재생성하는 명령은 없으므로 `regeneration_command`는 `null`이다.

## Plush

구형 PNG 66개 / 26,054,425 bytes를 보관했다. 현재 소비자는 `public/assets/plush-v2/`와
`public/assets/ingredients/plush-v2/manifest.json`을 사용한다. 모든 PNG에 동일 이름의 v2 WebP가
존재하지만 픽셀 동일성을 의미하지 않는다. 원본별 현재 파일은 receipt의 `replacement`를 따른다.

## Spoon grade characters

등급 원본 14개와 과거 concept board 2개 / 26,884,516 bytes를 보관했다.
현재 등급 이미지는 `public/assets/growth/grades/`에 유지한다. 원본에서 현재 runtime 파일로 가는
경로는 receipt의 `replacement`를 따른다. concept board는 과거 디자인 방향 증거라 대체 파일이 없다.
`generator_required=false`인 완료 workpack의 원본 pointer만 이 문서로 이관했다.
현재 업적 아이콘 추출 기준 `docs/design/assets/achievement-badge-concepts/achievement-icons-extraction-v3-4.png`는 유지한다.

## Desktop MVP porting

완료된 8개 slice의 PNG 72개 / 8,540,064 bytes를 보관했다. Markdown 22개와 53행 porting ledger,
최종 판정은 기존 경로에 유지한다. receipt의 `path`는 원래 slice와 screenshot 이름을 모두 보존한다.
문서의 `archive:` 표기는 이 receipt에서 찾을 원래 root 상대 경로다.
Slice 5 pre-signoff에 기록된 `mvp-*` 이름은 캡처 전 계획명이며 실제 receipt 이름은 접두사가 없다.
계획명 `mvp-shopping-lists-1280.png`의 별도 원본은 없으며 존재한다고 주장하지 않는다.

후속 opt-in 캡처는 `.artifacts/desktop-mvp-porting/`에 저장한다. 현재 화면을 재캡처한 결과를
이 과거 완료 증거의 원본으로 취급하지 않는다.

## Recovery

원본 commit이 있는 Git clone에서 별도 임시 디렉터리로 복구한다. 현재 checkout을 덮어쓰지 않는다.

```bash
recovery_dir=$(mktemp -d)
git archive b499f704b046823075f9bf02bdd27359438ec24c -- public/assets/plush docs/design/assets/spoon-grade-characters ui/designs/evidence/desktop-mvp-porting | tar -x -C "$recovery_dir"
```

복구 후 각 PNG의 크기와 SHA-256을 receipt와 비교한다. 아래 명령에 위 임시 디렉터리를 전달한다.

```bash
python3 - "$recovery_dir" <<'PYVERIFY'
import hashlib, json, pathlib, sys
receipt = json.loads(pathlib.Path("ui/designs/evidence/historical-manifests/retired-assets-20260910.json").read_text())
for group in receipt["capture_sets"]:
    for item in group["files"]:
        data = (pathlib.Path(sys.argv[1]) / item["path"]).read_bytes()
        assert len(data) == item["bytes"], item["path"]
        assert hashlib.sha256(data).hexdigest() == item["sha256"], item["path"]
print("154 archived PNG files verified")
PYVERIFY
```
