# 최종 화면 승인 원문 이식

외부 final authority 패키지의 지정된 두 subtree429파일, 현재 보고서8개와 원본 README를 byte 그대로 보존했다. 실행 소스 확장자가 남은 재현 파일은 없으며 `.mjs.txt`/`.cjs.txt` 정적 보관본을 유지한다. `.omx/state`를 활성 runtime으로 이식하지 않았다.

교체 전 현재1a519 보고서8개는 `inputs/external-stage5/ui/designs/authority/`의 원본8개와 byte 동일함을 먼저 확인했다. `inputs/1a519-metadata/`는 해당 metadata 비교용 부분 snapshot이며 모든 원문8개가 들어 있다고 가정하지 않는다. 과거 hash 참조는 완전한 external-stage5 보관본으로 연결한다. 기존 pre-link62eff와 Stage5 request_changes/recheck 원문은 별도로 유지한다.

최종 actor·판정·직접/제공 관측 구분은 원문을 따른다. 코드7bfe와 preview62eff는 동결됐고, 새로운 문서 commit을 새 제품 실행으로 표현하지 않는다. 허용된 projection은 디자인confirmed와 authority 체크이며 전체 verification·Stage6·Ready·merge·배포 승인이 아니다.
