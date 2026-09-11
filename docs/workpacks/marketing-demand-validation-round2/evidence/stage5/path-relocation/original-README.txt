# Stage5 보관 경로 revision

지정된 세 파일에서 `reproduction/reproduce-lead-edit.cjs`를 `reproduction/reproduce-lead-edit.cjs.txt`로 각각 한 번만 바꿨습니다. 그 밖의 바이트는 모두 동일합니다.

교체 대상:

- `docs/workpacks/marketing-demand-validation-round2/evidence/stage5/stage5-report.md`
- `docs/workpacks/marketing-demand-validation-round2/evidence/stage5/findings.json`
- `docs/workpacks/marketing-demand-validation-round2/evidence/stage5/stage5-result.json`

위 세 파일만 교체하세요. 기존 `r2-stage5/handoff` 원본은 동결 상태로 보존했습니다. FEauthor의 `.cjs.txt`와 원 `.cjs`는 바이트가 같고 SHA256은 `48a580b0ac1e6a4fa99eeab1b66a111d10e732b619ec3a843c1541f2f16fe0ed`입니다.

재현할 때는 보관된 `.cjs.txt`를 임시 폴더로 복사해 원 파일명 `reproduce-lead-edit.cjs`로 복원하면 됩니다. 저장소 안에 실행 스크립트로 되돌리거나 ESLint 규칙을 바꾸지 않습니다. 이번 revision에서는 스크립트를 실행하지 않았습니다.

검토 SHA783ae392와 Stage5 `request_changes`, R2-S5-001은 그대로입니다. 새 제품 수정의 승인이 아닙니다. 다른 네 precheck 스크립트 및 역사적 stacktrace는 건드리지 않았습니다.

[교체 파일별 해시와 보관 매핑](path-relocation-manifest.json).
