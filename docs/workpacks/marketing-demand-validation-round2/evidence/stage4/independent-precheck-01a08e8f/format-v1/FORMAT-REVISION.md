# Evidence 서식 호환 revision

기존783ae392 precheck PASS 원문 패키지를 보존하고8보고서의첫 `> evidence:` 바로아래에검증기가읽는 `> - ` + backtick repo-relative PNG 경로를추가했다. 판정·이미지·근거범위·기존상대Markdown링크및나머지본문은byte동일하다.

실제 strict validator에동일783automation-spec을읽혀수정전14오류→수정후6오류를확인했다. 보고서8개의evidence인식오류는0이고남은6개는변경하지않은automation-spec의서술요구형식이다. 전체strictPASS라고주장하지않는다.

복사대상은8개 `ui/designs/authority/` 보고서다. visual파일은기존최종precheck패키지와동일하므로추가렌더가아니다. canonical automation-spec은수정하지않았고이패키지에덮어쓰기대상으로넣지않았다. `format-validation-input.original-automation-spec.json`은검증재현용사본일뿐repo의automation-spec으로복사하지않는다.

[서식diff및해시](format-revision.json) · [이전검증](format-validation-before.json) · [이후검증](format-validation-after.json).

이서식수정은Stage5의새R2-S5-001 request_changes와별개다. 원본precheck제품검토SHA/범위를현재수정이나다음Stage승인으로자동승격하지않는다.
