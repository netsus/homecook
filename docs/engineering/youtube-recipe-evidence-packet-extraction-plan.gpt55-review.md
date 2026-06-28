검토 결론: **Option C 방향은 맞지만, 현재 계획 그대로는 `fTlTpSJtrEs` 성공 기준을 만족하기 어렵습니다.** 특히 이 샘플은 설명란/자막만으로는 `180도 10분`, `700ml`, 상세 양념 계량 같은 단서가 거의 없어서, “텍스트 EvidencePacket만으로 baseline 이상”이라는 기대는 조정해야 합니다.

**핵심 지적**

1. **Phase 4 acceptance가 현재 source와 맞지 않습니다.**  
   [source.json](/Users/cwj/01_vibe_coding/homecook/notebooks/recipe_loop_data/train/fTlTpSJtrEs/source.json:51)의 자막은 55줄이고 매우 희박합니다. `새우`, `들기름`, `고추장` 같은 일부 단어는 있지만, 계획에 적은 `에어프라이어 180도 10분`, `물 700ml`, 여러 `큰술` 계량은 [golden.json](/Users/cwj/01_vibe_coding/homecook/notebooks/recipe_loop_data/train/fTlTpSJtrEs/golden.json:966)에도 “시각추출 재작성” 맥락으로 기록되어 있습니다.  
   → Phase 4는 “텍스트에 있는 cue만 잡는다”로 낮추고, 전체 계량/단계 회복은 Phase 6 이후 acceptance로 옮기는 게 맞습니다.

2. **conditional vision은 현재 `llm.generate` 인터페이스로는 packet별 제어가 안 됩니다.**  
   지금 [extract.mjs](/Users/cwj/01_vibe_coding/homecook/lib/server/recipe-extraction-lab/extract.mjs:920)은 단일 prompt를 만들고, [videoUrl](/Users/cwj/01_vibe_coding/homecook/lib/server/recipe-extraction-lab/extract.mjs:930)를 한 번에 넘깁니다. 이 상태에서 Gemini에 영상을 주면 모델이 packet 밖 장면도 볼 수 있어 “packet-scoped”가 약해집니다.  
   → 기본 packet prompt는 `videoUrl: null`로 text-only 실행하고, vision은 별도 augmentation artifact로 `visualFrameCues`에 넣은 뒤 다시 정규화해야 합니다.

3. **기존 코드와 중복될 위험이 큽니다.**  
   `codex-vision-keyframes-client.mjs`에는 이미 후보 분리, bundle 연결, source cue packet, evidence ledger가 있습니다. 예: [candidate graph](/Users/cwj/01_vibe_coding/homecook/scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs:363), [source cue packet](/Users/cwj/01_vibe_coding/homecook/scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs:1256), [evidence ledger](/Users/cwj/01_vibe_coding/homecook/scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs:1553).  
   → 새 모듈을 만들되, 알고리즘은 이쪽에서 검증된 규칙을 옮기거나 공통 순수 함수로 분리하세요. `lib/server/...`가 `scripts/...`를 직접 import하는 구조는 피하는 편이 낫습니다.

4. **후처리 순서가 text precedence와 충돌할 수 있습니다.**  
   현재는 source amount hydration 후에 `recoverLowTailVisualDefaults()`가 실행됩니다: [extract.mjs](/Users/cwj/01_vibe_coding/homecook/lib/server/recipe-extraction-lab/extract.mjs:944). 이 함수는 케이스별 visual default를 강하게 덮어쓸 수 있어서, 새 정책인 “텍스트 명시 > visual-estimate”와 충돌할 수 있습니다.  
   → packet 모드에서는 기존 visual recovery를 끄거나, explicit text cue가 있으면 절대 덮어쓰지 않는 guard를 먼저 넣어야 합니다.

**권장 수정안**

Option C를 유지하되 순서를 이렇게 바꾸는 것을 추천합니다.

1. `source-evidence.mjs` + `candidate-packets.mjs`를 먼저 만들고, LLM 호출 없이 `evidence-packets.json` artifact를 항상 저장합니다.
2. Phase 4 acceptance는 deterministic cue만 검증합니다. `fTlTpSJtrEs`의 상세 계량까지 요구하지 않습니다.
3. packet prompt는 text-only로 먼저 실행합니다.
4. packet confidence가 낮거나 source cue가 부족하면 vision artifact를 별도 생성해 `visualFrameCues`로만 주입합니다.
5. 기존 후처리는 packet mode와 legacy mode를 분기해서, legacy visual defaults가 packet evidence를 덮지 않게 합니다.

**판정**

계획은 방향성이 좋고 production 분리도 안전합니다. 다만 현재 draft는 “텍스트 evidence-first”와 “`fTlTpSJtrEs` baseline 이상” 사이에 간극이 있습니다. 이 간극은 Phase 6을 더 이른 설계 축으로 올리고, Phase 4의 acceptance를 현실화하면 해결됩니다.

코드 변경은 하지 않았고, 읽기 기반 리뷰만 수행했습니다.