import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SINGLE_RECIPE_OUTPUT_SCHEMA } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/codex-vision-keyframes-client.mjs';
import { buildSinglePassEvidenceLedger, createSinglePassVisionClient } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs';
import { validateSourceAnchoredResult, literalIngredientMentionSafe } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs';
import { snapshotVideo } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/snapshot-video.mjs';
import { authoredLedger, assessTextCoverage, mergeTextAndVision, verifiedSteps, acceptedGroundingIndexes, stepConflictsWithLockedQuantities } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/text-first-source-routing.mjs';

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const collection = { description: { status: 'present', reason: null }, authorComments: { status: 'empty', reason: null } };
const complete = '[SOURCE: description]\n[재료]\n양파 1개\n물 70ml\n[만드는 법]\n양파를 썰어 물에 넣고 끓인다.';
function proposal(source: string, { steps = true, quantities = true, ingredientsComplete = true } = {}) {
  const ledger = buildSinglePassEvidenceLedger({ sourceText: source, sourceAnchored: true });
  const rows = ['양파', '물'].map((name, index) => {
    const entry = ledger.find((item: { text: string }) => item.text.startsWith(name) && !item.text.includes('끓'));
    return { sourceName: name, name, amount: quantities ? index ? '70' : '1' : null, unit: quantities ? index ? 'ml' : '개' : null,
      quantityState: quantities ? 'explicit' : 'unknown', optional: false, evidence: [{ id: entry.id, quote: entry.text }] };
  });
  const action = ledger.find((item: { text: string }) => item.text.includes('끓인다'));
  const raw = { recipes: [{ title: '양파 요리', ingredients: rows, steps: steps && action ? [action.text] : [],
    stepEvidence: steps && action ? [{ stepIndex: 0, evidence: [{ id: action.id, quote: action.text }] }] : [], ingredientsComplete, stepsComplete: steps }] };
  return { ledger, raw };
}
async function clientRun(sourceText: string, raw: object, sourceCollection: { description: { status: string; reason: string|null }; authorComments: { status: string; reason: string|null } } = collection, visionRaw?: object, cleanup?: () => Promise<void>, groundingRaw?: object, captionSourceText?: string) {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'text-first-test-')); directories.push(cacheDir);
  const extractFrames = vi.fn(async () => ({ frames: [{ path: '/tmp/only-test-frame.jpg', timestampSec: 1 }], extractionStats: { duration_sec: 10 } }));
  const prepareVision = vi.fn(async () => ({ cleanup, captionSourceText }));
  const codexExec = vi.fn().mockResolvedValueOnce(JSON.stringify(raw));
  if (visionRaw) codexExec.mockResolvedValueOnce(JSON.stringify(visionRaw));
  if (groundingRaw) codexExec.mockResolvedValueOnce(JSON.stringify(groundingRaw));
  const client = createSinglePassVisionClient({ analysisMode: 'source-anchored', textFirst: true, singleRecipeOnly: true,
    model: 'gpt-5.6-luna', codexEffort: 'low', keyframeTotalLimit: 8, screenOcrMode: 'off', cacheDir,
    codexExec, extractFrames, prepareVision }, { baseSchema: SINGLE_RECIPE_OUTPUT_SCHEMA });
  const result = await client.generate({ prompt: '', cacheText: sourceText, videoTitle: '양파 요리',
    videoUrl: 'https://www.youtube.com/watch?v=3h4nSEOw7_4', sourceCollection });
  return { result, codexExec, extractFrames, prepareVision, cacheDir };
}

describe('authored text first and bounded vision completion', () => {
  it('skips all media, OCR and vision calls when text inventory and steps are complete', async () => {
    const { raw } = proposal(complete);
    const { result, codexExec, extractFrames, prepareVision } = await clientRun(complete, raw);
    expect(result.meta).toMatchObject({ modelCallCount: 1, usedVisual: false, frameCount: 0, textFirst: { route: 'text-only' } });
    expect(codexExec.mock.calls[0][0].images).toEqual([]);
    expect(extractFrames).not.toHaveBeenCalled(); expect(prepareVision).not.toHaveBeenCalled();
    expect(result.json.recipes[0].stepEvidence).toHaveLength(1);
  });
  it('routes missing quantities separately from existing complete steps', () => {
    const source = complete.replace('양파 1개', '양파').replace('물 70ml', '물');
    const { ledger, raw } = proposal(source, { quantities: false });
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(assessTextCoverage(raw, checked, ledger, collection)).toMatchObject({ route: 'quantities', needs: { ingredients: false, quantities: true, steps: false } });
  });
  it('routes absent steps without allowing existing authored quantities to change', async () => {
    const source = complete.split('[만드는 법]')[0]; const { raw } = proposal(source, { steps: false });
    const vision = structuredClone(raw); vision.recipes[0].ingredients[0].amount = '900';
    const { result } = await clientRun(source, raw, collection, vision);
    expect(result.meta).toMatchObject({ textFirst: { route: 'steps' } });
    expect(result.json.recipes[0].ingredients[0]).toMatchObject({ amount: '1', unit: '개' });
  });
  it('holds a caption step that conflicts with the locked authored quantity', async () => {
    const source = complete.split('[만드는 법]')[0]; const { raw } = proposal(source, { steps: false });
    expect(stepConflictsWithLockedQuantities('양파 2개를 넣는다.', { ingredients: [{ originalName: '양파', amount: '1', unit: '개', quantityState: 'explicit' }] })).toBe(true);
    const vision = structuredClone(raw);
    const caption = '[SOURCE: transcript(ko)]\n[00:01.000] 양파 2개를 넣는다.';
    const ledger = buildSinglePassEvidenceLedger({ sourceText: source+'\n\n'+caption, sourceAnchored: true });
    const anchor = ledger.find((entry: {text: string}) => entry.text.includes('2개를'));
    vision.recipes[0].steps = ['양파 2개를 넣는다.']; vision.recipes[0].stepsComplete = true;
    vision.recipes[0].stepEvidence = [{ stepIndex: 0, evidence: [{ id: anchor.id, quote: '양파 2개를 넣는다.' }] }];
    const { result } = await clientRun(source, raw, collection, vision, undefined, undefined, caption);
    expect(result.json.recipes[0].ingredients[0].amount).toBe('1');
    expect(result.json.recipes[0].steps).toEqual([]);
    expect(result.meta).toMatchObject({ textFirst: { reviewRequired: true } });
  });
  it('checks locked quantities by use role and numeric equivalence', () => {
    const locked = { ingredients: [
      { originalName: '미림', amount: '3', unit: '스푼', quantityState: 'explicit', groupLabel: '세척' },
      { originalName: '미림', amount: '4', unit: '스푼', quantityState: 'explicit', groupLabel: '양념' },
    ] };
    expect(stepConflictsWithLockedQuantities('세척용 미림 4스푼을 넣어 씻는다.', locked)).toBe(true);
    expect(stepConflictsWithLockedQuantities('미림 4스푼을 넣는다.', locked)).toBe(true);
    expect(stepConflictsWithLockedQuantities('세척용 미림 3.0스푼을 넣어 씻는다.', locked)).toBe(false);
  });
  it('retains an unknown ingredient with a literal name anchor after quantity refs were removed', () => {
    const checked = { json: { recipes: [{ title: '찜', ingredients: [{ originalName: '물', name: '물', amount: null, unit: null, quantityState: 'unknown', evidenceRefs: [] }] }] } };
    const rawProposal = { recipes: [{ ingredients: [{ sourceName: '물', evidence: [{ id: 'S1', quote: '물이 부족하면 물을 넣어가면서 끓여 줘' }] }] }] };
    const ledger = [{ id: 'S1', kind: 'text', source_method: 'caption', source_provider: 'youtube', text: '물이 부족하면 물을 넣어가면서 끓여 줘' }];
    const merged = mergeTextAndVision(null, checked, { needs: { ingredients: true }, steps: [] }, [], { rawProposal, ledger });
    expect(merged.ingredients).toMatchObject([{ name: '물', amount: null, evidenceRefs: [{ evidence_id: 'S1' }] }]);
  });
  it.each(['콩나물 넣어요', '물엿 넣어요', '물 없이 볶아요', '물은 안 넣습니다', '물 쓰지 않습니다'])('rejects false unknown ingredient anchors: %s', (quote) => {
    expect(literalIngredientMentionSafe({ kind: 'text', text: quote }, quote, '물')).toBe(false);
  });
  it('does not borrow a first same-name raw row for separate uses', () => {
    const row = { originalName: '물', name: '물', amount: null, unit: null, quantityState: 'unknown', evidenceRefs: [] };
    const checked = { json: { recipes: [{ title: '찜', ingredients: [{ ...row, groupLabel: '세척' }, { ...row, groupLabel: '양념' }] }] } };
    const rawProposal = { recipes: [{ ingredients: [{ sourceName: '물', evidence: [{ id: 'S1', quote: '물 넣어요' }] }, { sourceName: '물', evidence: [{ id: 'S2', quote: '물 부어요' }] }] }] };
    const ledger = [{ id: 'S1', kind: 'text', text: '물 넣어요', scopeLabel: '세척' }, { id: 'S2', kind: 'text', text: '물 부어요', scopeLabel: '양념' }];
    const merged = mergeTextAndVision(null, checked, { needs: { ingredients: true }, steps: [] }, [], { rawProposal, ledger });
    expect(merged.ingredients).toEqual([]);
  });
  it('routes both missing ingredient/step evidence to full completion', () => {
    const raw = { recipes: [{ title: '양파 요리', ingredients: [], steps: [], stepEvidence: [], ingredientsComplete: false, stepsComplete: false }] };
    expect(assessTextCoverage(raw, validateSourceAnchoredResult(raw, []), [], { description: { status: 'empty' }, authorComments: { status: 'empty' } })).toMatchObject({ route: 'full', collectionFailed: false });
  });
  it('never calls a collection failure sufficient text even when model flags it complete', async () => {
    const { raw } = proposal(complete);
    const failed = { description: { status: 'failed', reason: 'network' }, authorComments: { status: 'empty', reason: null } };
    const { result, prepareVision } = await clientRun(complete, raw, failed, raw);
    expect(result.meta).toMatchObject({ textFirst: { route: 'full', collectionFailed: true } }); expect(prepareVision).toHaveBeenCalledOnce();
  });
  it('detects a source-list omission even when the model declares completion', () => {
    const { raw, ledger } = proposal(complete); raw.recipes[0].ingredients.pop();
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(assessTextCoverage(raw, checked, ledger, collection)).toMatchObject({ route: 'full', missingSourceIngredients: [{ name: '물' }] });
  });
  it('excludes viewer/unverified comments, advertising and another recipe', () => {
    const ledger = buildSinglePassEvidenceLedger({ sourceAnchored: true,
      sourceText: '[SOURCE: description]\n[재료]\n양파 1개\n[다른 요리]\n설탕 90g\n[광고]\n쿠폰 9개\n[SOURCE: author_comment]\n[재료]\n물 500ml' });
    const text = authoredLedger(ledger, '양파 요리').map((entry: { text: string }) => entry.text).join('\n');
    expect(text).toContain('양파 1개'); expect(text).not.toMatch(/설탕|쿠폰|500ml/u);
  });
  it('rejects unsupported numeric visual estimates during the merge', () => {
    const { raw, ledger } = proposal(complete); const checked = validateSourceAnchoredResult(raw, ledger);
    const visual = structuredClone(checked); const row = visual.json.recipes[0].ingredients[0];
    Object.assign(row, { originalName: '소금', name: '소금', amount: '5', unit: 'g', quantityState: 'estimated', amountBasis: 'visual-estimate', evidenceRefs: [{ source_method: 'visual', source_provider: 'codex-vision' }] });
    const coverage = assessTextCoverage(raw, checked, ledger, collection); coverage.needs.ingredients = true;
    expect(mergeTextAndVision(checked, visual, coverage, []).ingredients.some((item: { name: string }) => item.name === '소금')).toBe(false);
  });
  it.each([['양파를 볶는다.', '고기를 익혀 냉장 보관한다.'], ['양파를 120분 볶는다.', '양파를 20분 볶는다.']])('rejects unsupported step rewrites: %s -> %s', (quote, text) => {
    const ledger = [{ id: 'S1', kind: 'text', source_method: 'caption', text: quote }];
    const raw = { recipes: [{ steps: [text], stepEvidence: [{ stepIndex: 0, evidence: [{ id: 'S1', quote }] }] }] };
    expect(verifiedSteps(raw, ledger)).toEqual([]);
  });
  it('preserves a verified partial text step while adding missing vision steps', () => {
    const { raw, ledger } = proposal(complete); const checked = validateSourceAnchoredResult(raw, ledger);
    const coverage = assessTextCoverage(raw, checked, ledger, collection); coverage.needs.steps = true;
    const merged = mergeTextAndVision(checked, structuredClone(checked), coverage, [{ text: '양파를 볶는다.', evidence: [{ id: 'O1', quote: '양파를 볶는다.', sourceMethod: 'visual' }] }]);
    expect(merged.steps).toContain(complete.split('\n').at(-1)); expect(merged.steps).toContain('양파를 볶는다.');
  });
  it('adds a separately evidenced use of the same ingredient without changing the marinade', () => {
    const text = { json: { recipes: [{ title: '요리', ingredients: [{ name: '미림', originalName: '미림', groupLabel: '양념', amount: '3', unit: '스푼' }], steps: [] }] } };
    const vision = { json: { recipes: [{ title: '요리', ingredients: [{ name: '미림', originalName: '미림', groupLabel: '세척', amount: '30', unit: 'ml', evidenceRefs: [{ source_method: 'caption', evidence_id: 'S1' }] }], steps: [] }] } };
    const merged = mergeTextAndVision(text, vision, { needs: { ingredients: true, quantities: true, steps: true }, steps: [] }, []);
    expect(merged.ingredients.map((row: { amount: string; unit: string }) => [row.amount, row.unit])).toEqual([['3', '스푼'], ['30', 'ml']]);
  });
  it('counts a lower-priority duplicate source ingredient as covered by its authored selection', () => {
    const comment = '[재료]\n양파 2개\n물 70ml';
    const { raw } = proposal(complete);
    const ledger = buildSinglePassEvidenceLedger({ sourceText: complete + '\n[SOURCE: author_comment]\n' + comment, sourceAnchored: true,
      sourceAuthorComments: { videoChannelId: 'creator', comments: [{ text: comment, authorChannelId: 'creator' }] } });
    const checked = validateSourceAnchoredResult(raw, ledger);
    expect(assessTextCoverage(raw, checked, ledger, { ...collection, authorComments: { status: 'present' } })).toMatchObject({ route: 'text-only', missingSourceIngredients: [] });
  });

  it.each(['양파를 얇게 썬다.', '마늘을 다져준다.', '당근을 잘라준다.', '고기를 충분히 익힌다.', '소스를 졸인다.'])('accepts the literal conjugated cooking action: %s', (text) => {
    expect(verifiedSteps({ recipes: [{ steps: [text], stepEvidence: [{ stepIndex: 0, evidence: [{ id: 'S1', quote: text }] }] }] },
      [{ id: 'S1', kind: 'text', source_method: 'description', text }], { textOnly: true })).toHaveLength(1);
  });
  it('never loses the new part of a compound vision step sharing one locked reference', () => {
    const existing = { text: '양파를 썰어 넣는다.', evidence: [{ id: 'S1', quote: '양파를 썰어 넣는다.', sourceMethod: 'description' }] };
    const incoming = { text: '양파를 썰어 넣는다. 고기를 볶는다.', evidence: [...existing.evidence, { id: 'S2', quote: '고기를 볶는다.', sourceMethod: 'caption' }] };
    const checked = { json: { recipes: [{ title: '요리', ingredients: [], steps: [existing.text] }] } };
    const merged = mergeTextAndVision(checked, structuredClone(checked), { needs: { ingredients: false, quantities: false, steps: true }, steps: [existing] }, [incoming]);
    expect(merged.steps).toContain(existing.text); expect(merged.steps.join(' ')).toContain('고기를 볶는다.');
  });
  it('preserves text names, role and optional state when filling a quantity', () => {
    const base = { name: '미림', originalName: '미림', groupLabel: '양념', optional: true, amount: null, unit: null, quantityState: 'unknown', evidenceRefs: [] };
    const incoming = { ...base, name: '맛술', optional: false, amount: '30', unit: 'ml', quantityState: 'explicit', evidenceRefs: [{ source_method: 'caption', evidence_id: 'S1' }] };
    const text = { json: { recipes: [{ title: '요리', ingredients: [base], steps: [] }] } };
    const vision = { json: { recipes: [{ title: '요리', ingredients: [incoming], steps: [] }] } };
    const coverage = { needs: { ingredients: false, quantities: true, steps: false }, steps: [] };
    expect(mergeTextAndVision(text, vision, coverage, []).ingredients[0]).toMatchObject({ name: '미림', groupLabel: '양념', optional: true, amount: '30', unit: 'ml' });
    Object.assign(incoming, { groupLabel: null });
    expect(mergeTextAndVision(text, vision, coverage, []).ingredients[0].amount).toBeNull();
  });
  it.each(['empty', 'comment-failed', 'metadata-failed'])('preserves independent collection outcomes and defers captions: %s', async (mode) => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'text-first-source-')); directories.push(outDir);
    const fetch = vi.fn(async (url: string) => {
      if (mode === 'metadata-failed') throw new Error('STUB_NETWORK_FAILURE');
      if (url.includes('/videos')) return new Response(JSON.stringify({ items: [{ id: '3h4nSEOw7_4', snippet: { title: '양파 요리', description: '', channelId: 'creator' }, contentDetails: { duration: 'PT1M' } }] }), { status: 200 });
      return new Response(JSON.stringify({ items: [] }), { status: mode === 'comment-failed' ? 403 : 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const { source } = await snapshotVideo({ YOUTUBE_API_KEY: 'unit-test-only' }, '3h4nSEOw7_4', path.relative(process.cwd(), outDir), { includeCaptions: false, textFirst: true });
    expect(source.collection.description.status).toBe(mode === 'metadata-failed' ? 'failed' : 'empty');
    expect(source.collection.authorComments.status).toBe(mode === 'empty' ? 'empty' : 'failed');
    expect(source.captions.reason).toBe('deferred_text_first');
    expect(fetch).toHaveBeenCalledTimes(mode === 'metadata-failed' ? 1 : 2);
  });

  it('removes the model request directory even if media cleanup fails', async () => {
    const source = complete.split('[만드는 법]')[0]; const { raw } = proposal(source, { steps: false });
    const { result, cacheDir } = await clientRun(source, raw, collection, raw, async () => { throw new Error('STUB_CLEANUP'); });
    expect(result.meta.cleanupStatus).toBe('failed');
    expect((await readdir(cacheDir)).filter((name) => name.startsWith('.single-pass-'))).toEqual([]);
  });

  it('requires grounding for every nonliteral frame-only step', () => {
    const ledger = [{ id: 'F1', kind: 'frame', source_method: 'visual', framePath: '/tmp/f.jpg', text: '' }];
    const raw = { recipes: [{ steps: ['고기를 냉장 보관한다.'], stepEvidence: [{ stepIndex: 0, evidence: [{ id: 'F1', quote: null }] }] }] };
    expect(verifiedSteps(raw, ledger, { visibleFramePaths: ['/tmp/f.jpg'] })).toEqual([]);
  });
  it.each([
    { decisions: [] },
    { decisions: [{ stepIndex: 0, grounded: true, reason: 'ok' }, { stepIndex: 0, grounded: true, reason: 'duplicate' }] },
    { decisions: [{ stepIndex: 99, grounded: true, reason: 'outside' }] },
    { decisions: [{ stepIndex: 0, grounded: true, reason: '' }] },
  ])('fails closed on a malformed or incomplete grounding verdict: %j', (value) => {
    expect(acceptedGroundingIndexes(value, [0])).toEqual([]);
  });
  it.each([true, false])('uses a separate bounded grounding call before accepting paraphrases: %s', async (grounded) => {
    const source = complete.split('[만드는 법]')[0]; const { raw } = proposal(source, { steps: false });
    const caption = '[SOURCE: transcript(ko)]\n[00:01.000] 양파를 잘라준다.';
    const ledger = buildSinglePassEvidenceLedger({ sourceText: source + '\n' + caption, sourceAnchored: true });
    const entry = ledger.find((value: { source_method: string }) => value.source_method === 'caption');
    const vision = { recipes: [{ title: '양파 요리', ingredients: [], steps: ['양파를 자른다.'],
      stepEvidence: [{ stepIndex: 0, evidence: [{ id: entry.id, quote: entry.text.replace(/^\[[^\]]+\]\s*/u, '') }] }], ingredientsComplete: true, stepsComplete: true }] };
    const { result, codexExec } = await clientRun(source, raw, collection, vision, undefined,
      { decisions: [{ stepIndex: 0, grounded, reason: grounded ? 'same cutting action' : 'unsupported action' }] }, caption);
    expect(codexExec).toHaveBeenCalledTimes(3);
    expect(result.meta).toMatchObject({ modelCallCount: 3, textFirst: { stepGroundingModelCalls: 1 } });
    expect(result.json.recipes[0].steps).toEqual(grounded ? ['양파를 자른다.'] : []);
    expect(result.json.recipes[0].ingredients.map((row: { amount: string }) => row.amount)).toEqual(['1', '70']);
  });
  it('keeps a known source omission unresolved after vision even if the model declares completeness', async () => {
    const source = complete.replace('물 70ml', '물 70ml\n소금 약간'); const { raw } = proposal(source);
    const { result } = await clientRun(source, raw, collection, raw);
    expect(result.meta).toMatchObject({ textFirst: { reviewRequired: true, finalCompleteness: { ingredients: false },
      unresolvedSourceIngredients: [{ name: '소금' }] } });
  });

});
