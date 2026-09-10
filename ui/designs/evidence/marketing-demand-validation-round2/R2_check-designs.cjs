// Narrow, reproducible static design checks. Does not assert runtime or authority.
async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const repo = path.resolve(__dirname, '../../../..'), docsRoot = path.resolve(__dirname, '../..');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'R2_design-content.json'), 'utf8'));
  const geometry = JSON.parse(fs.readFileSync(path.join(__dirname, 'R2_static-geometry.json'), 'utf8'));
  const states = ['MENU', 'EXAMPLE', 'EXAMPLE_DONE', 'SURVEY', 'SURVEY_DONE', 'LEAD', 'LEAD_DONE', 'RECOVERY'];
  const names = [...states.map(state => `R2_${state}.md`), 'R2_DESIGN_DIRECTION.md', 'R2_DESIGN_HANDOFF.md', 'R2_SCREEN_MAPPING.md'];
  const docs = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(docsRoot, name), 'utf8')]));
  const checks = [], links = [], files = [];
  const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  const exists = (relative, target) => { const ok = fs.existsSync(target) && fs.statSync(target).isFile(); files.push({ path: relative, exists: ok }); return ok; };
  for (const state of states) {
    const doc = docs[`R2_${state}.md`];
    for (const literal of ['Design Status: draft', 'Authority: pending', 'primary CTA', 'scroll containment', '320', '390', 'Stage 4', data.provenance.merged, data.provenance.reviewed]) check(`${state}: ${literal}`, doc.includes(literal));
    for (const topic of Object.keys(data.topics)) check(`${state}: ${topic} canonical ID`, doc.includes(`R2_${topic.toUpperCase()}_${state}`));
    check(`${state}: no provisional contract`, !/미승인|카피TBD|문구 적용 예정|계약 승인 후 동기화/.test(doc));
  }
  const mapping = docs['R2_SCREEN_MAPPING.md'];
  const canonicalIds = [...new Set([...mapping.matchAll(/`(R2_(?:RECORDING|HOMEFLOW)_[A-Z_]+)`/g)].map(hit => hit[1]))];
  check('16 canonical mappings', canonicalIds.length === 16);
  for (const [topic, value] of Object.entries(data.topics)) {
    check(`${topic}: MENU exact title and description`, docs['R2_MENU.md'].includes(value.title) && docs['R2_MENU.md'].includes(value.desc));
    check(`${topic}: four questions`, value.questions.length === 4);
    for (const q of value.questions) {
      check(`${topic}: ${q.question}`, docs['R2_SURVEY.md'].includes(q.question));
      for (const option of q.options) check(`${topic}: ${option.value} / ${option.label}`, docs['R2_SURVEY.md'].includes('`' + option.value + '` → ' + option.label));
    }
    check(`${topic}: Q4 condition`, docs['R2_SURVEY.md'].includes(value.caveat));
  }
  check('Q1 family scope', docs['R2_SURVEY.md'].includes(data.q1Help));
  for (const state of ['LEAD', 'RECOVERY']) check(`${state}: exact consent`, docs[`R2_${state}.md`].includes(data.consent));
  for (const [name, doc] of Object.entries(docs)) {
    for (const match of doc.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^https?:|^app:|^codex:/.test(target)) continue;
      const absolute = path.resolve(docsRoot, decodeURIComponent(target)), ok = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
      links.push({ source: name, target, exists: ok });
    }
  }
  for (const name of names) exists('ui/designs/' + name, path.join(docsRoot, name));
  const artifacts = [];
  for (const board of data.boards) for (const extension of ['svg', 'png']) {
    const name = board.name + '.' + extension, file = path.join(__dirname, name);
    if (exists(name, file)) {
      const bytes = fs.readFileSync(file); artifacts.push({ file: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      if (extension === 'png') check(`${name}: PNG dimensions`, bytes.readUInt32BE(16) === board.width && bytes.readUInt32BE(20) === board.height);
      else { const svg = bytes.toString('utf8'); for (const cell of board.cells) check(`${name}: ${cell.canonicalId}`, svg.includes(cell.canonicalId)); }
    }
  }
  for (const file of Object.values(data.assetFiles)) exists('public/assets/funnel/' + file, path.join(repo, 'public/assets/funnel', file));
  exists(data.fixture.source, path.join(repo, data.fixture.source));
  const fixtureSource = fs.readFileSync(path.join(repo, data.fixture.source), 'utf8');
  check('existing fixture values', ['useCountUp(487', 'useCountUp(31', 'useCountUp(39', 'useCountUp(22', '1,180g', '320g'].every(text => fixtureSource.includes(text)));
  const menuBottom = {};
  for (const panel of data.panels) {
    const mainDoc = docs[`R2_${panel.state}.md`];
    if (panel.width === 320 && panel.variant === 'default' && (panel.state !== 'SURVEY' || panel.step === 1)) check(`${panel.canonicalId}/${panel.step}: visible copy in document`, panel.visibleCopy.every(text => mainDoc.includes(text)));
    for (const control of panel.controls) {
      check(`${panel.canonicalId}/${panel.step}/${panel.width}: ${control.label} bounds`, control.x >= 0 && control.y >= 0 && control.x + control.width_px <= panel.width && control.y + control.height_px <= panel.height);
      check(`${panel.canonicalId}: ${control.label} min touch`, control.height_px >= 44 && control.width_px >= 44);
    }
    if (panel.state === 'MENU') {
      const primary = panel.controls.find(control => control.kind === 'primary');
      check(`MENU ${panel.topic} primary ${panel.variant}`, primary.destination === (panel.variant === 'completed' ? 'LEAD_DONE' : 'LEAD'));
      const last = panel.controls.find(control => ['SURVEY', 'SURVEY_DONE'].includes(control.destination));
      check(`MENU ${panel.topic}/${panel.width}/${panel.variant} bottom <=600`, last.y + last.height_px <= 600);
      if (panel.variant === 'default') menuBottom[`${panel.topic}_${panel.width}`] = last.y + last.height_px;
    }
    if (panel.state.endsWith('_DONE')) check(`${panel.canonicalId}: menu primary`, panel.controls.find(control => control.kind === 'primary').destination === 'MENU');
    if (panel.variant === 'completed') check(`${panel.canonicalId}: no resubmission destination`, !panel.controls.some(control => ['LEAD', 'SURVEY'].includes(control.destination)));
  }
  check('normal ink text contrast', geometry.contrast.ink_on_blue >= 4.5 && geometry.contrast.body_on_white >= 4.5);
  const report = { scope: 'static-design-evidence-only', authority: 'pending', provenance: data.provenance, designChecks: { total: checks.length, failures: checks.filter(item => !item.ok) }, relativeLinks: { total: links.length, failures: links.filter(item => !item.exists) }, actualFiles: { total: files.length, failures: files.filter(item => !item.exists) }, calculated_srgb_contrast: geometry.contrast, menu_last_choice_bottom_px: menuBottom, minimum_control_height_px: Math.min(...geometry.controls.map(item => item.height_px)), artifacts, not_verified: ['runtime layout', 'keyboard', 'focus', 'screen reader', 'real server restoration', 'Turnstile', 'privacy publication', 'new video parity'] };
  fs.writeFileSync(path.join(__dirname, 'R2_static-checks.json'), JSON.stringify(report, null, 2) + '\n');
  const failures = report.designChecks.failures.length + report.relativeLinks.failures.length + report.actualFiles.failures.length;
  process.stdout.write(JSON.stringify({ designChecks: report.designChecks, relativeLinks: report.relativeLinks, actualFiles: report.actualFiles, menu: menuBottom, minTouch: report.minimum_control_height_px, failures }, null, 2) + '\n');
  if (failures) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
