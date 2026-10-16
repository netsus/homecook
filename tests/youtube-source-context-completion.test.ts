import { describe, expect, it } from 'vitest';
import { prepareStepGroundingEvidence, normalizeTextFirstSteps, completeRetainedTextQuantities, verifiedSteps, augmentTextFirstOcrCandidates, assessTextCoverage } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/text-first-source-routing.mjs';
import { buildSinglePassEvidenceLedger } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/single-pass-vision.mjs';
import { validateSourceAnchoredResult } from '@/lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs';

describe('bounded original source context completion', () => {
  it('recovers an abstained quantity from a directly named tuple before another ingredient tuple', () => {
    const ledger=buildSinglePassEvidenceLedger({sourceAnchored:true,sourceText:'[SOURCE: transcript(ko)]\n[00:04] 고춧기름 두 숟가락 참깨 세 숟가락'});
    const entry=ledger.find((item:{source_method?:string})=>item.source_method==='caption')!;
    const raw={recipes:[{title:'요리',steps:[],ingredients:[{sourceName:'고춧기름',name:'고춧기름',amount:null,unit:null,quantityState:'unknown',optional:false,
      evidence:[{id:entry.id,quote:'고춧기름 두 숟가락'}]}]}]};
    const checked=validateSourceAnchoredResult(raw,ledger,{preferSpokenQuantities:true});
    expect(checked.json.recipes[0].ingredients[0]).toMatchObject({amount:'2',unit:'숟가락',quantityState:'explicit'});
    const unsafe=structuredClone(ledger);unsafe.find((item:{id:string})=>item.id===entry.id)!.text='고춧기름 두 숟가락 중 반만 사용한다';
    expect(validateSourceAnchoredResult(raw,unsafe,{preferSpokenQuantities:true}).json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('rechecks retained unresolved text quantities against later literal OCR without changing already explicit text', () => {
    const ledger=[{id:'D',kind:'text',source_method:'description',text:'귀리가루 2큰술 40g~',scopeLabel:null},
      {id:'O',kind:'ocr',source_method:'visual',text:'귀리가루 2큰술 40g',timestampSec:5,scopeLabel:null}];
    const raw={recipes:[{title:'요리',steps:[],ingredients:[{sourceName:'귀리가루',name:'귀리가루',amount:'2',unit:'큰술',quantityState:'estimated',optional:false,
      evidence:[{id:'D',quote:'귀리가루 2큰술 40g~'}]}]}]};
    const text=validateSourceAnchoredResult(raw,[ledger[0]],{preferSpokenQuantities:true});
    const incoming=validateSourceAnchoredResult({recipes:[{title:'요리',steps:[],ingredients:[]}]},ledger,{preferSpokenQuantities:true});
    const {checked,count}=completeRetainedTextQuantities(text,incoming,raw,ledger);
    expect(count).toBe(1);expect(checked.json.recipes[0].ingredients[0]).toMatchObject({amount:'40',unit:'g'});
    expect(text.json.recipes[0].ingredients[0].amount).toBeNull();expect(incoming.json.recipes[0].ingredients).toEqual([]);
    text.json.recipes[0].ingredients[0].amount='2';text.json.recipes[0].ingredients[0].quantityState='explicit';
    expect(completeRetainedTextQuantities(text,incoming,raw,ledger).count).toBe(0);
  });
  it('keeps each model cooking sentence attached to its own evidence through normalization', () => {
    const wire={recipes:[{ingredients:[],cookingSteps:[{text:'마지막에 깨를 넣는다',evidence:[{id:'last',quote:'마지막에 깨를 넣는다'}]}]}]};
    const raw=normalizeTextFirstSteps(wire);
    expect(raw.recipes[0].stepEvidence).toEqual([{stepIndex:0,evidence:[{id:'last',quote:'마지막에 깨를 넣는다'}]}]);
    expect(wire.recipes[0].cookingSteps).toHaveLength(1);
    expect(()=>normalizeTextFirstSteps({recipes:[{...wire.recipes[0],steps:['다른 단계']}]})).toThrow('TEXT_FIRST_INVALID_COUPLED_STEPS');
  });
  const ledger = [
    { id: 'S1', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 0, timestampSec: 10, text: '[00:10] 소스를 잘' },
    { id: 'S2', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 1, timestampSec: 12, text: '[00:12] 섞어서 두 시간 재운다' },
    { id: 'S3', kind: 'text', source_method: 'caption', source_block_index: 1, line_index: 2, timestampSec: 14, text: '[00:14] 약불에서 끓인다' },
    { id: 'S4', kind: 'text', source_method: 'caption', source_block_index: 2, line_index: 3, timestampSec: 15, text: '[다른 요리]' },
  ];
  const raw = { recipes: [{ steps: ['소스를 잘 섞어서 2시간 재운다.'], stepEvidence: [{ stepIndex: 0,
    evidence: [{ id: 'S2', quote: '소스를 잘 섞어서 두 시간 재운다' }] }] }] };
  it('repairs a split or rewritten caption citation from original IDs and still requires judgment', () => {
    const original = structuredClone(raw);
    const { proposal, repairs } = prepareStepGroundingEvidence(raw, ledger);
    expect(raw).toEqual(original);
    expect(proposal.recipes[0].stepEvidence[0].evidence).toEqual([
      { id: 'S1', quote: '소스를 잘' }, { id: 'S2', quote: '섞어서 두 시간 재운다' }, { id: 'S3', quote: '약불에서 끓인다' },
    ]);
    expect(repairs).toHaveLength(1);
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true })).toEqual([]);
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true, groundedStepIndexes: [0] })).toHaveLength(1);
  });
  it('does not accept a changed numeric claim or an unseen source ID', () => {
    const proposal = prepareStepGroundingEvidence(raw, ledger).proposal;
    proposal.recipes[0].steps[0] = '소스를 잘 섞어서 20시간 재운다.';
    expect(verifiedSteps(proposal, ledger, { requireGrounding: true, groundedStepIndexes: [0] })).toEqual([]);
    const missing = structuredClone(raw); missing.recipes[0].stepEvidence[0].evidence[0].id = 'missing';
    expect(verifiedSteps(prepareStepGroundingEvidence(missing,ledger).proposal,ledger,{groundedStepIndexes:[0]})).toEqual([]);
  });
  it('keeps original anchors and conditional context when repeated overlays fill the reference budget', () => {
    const source = [
      { id: 'C1', kind: 'text', source_method: 'caption', source_block_index: 0, line_index: 0, timestampSec: 8, text: '홍차와 꿀을 넣고' },
      { id: 'C2', kind: 'text', source_method: 'caption', source_block_index: 0, line_index: 1, timestampSec: 10, text: '이것은 선택인데 레몬을 넣는다' },
      ...Array.from({length: 20},(_,i) => ({ id: 'O'+i, kind: 'ocr', source_method: 'visual', timestampSec: 8+i/20, text: '꿀 1큰술' })),
      { id: 'named', kind: 'ocr', source_method: 'visual', timestampSec: 9, text: '홍차 100ml' },
    ];
    const proposal = { recipes: [{ ingredients: [{sourceName:'홍차'}, {sourceName:'꿀'}], steps: ['홍차와 꿀을 넣는다.'],
      stepEvidence: [{stepIndex:0,evidence:[{id:'C1',quote:'홍차와 꿀을 넣고'}]}] }] };
    const refs = prepareStepGroundingEvidence(proposal,source).proposal.recipes[0].stepEvidence[0].evidence;
    expect(refs.map((ref: {id: string}) => ref.id)).toEqual(['C1','C2','O0','named']);
    expect(proposal.recipes[0].stepEvidence[0].evidence).toHaveLength(1);
  });
  it('does not prioritize a longer ingredient name over the actual step noun', () => {
    const source = [
      { id:'C',kind:'text',source_method:'caption',source_block_index:0,line_index:0,timestampSec:10,text:'두르고 섞는다' },
      ...Array.from({length:15},(_,i) => ({id:'O'+i,kind:'ocr',source_method:'visual',timestampSec:10,text:'고추오일 '+(i+1)+'g'})),
      {id:'actual',kind:'ocr',source_method:'visual',timestampSec:10,text:'오일'},
    ];
    const raw = {recipes:[{ingredients:[{sourceName:'오일'}],steps:['오일을 두른다.'],stepEvidence:[{stepIndex:0,evidence:[{id:'C',quote:'두르고 섞는다'}]}]}]};
    const refs = prepareStepGroundingEvidence(raw,source).proposal.recipes[0].stepEvidence[0].evidence;
    expect(refs.some((ref:{id:string}) => ref.id==='actual')).toBe(true);
    expect(refs).toHaveLength(16);
  });
  it('attaches adjacent action OCR to quantity overlays and recognizes rubbing and resting', () => {
    const source = [
      {id:'I',kind:'ocr',source_method:'visual',timestampSec:20,text:'옥수수가루 2큰술'},
      {id:'A',kind:'ocr',source_method:'visual',timestampSec:21,text:'2분 문질러서 7분 방치'},
    ];
    const raw = {recipes:[{ingredients:[{sourceName:'옥수수가루'}],steps:['2분 문지르고 7분 방치한다.'],
      stepEvidence:[{stepIndex:0,evidence:[{id:'I',quote:'옥수수가루 2큰술'}]}]}]};
    const {proposal} = prepareStepGroundingEvidence(raw,source);
    expect(proposal.recipes[0].stepEvidence[0].evidence.map((ref:{id:string})=>ref.id)).toEqual(['I','A']);
    expect(verifiedSteps(proposal,source,{requireGrounding:true,groundedStepIndexes:[0]})).toHaveLength(1);
  });
  it('can attach only an already submitted nearby image to an OCR action', () => {
    const source = [
      {id:'O',kind:'ocr',source_method:'visual',timestampSec:10,text:'겉면을 굽는다'},
      {id:'visible',kind:'frame',timestampSec:11,framePath:'/tmp/submitted.png'},
      {id:'hidden',kind:'frame',timestampSec:10,framePath:'/tmp/not-submitted.png'},
    ];
    const raw={recipes:[{ingredients:[],steps:['겉면을 굽는다'],stepEvidence:[{stepIndex:0,evidence:[{id:'O',quote:'겉면을 굽는다'}]}]}]};
    const {proposal}=prepareStepGroundingEvidence(raw,source,{visibleFramePaths:['/tmp/submitted.png']});
    expect(proposal.recipes[0].stepEvidence[0].evidence.map((ref:{id:string})=>ref.id)).toEqual(['O','visible']);
    expect(verifiedSteps(proposal,source,{requireGrounding:true,groundedStepIndexes:[0],visibleFramePaths:[]})).toEqual([]);
  });
  it('can use the immediately preceding caption modifier when OCR locates a later noun fragment', () => {
    const source=[
      {id:'C0',kind:'text',source_method:'caption',source_block_index:0,line_index:0,timestampSec:7,text:'미리 손질된'},
      {id:'C1',kind:'text',source_method:'caption',source_block_index:0,line_index:1,timestampSec:9,text:'채소에 양념을 넣고'},
      {id:'O',kind:'ocr',source_method:'visual',timestampSec:10,text:'채소에 양념을 넣고'},
    ];
    const raw={recipes:[{steps:['손질된 채소에 양념을 넣는다'],stepEvidence:[{stepIndex:0,evidence:[{id:'O',quote:'채소에 양념을 넣고'}]}]}]};
    expect(prepareStepGroundingEvidence(raw,source).proposal.recipes[0].stepEvidence[0].evidence.some((ref:{id:string})=>ref.id==='C0')).toBe(true);
  });
  it('preserves already selected OCR images and includes omitted short transition frames within its cap', () => {
    const frames = [0,1,1.5,2,3].map((timestampSec) => ({ path: '/tmp/f'+timestampSec, timestampSec }));
    const result = augmentTextFirstOcrCandidates([frames[0],frames[4]],frames,5);
    expect(result.map((frame) => frame.path)).toEqual(frames.map((frame) => frame.path));
    expect(augmentTextFirstOcrCandidates([frames[0],frames[4]],frames,3)).toHaveLength(3);
    const extractorFrames = frames.map(({ path, timestampSec }) => ({ path, timestamp_sec: timestampSec }));
    expect(augmentTextFirstOcrCandidates([frames[0],frames[4]],extractorFrames,5).map((frame) => frame.path)).toEqual(frames.map((frame) => frame.path));
  });
});

describe('closed source quantities remain independent of model uncertainty', () => {
  function run(source: string, ingredients: object[], ocr: object[] = []) {
    const ledger = buildSinglePassEvidenceLedger({ sourceText: source, sourceAnchored: true });
    ledger.push(...ocr);
    return validateSourceAnchoredResult({ recipes: [{ title: '요리', ingredients, steps: [] }] },ledger,{ preferSpokenQuantities: true });
  }
  const row = (name: string) => ({ sourceName: name, name, amount: null, unit: null, quantityState: 'conflicting', optional: false,
    evidence: [{ id: 'S0001', quote: '된장과 고추장을 반 컵씩 넣어 줘' }] });
  it('recovers each named shared quantity without converting an observed metric alternative', () => {
    const result = run('[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘',[row('된장'),row('고추장')]);
    expect(result.json.recipes[0].ingredients.map((item: {amount: string; unit: string}) => [item.amount,item.unit])).toEqual([['1/2','컵'],['1/2','컵']]);
  });
  it('keeps contradictory caption quantities unresolved', () => {
    const result = run('[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘\n[00:02] 된장과 고추장을 한 컵씩 넣어 줘',[row('된장')]);
    expect(result.json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not override a closed authored quantity with a spoken one', () => {
    const source = '[SOURCE: description]\n[재료]\n된장 20g\n소금 2g\n[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘';
    const result = run(source,[{...row('된장'),evidence:[{id:'S0002',quote:'된장 20g'}]}]);
    expect(result.json.recipes[0].ingredients[0]).toMatchObject({amount:'20',unit:'g'});
  });
  it('joins a missing prepared noun only to a nearby OCR noun with the same explicit count', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 크게 한 숟가락 넣고';
    const ocr = { id: 'O1', kind: 'ocr', source_method: 'visual', source_provider: 'macos-vision-ocr', text: '다진양파 1', timestampSec: 11 };
    const result = run(source,[],[ocr]);
    expect(result.json.recipes[0].ingredients).toMatchObject([{originalName:'다진양파',amount:'1',unit:'숟가락',amountRawText:'크게 한 숟가락'}]);
    expect(run(source,[],[{...ocr,text:'다진양파 2'}]).json.recipes[0].ingredients).toEqual([]);
    expect(run(source,[],[{...ocr,timestampSec:20}]).json.recipes[0].ingredients).toEqual([]);
    expect(run(source.replace('넣고','넣지 마세요'),[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it('refuses competing OCR noun identities for the same missing clause', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고';
    const ocr = { id: 'O1', kind: 'ocr', source_method: 'visual', source_provider: 'macos-vision-ocr', text: '다진양파 1', timestampSec: 11 };
    expect(run(source,[],[ocr,{...ocr,id:'O2',text:'다진생강 1'}]).json.recipes[0].ingredients).toEqual([]);
  });
  it('recovers a literal metric pair without estimating a count or converting units', () => {
    const source = '[SOURCE: description]\n[재료]\n호박 큰거 반개 120g';
    const raw = {sourceName:'호박',name:'호박',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'호박 큰거 반개 120g'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:'120',unit:'g'});
    expect(run(source.replace('120g','120g~'),[raw]).json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not borrow a metric amount from a different use role', () => {
    const source = '[SOURCE: description]\n[소스]\n맛술을 넣는다.\n[양념]\n맛술 40ml';
    const raw = {sourceName:'맛술',name:'맛술',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'맛술을 넣는다.'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:null,groupLabel:'소스'});
  });
  it('retains a written procedure even when the model paraphrases its sentences', () => {
    const source = '[SOURCE: description]\n[재료]\n호박 1개\n[만드는 방법]\n1. 호박을 썰어주세요.\n2. 호박을 볶으면 완성이에요.\n#홍보\n구독해주세요';
    const ledger = buildSinglePassEvidenceLedger({sourceText:source,sourceAnchored:true});
    const raw = {recipes:[{title:'호박요리',ingredients:[{sourceName:'호박',name:'호박',amount:'1',unit:'개',quantityState:'explicit',optional:false,evidence:[{id:'S0002',quote:'호박 1개'}]}],
      steps:['호박을 잘라서 익힌다.'],stepEvidence:[{stepIndex:0,evidence:[{id:'S0004',quote:'1. 호박을 썰어주세요.'}]}],ingredientsComplete:true,stepsComplete:true}]};
    const checked = validateSourceAnchoredResult(raw,ledger);
    const coverage = assessTextCoverage(raw,checked,ledger,{description:{status:'present'},authorComments:{status:'empty'}});
    expect(coverage.stepsComplete).toBe(true);
    expect(coverage.steps.map((step: {text:string}) => step.text)).toEqual(['1. 호박을 썰어주세요.','2. 호박을 볶으면 완성이에요.']);
    const unfinished = ledger.map((entry: {text:string}) => ({...entry,text:entry.text.replace('2. 호박을 볶으면 완성이에요.','다음 편에서 호박을 볶아 완성할 예정입니다.')}));
    expect(assessTextCoverage({...raw,recipes:[{...raw.recipes[0],stepsComplete:false}]},checked,unfinished,
      {description:{status:'present'},authorComments:{status:'empty'}}).stepsComplete).toBe(false);
  });
  it('restores only a literal vague quantity, leaving unspecified use unknown', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 들기름\n[00:12] 조금 넣고 마무리해 줘';
    const raw = {sourceName:'들기름',name:'들기름',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0002',quote:'조금 넣고 마무리해 줘'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0]).toMatchObject({amount:null,unit:null,quantityState:'to_taste',amountRawText:'조금'});
    expect(run(source.replace('조금 ',''),[{...raw,evidence:[{id:'S0002',quote:'넣고 마무리해 줘'}]}]).json.recipes[0].ingredients[0].quantityState).toBe('unknown');
  });
  it('does not borrow a similar ingredient name from a following qualitative clause', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 오일을 두르고\n[00:12] 고추오일 조금 넣어 줘';
    const raw = {sourceName:'오일',name:'오일',amount:null,unit:null,quantityState:'unknown',optional:false,evidence:[{id:'S0001',quote:'오일을 두르고'}]};
    expect(run(source,[raw]).json.recipes[0].ingredients[0].quantityState).toBe('unknown');
  });
  it.each(['다진양파는 넣지 않습니다.', '다진양파 약간', '다진양파는 선택입니다.'])('does not bypass an authored instruction: %s', (instruction) => {
    const source = '[SOURCE: description]\n'+instruction+'\n[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고';
    const ocr = { id:'O1',kind:'ocr',source_method:'visual',source_provider:'macos-vision-ocr',text:'다진양파 1',timestampSec:11 };
    expect(run(source,[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it('refuses a restored noun when another named caption contradicts its quantity', () => {
    const source = '[SOURCE: transcript(ko)]\n[00:10] 다진 을 한 숟가락 넣고\n[00:12] 다진양파 두 숟가락 넣는다';
    const ocr = {id:'O1',kind:'ocr',source_method:'visual',source_provider:'macos-vision-ocr',text:'다진양파 1',timestampSec:11};
    expect(run(source,[],[ocr]).json.recipes[0].ingredients).toEqual([]);
  });
  it.each(['된장은 넣지 않습니다.', '된장 약간'])('does not promote a caption quantity over authored %s', (instruction) => {
    const source = '[SOURCE: description]\n'+instruction+'\n[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘';
    const result = run(source,[row('된장')]);
    expect(result.json.recipes[0].ingredients[0].amount).toBeNull();
  });
  it('does not hide malformed or multi-recipe proposals while selecting spoken quantities', () => {
    const ledger = buildSinglePassEvidenceLedger({ sourceText:'[SOURCE: transcript(ko)]\n[00:01] 된장과 고추장을 반 컵씩 넣어 줘',sourceAnchored:true });
    const recipe = {title:'요리',ingredients:[row('된장')],steps:[]};
    expect(() => validateSourceAnchoredResult({recipes:[recipe,recipe]},ledger,{preferSpokenQuantities:true})).toThrow();
    expect(() => validateSourceAnchoredResult({recipes:[{...recipe,ingredients:[{...row('된장'),evidence:[]}]}]},ledger,{preferSpokenQuantities:true})).toThrow();
  });
});
