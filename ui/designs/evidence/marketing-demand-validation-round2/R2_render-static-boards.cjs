// Repository-owned static design evidence. No React, service, browser, or network.
async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const resolver = createRequire(__filename);
  const root = path.resolve(__dirname, '../../../..');
  const searchPaths = [root, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  try { searchPaths.push(path.dirname(resolver.resolve('next/package.json'))); } catch { /* Optional existing project runtime. */ }
  let sharpEntry;
  try { sharpEntry = process.env.R2_SHARP_MODULE || resolver.resolve('sharp', { paths: searchPaths }); }
  catch { throw new Error('Existing sharp required. Set NODE_PATH to the installed runtime packages or R2_SHARP_MODULE to its entry. No package installation needed.'); }
  const { default: sharp } = await import(pathToFileURL(sharpEntry).href);
  const contractPath = 'docs/marketing-demand-validation-r2-contract.md';
  const contract = fs.readFileSync(path.join(root, contractPath), 'utf8');
  const capture = regex => { const hit = contract.match(regex); if (!hit) throw new Error(`Contract copy missing: ${regex}`); return hit[1]; };
  const provenance = {
    contract: contractPath, version: 'r2.1', pr: 1551,
    merged: '7f00e62c13572b5b2c0d54c997fe628f7a56567e',
    reviewed: '24093c94ebf53676050353088f173ef7f6315445',
    workspace_merge: 'b9601841', source: 'User-provided merged provenance; source header Draft is historical',
    design_status: 'draft', authority: 'pending', evidence_kind: 'static_design_not_runtime'
  };
  const q1Help = capture(/공통 Q1 바로 아래 필수 안내: `([^`]+)`/);
  const consent = capture(/동의 label: `([^`]+)`/);
  const ready = capture(/두 메뉴 모두 `([^`]+)`를 표시/);
  const topicData = {
    recording: { label: '집밥 영양 기록', title: capture(/기록 메뉴 제목은 `([^`]+)`/), desc: capture(/기록 메뉴 제목은 `[^`]+`, 설명은 `([^`]+)`/), exampleTitle: '내 레시피에서 영양 기록까지', exampleDone: '내 레시피에서 먹은 분량의 추정 영양 기록으로 이어지는 예시를 보셨어요.', leadTitle: '집밥 기록, 베타 소식 받기', leadDesc: '내 레시피와 먹은 분량을 잇는 기록 기능을 준비 중이에요.', leadDone: '집밥 기록 기능의 베타 오픈 알림 신청이 접수됐어요.', surveyTitle: '집밥 기록에 대한 의견', surveyDone: '집밥 기록에 대한 의견을 접수했어요.', strip: ['내 레시피 → 먹은 분량', '추정 영양 기록'] },
    homeflow: { label: '집밥 준비 흐름', title: capture(/집밥 흐름 메뉴 제목은 `([^`]+)`/), desc: capture(/집밥 흐름 메뉴 제목은 `[^`]+`, 설명은 `([^`]+)`/), exampleTitle: '계획부터 남은 요리까지', exampleDone: '요리를 계획하고, 집에 있는 재료를 빼고 장보기부터 요리와 남은 요리 관리까지의 예시를 보셨어요.', leadTitle: '집밥 관리, 베타 소식 받기', leadDesc: '계획부터 장보기, 요리와 남은 요리 관리를 준비 중이에요.', leadDone: '집밥 관리 기능의 베타 오픈 알림 신청이 접수됐어요.', surveyTitle: '집밥 관리에 대한 의견', surveyDone: '집밥 준비와 관리에 대한 의견을 접수했어요.', strip: ['계획 → 재료 제외·장보기', '요리 → 남은 요리 관리'] }
  };
  const surveyRows = contract.split('\n').filter(row => /^\| (공통 Q1|recording Q[234]|homeflow Q[234]) \|/.test(row));
  for (const [topic, data] of Object.entries(topicData)) {
    data.caveat = capture(new RegExp(`${topic} Q4 바로 위 필수 안내: \x60([^\x60]+)\x60`));
    data.questions = surveyRows.filter(row => row.startsWith('| 공통') || row.startsWith(`| ${topic}`)).map(row => {
      const parts = row.split('|').map(part => part.trim());
      return { question: parts[2].match(/`([^`]+)`/)[1], options: [...parts[3].matchAll(/`([^`]+)` → `([^`]+)`/g)].map(hit => ({ value: hit[1], label: hit[2] })) };
    });
    if (data.questions.length !== 4) throw new Error('Four canonical questions required');
  }
  const fixture = {
    source: 'ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/src/Prototype.tsx.txt',
    source_symbols: ['ingredients', 'DemoThree', 'DemoFour', 'DemoFive'],
    food: '제육볶음', cooked_g: 1180, portion_g: 320, kcal: 487, carbs_g: 31, protein_g: 39, fat_g: 22,
    note: 'Historical prepared illustration values, not a newly computed nutrition result. Every numeric result is an example estimate. Homeflow categorical arrangement is a design illustration, not a persisted record.'
  };
  const C = { ink: '#212529', muted: '#495057', blue: '#00A1FF', pale: '#EBF8FF', line: '#495057', soft: '#F8F9FA', white: '#FFFFFF' };
  const assetFiles = { logo: 'brand/mumeok-logo-horizontal.png', food: 'food/jeyuk-recipe-clean.webp', scale: 'food/jeyuk-on-scale.webp', mascot: 'characters/beta-success-mascot.webp' };
  const assets = {};
  for (const [key, file] of Object.entries(assetFiles)) assets[key] = 'data:image/png;base64,' + (await sharp(fs.readFileSync(path.join(root, 'public/assets/funnel', file))).png().toBuffer()).toString('base64');
  const order = ['MENU', 'LEAD_DONE', 'EXAMPLE_DONE', 'SURVEY_DONE', 'EXAMPLE', 'SURVEY', 'LEAD', 'RECOVERY'];
  const geometry = [], panels = [];
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const measure = value => [...value].reduce((n, ch) => n + (/[\u0000-\u007f]/.test(ch) ? 0.54 : 1), 0);
  function wrap(value, width, size) {
    const max = width / size, rows = []; let row = '';
    for (const word of value.split(/\s+/)) {
      const candidate = row ? row + ' ' + word : word;
      if (measure(candidate) <= max) { row = candidate; continue; }
      if (row) rows.push(row);
      row = '';
      for (const char of word) {
        if (measure(row + char) > max && row) { rows.push(row); row = ''; }
        row += char;
      }
    }
    if (row) rows.push(row);
    return rows;
  }
  function panel(topic, state, w, variant = 'default', step = 3) {
    const t = topicData[topic], p = w === 320 ? 16 : 20, cw = w - 2 * p, parts = [], visibleCopy = [], controls = [];
    const canonicalId = `R2_${topic.toUpperCase()}_${state}`;
    let y = 116;
    const rect = (x, top, width, height, fill, stroke = 'none', radius = 8) => parts.push(`<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`);
    const line = (text, x, top, size = 16, weight = 400, color = C.ink) => parts.push(`<text x="${x}" y="${top}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`);
    const image = (key, x, top, width, height) => parts.push(`<image href="${assets[key]}" x="${x}" y="${top}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`);
    function para(text, size = 16, leading = 24, weight = 400, color = C.muted, x = p, width = cw) {
      visibleCopy.push(text); const rows = wrap(text, width, size);
      rows.forEach((row, i) => line(row, x, y + i * leading, size, weight, color)); y += rows.length * leading;
    }
    const title = text => { para(text, w === 320 ? 22 : 24, w === 320 ? 30 : 32, 700, C.ink); y += 8; };
    function button(label, kind = 'secondary', height = 48, destination = '') {
      if (variant === 'completed') {
        if (label === '베타 오픈 알림 받기') { label = '알림 접수 확인'; destination = 'LEAD_DONE'; }
        if (label === '의견만 남기기 · 4문항') { label = '의견 접수 확인'; destination = 'SURVEY_DONE'; }
        if (label === '사용 예시 먼저 보기') label = '사용 예시 다시 보기';
      }
      if (kind !== 'text') rect(p, y, cw, height, kind === 'primary' ? C.blue : C.white, kind === 'primary' ? 'none' : C.line);
      parts.push(`<text x="${w / 2}" y="${y + height / 2 + 6}" text-anchor="middle" font-size="16" font-weight="700" fill="${C.ink}"${kind === 'text' ? ' text-decoration="underline"' : ''}>${esc(label)}</text>`);
      const item = { topic, state, canonical_id: canonicalId, variant, step, viewport_width: w, label, kind, destination, x: p, y, width_px: cw, height_px: height };
      geometry.push(item); controls.push(item); visibleCopy.push(`[${label}]`); y += height + 8;
    }
    function box(heading, body) {
      const top = y - 16; const headRows = wrap(heading, cw - 24, 16), bodyRows = body.flatMap(text => wrap(text, cw - 24, 16));
      const h = (headRows.length + bodyRows.length) * 24 + 28;
      rect(p, top, cw, h, C.soft);
      para(heading, 16, 24, 700, C.ink, p + 12, cw - 24); y += 4;
      for (const text of body) para(text, 16, 24, 400, C.muted, p + 12, cw - 24);
      y = top + h + 24;
    }
    image('logo', p, 12, 112, 32);
    if (state !== 'MENU') { line('메뉴로', w - p - 44, 33, 14, 600); const c = { topic, state, canonical_id: canonicalId, variant, step, viewport_width: w, label: '메뉴로', kind: 'text', destination: 'MENU', x: w - p - 44, y: 8, width_px: 44, height_px: 44 }; geometry.push(c); controls.push(c); }
    line('베타 준비 중' + (['MENU', 'EXAMPLE', 'EXAMPLE_DONE'].includes(state) ? ' · 사용 예시' : ''), p, 80, 14, 600);
    if (state === 'MENU') {
      title(t.title); para(t.desc); y += 8;
      rect(p, y, cw, 72, C.soft); image('food', p + 4, y + 4, 76, 64);
      t.strip.forEach((text, i) => line(text, p + 86, y + 28 + i * 22, w === 320 ? 13 : 14, 600)); y += 84;
      button('베타 오픈 알림 받기', 'primary', 52, 'LEAD'); button('사용 예시 먼저 보기', 'secondary', 48, 'EXAMPLE'); button('의견만 남기기 · 4문항', 'text', 44, 'SURVEY');
      y += 12; para(ready, 14, 22); y += 6; para('하나만 해도 괜찮아요. 순서는 자유예요.', 14, 22, 600, C.ink);
      para(variant === 'completed' ? '신청과 의견 접수는 완료됐어요.' : '아직 완료한 활동이 없어요', 14, 22); y += 6; button('개인정보처리방침', 'text', 44, '/privacy');
    } else if (state.endsWith('_DONE')) {
      image('mascot', p, y, w === 320 ? 48 : 56, w === 320 ? 48 : 56); y += 76;
      const headings = { LEAD_DONE: '베타 오픈 알림 신청을 접수했어요', EXAMPLE_DONE: '사용 예시를 확인했어요', SURVEY_DONE: '의견을 남겨주셔서 감사해요' };
      title(headings[state]); para(state === 'LEAD_DONE' ? t.leadDone : state === 'SURVEY_DONE' ? t.surveyDone : t.exampleDone);
      if (state === 'SURVEY_DONE') para('접수한 답변은 지금 변경하거나 다시 제출할 수 없어요.');
      if (state === 'EXAMPLE_DONE') para('실제 서비스가 아닌 사용 예시예요.', 14, 22);
      y += 12; para('여기서 마쳐도 괜찮아요.', 16, 24, 700, C.ink); para('원하시면 다른 활동도 살펴보세요.', 14, 22); y += 12;
      button('메뉴로 돌아가기', 'primary', 52, 'MENU');
      if (state !== 'LEAD_DONE') button('베타 오픈 알림 받기', 'secondary', 48, 'LEAD');
      if (state === 'LEAD_DONE') { button('사용 예시 먼저 보기', 'secondary', 48, 'EXAMPLE'); button('의견만 남기기 · 4문항', 'text', 44, 'SURVEY'); }
      if (state === 'EXAMPLE_DONE') { button('의견만 남기기 · 4문항', 'text', 44, 'SURVEY'); button('사용 예시 다시 보기', 'text', 44, 'EXAMPLE'); }
      if (state === 'SURVEY_DONE') button('사용 예시 먼저 보기', 'text', 44, 'EXAMPLE');
    } else if (state === 'EXAMPLE') {
      title(t.exampleTitle); para('실제 서비스가 아닌 준비된 예시예요.', 14, 22); para(`사용 예시 ${step}/3`, 14, 22, 600); y += 8;
      image(step === 2 && topic === 'recording' ? 'scale' : 'food', p, y, 88, 72); line('제육볶음 · 준비된 예시', p + 100, y + 38, 14, 600); y += 96;
      if (topic === 'recording') {
        if (step === 1) box('재료와 양 확인', ['돼지고기 목살 600g → 520g', '신김치 200g · 양파 100g', '재료와 양을 직접 확인·수정해요.']);
        if (step === 2) box('직접 입력하는 양 · 예시', ['완성한 요리 무게 1,180g', '먹은 양 320g', '저울로 확인한 무게를 입력해요.']);
        if (step === 3) { box('내 레시피 · 제육볶음 기록 예시', ['완성한 요리 1,180g 중 먹은 양 320g', '487 kcal · 예시·추정치', '탄수화물 31g · 단백질 39g · 지방 22g', '영양 값 전체가 예시·추정치예요.']); }
      } else {
        if (step === 1) box('요리 계획 예시', ['오늘 저녁 · 제육볶음', '필요한 재료를 확인해요.']);
        if (step === 2) { box('구매할 재료 · 예시', ['돼지고기 목살 · 신김치']); box('집에 있어 제외한 재료 · 예시', ['양파 · 고추장 · 고춧가루', '보유 재료는 직접 확인해요.']); }
        if (step === 3) { box('장보기 요약 · 준비된 예시', ['구매: 돼지고기 목살 · 신김치', '집에 있어 제외: 양파 · 고추장 · 고춧가루']); box('요리에서 다음 식사로 · 예시', ['오늘 저녁 제육볶음 · 요리 완료', '남은 제육볶음 → 다음 식사 계획', '직접 표시한 상태를 잇는 예시예요.']); }
      }
      para(t.caveat); y += 12;
      button(step === 3 ? (variant === 'completed' ? '확인 완료 화면 보기' : '예시 확인 완료') : '다음 장면', 'primary', 52, step === 3 ? 'EXAMPLE_DONE' : 'EXAMPLE');
      if (step > 1) button('이전 장면', 'text', 44, 'EXAMPLE');
      button('베타 오픈 알림 받기', 'text', 44, 'LEAD'); button('메뉴로 돌아가기', 'text', 44, 'MENU');
    } else if (state === 'SURVEY') {
      title(t.surveyTitle); para('베타 준비 중 · 의견만 남기기', 14, 22); para(`문항 ${step}/4`, 14, 22, 600); y += 8;
      if (step === 4) { para(t.caveat); y += 12; }
      const q = t.questions[step - 1]; para(q.question, 16, 24, 700, C.ink);
      if (step === 1) { y += 8; para(q1Help); }
      y += 12;
      for (const option of q.options) {
        const rows = wrap(option.label, cw - 60, 16), height = Math.max(48, rows.length * 24 + 24);
        rect(p, y, cw, height, C.white, C.line); parts.push(`<circle cx="${p + 22}" cy="${y + 24}" r="9" fill="white" stroke="${C.ink}"/>`);
        rows.forEach((row, i) => line(row, p + 44, y + 29 + i * 24)); visibleCopy.push(`( ) ${option.label}`);
        const item = { topic, state, canonical_id: canonicalId, variant, step, viewport_width: w, label: option.label, kind: 'radio', x: p, y, width_px: cw, height_px: height }; geometry.push(item); controls.push(item); y += height + 8;
      }
      y += 8; button(step === 4 ? '의견 보내기' : '다음 문항', 'primary', 52, step === 4 ? 'SURVEY_DONE' : 'SURVEY'); if (step > 1) button('이전 문항', 'text', 44, 'SURVEY');
      y += 16; para('이메일 없이 의견만 남길 수 있어요.', 14, 22); button('메뉴로 돌아가기', 'text', 44, 'MENU');
    } else {
      title(t.leadTitle); para(t.leadDesc); y += 12; para('이메일', 16, 24, 600, C.ink);
      rect(p, y, cw, 52, C.white, C.line); line('you@example.com', p + 12, y + 33, 16, 400, C.muted); visibleCopy.push('[이메일 주소 입력]');
      const emailControl = { topic, state, canonical_id: canonicalId, variant, step, viewport_width: w, label: '이메일', kind: 'input', x: p, y, width_px: cw, height_px: 52 }; geometry.push(emailControl); controls.push(emailControl); y += 76;
      para('개인정보 수집·이용 동의 (필수)', 16, 24, 600, C.ink);
      const checkY = y - 16; rect(p + 12, checkY + 12, 20, 20, C.white, C.line, 3);
      para(consent, 16, 24, 400, C.muted, p + 48, cw - 48);
      const checkbox = { topic, state, canonical_id: canonicalId, variant, step, viewport_width: w, label: '미체크 필수 동의', kind: 'checkbox-label', x: p, y: checkY, width_px: cw, height_px: Math.max(44, y - checkY) }; geometry.push(checkbox); controls.push(checkbox);
      y += 12; para('동의하지 않아도 예시와 의견 남기기를 이용할 수 있어요'); para('만 14세 이상인 경우에만 신청해 주세요'); y += 8;
      button('개인정보처리방침', 'text', 44, '/privacy');
      rect(p, y, cw, 80, C.soft); line('보안 확인', p + 12, y + 30, 16, 600); line('정적 도면 · 보안 검증 수행 아님', p + 12, y + 56, 14, 400, C.muted); visibleCopy.push('[보안 확인: 실제 검증은 Stage 4]'); y += 104;
      if (state === 'RECOVERY') { para('! 아직 저장되지 않았어요.', 18, 26, 700, C.ink); para('연결을 확인한 뒤 다시 시도해 주세요.'); para('이메일과 동의 입력은 이 탭을 열어 둔 동안만 유지돼요. 새로고침하면 지워져요.'); y += 12; button('다시 시도', 'primary', 52, 'LEAD'); }
      else button('베타 오픈 알림 신청하기', 'primary', 52, 'LEAD_DONE');
      button('메뉴로 돌아가기', 'text', 44, 'MENU');
    }
    const height = Math.max(844, Math.ceil((y + 24) / 24) * 24);
    const data = { topic, state, canonicalId, variant, step, width: w, height, visibleCopy, controls };
    panels.push(data);
    return { ...data, svg: `<rect width="${w}" height="${height}" fill="${C.white}"/>` + parts.join('') };
  }
  const boards = [];
  async function board(name, titleText, specs, columns) {
    const gap = 24, margin = 24, width = specs[0].width, rows = Math.ceil(specs.length / columns), rowHeights = [];
    for (let row = 0; row < rows; row++) rowHeights.push(Math.max(...specs.slice(row * columns, (row + 1) * columns).map(spec => spec.height)));
    const W = margin * 2 + columns * width + (columns - 1) * gap, H = 108 + rowHeights.reduce((sum, h) => sum + h + 48, 0);
    let body = `<rect width="${W}" height="${H}" fill="#F1F3F5"/><text x="24" y="36" font-size="24" font-weight="700">${esc(titleText)}</text><text x="24" y="66" font-size="16">r2.1 · 각 셀 폭 ${width} CSSpx · 세로 전체 내용 · 정적 도면 · runtime 아님 · authority pending</text>`;
    let top = 108;
    specs.forEach((spec, i) => { if (i && i % columns === 0) top += rowHeights[Math.floor(i / columns) - 1] + 48; const x = margin + (i % columns) * (width + gap); body += `<text x="${x}" y="${top - 12}" font-size="13" font-weight="700">${spec.canonicalId}${['SURVEY', 'EXAMPLE'].includes(spec.state) ? ` / ${spec.step}` : ''}</text><g transform="translate(${x} ${top})">${spec.svg}</g>`; });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${body}</svg>`;
    fs.writeFileSync(path.join(__dirname, name + '.svg'), svg); await sharp(Buffer.from(svg)).png().toFile(path.join(__dirname, name + '.png'));
    boards.push({ name, width: W, height: H, columns, cells: specs.map(({ canonicalId, variant, step, width, height }) => ({ canonicalId, variant, step, width, height })) });
  }
  for (const topic of Object.keys(topicData)) for (const w of [390, 320]) {
    await board(`R2_${topic}_${w}`, `무먹 R2 · ${topicData[topic].label} · ${w}px`, order.map(state => panel(topic, state, w, 'default', state === 'SURVEY' ? 1 : 3)), 4);
    await board(`R2_${topic}_survey_${w}`, `무먹 R2 · ${topicData[topic].label} · 네 문항 · ${w}px`, [1, 2, 3, 4].map(step => panel(topic, 'SURVEY', w, 'default', step)), 4);
  }
  await board('R2_completed-state-variants_320', '무먹 R2 · 서버 완료 확인 상태', Object.keys(topicData).flatMap(topic => order.slice(0, 4).map(state => panel(topic, state, 320, 'completed'))), 4);
  for (const w of [390, 320]) await board(`R2_example-scenes_${w}`, `무먹 R2 · 두 주제의 세 예시 장면 · ${w}px`, Object.keys(topicData).flatMap(topic => [1, 2, 3].map(step => panel(topic, 'EXAMPLE', w, 'default', step))), 3);
  function luminance(hex) { const a = hex.match(/\w\w/g).map(s => parseInt(s, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return a[0] * .2126 + a[1] * .7152 + a[2] * .0722; }
  function contrast(a, b) { const v = [luminance(a), luminance(b)].sort((x, y) => y - x); return Number(((v[0] + .05) / (v[1] + .05)).toFixed(2)); }
  const save = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2) + '\n');
  save('R2_design-content.json', { provenance, ready, consent, q1Help, topics: topicData, fixture, assetFiles, panels, boards });
  save('R2_static-geometry.json', { kind: 'static_design_not_runtime', authority: 'pending', provenance, viewports: [320, 390], contrast: { ink_on_blue: contrast('212529', '00A1FF'), white_on_blue: contrast('FFFFFF', '00A1FF'), body_on_white: contrast('495057', 'FFFFFF') }, controls: geometry });
  process.stdout.write(`Rendered ${boards.length} static SVG/PNG boards; authority pending. No runtime, API, or network.\n`);
}
main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
