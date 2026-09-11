# 독립 precheck 원본 이식

검토자 `01a08e8f-6c04-7233-a12c-b256f460e6cb`의 exact `783ae392c648ed43d481e2166c6f42f0cc0a7912` precheck PASS/required0을 원본 그대로 보존했다. 보고서8개와 evidence subtree는 원래 repository 상대경로에, 원본 결과·manifest·시각판정은 이 폴더에 복사했다. `.omx` projection은 보관용 사본이며 활성 실행 상태에 반영하지 않았다. 원본 README는 package 기준 링크를 유지한 `.txt` 사본이다.

`artifact-manifest.json`의 원본 경로는 `import-verification.json`의 mapping으로 찾는다. 1046개 파일의 크기/SHA256, 보고서180개 상대링크, 검토commit의source6개hash를 확인했다. 보고서의 판정·본문·바이너리를 작성자가 수정하지 않았다.

후속 독립 서식 revision을 받아 원본 보고서8개를 `original-authority/`에 byte 그대로 보존하고, 원래 보고서 경로에는 reviewer가 제공한 format-v1을 반영했다. `import-verification.json`의 최초 보고서 해시는 이제 `original-authority/` 사본에 해당한다. [서식 revision](format-v1/FORMAT-REVISION.md)은 원본 package 기준 문서이며 판정·이미지·scope를 바꾸지 않는다.

기본 authority-evidence-presence exit0은 Draft 생략 경로다. 비초안 조건은 최초14오류에서 서식수정 후6오류로 줄었으며, 남은 서술형요구사항6건은 별도 문서 작업 대상이다. 이를 전체 검증기 PASS로 바꾸지 않는다.

완료된 것은 authority_precheck다. 이후 [독립 public Stage5](../../stage5/stage5-report.md)는 R2-S5-001 required1로 request_changes를 판정했다. 작성자 수정 후 같은 독립 검토자의 재검토가 필요하다. final authority·confirmed·accept-r2-authority 전체완료·Ready·merge·배포는 여전히 대기한다.

## 재현 소스 보관 경로

독립 원문 `.cjs` 5개가 전체 lint에서18오류를 발생시켰다. 제품/테스트에서 import·execute하지 않는 외부 검토 소스라서 조정자 승인에 따라 정확한5개만 `.cjs.txt`로 옮겼다. [보관 경로와 동일 해시](archive-relocations.json)를 최초 import mapping에 추가 적용한다. 외부 원본 패키지와 원문bytes/SHA, 검토 판정·관찰 결과는 바꾸지 않았다. lint/validator ignore나 규칙 완화도 추가하지 않았다.

재현이 필요하면 별도 임시 폴더에 보관 파일을 복사하면서 마지막 `.txt`만 제거해 원래 `.cjs` 이름으로 복원한다. source의 검토commit·환경·동작 범위를 먼저 확인하고, 보관 파일 자체를 제품 소스로 실행하지 않는다. Stage5 원문의 직접 재현 링크3곳은 같은 reviewer가 제공한 mechanical-path revision으로 갱신했다. [원문·revision 해시](../../stage5/path-relocation/path-relocation-manifest.json)와 각 원본 `.original.txt`를 함께 보관한다. 이식 전 코드 검사 결과와 원본 이식 뒤의 통합 검사 실패·해결은 별개 이력이며, relocation 뒤 전체 lint exit0을 확인했다.
