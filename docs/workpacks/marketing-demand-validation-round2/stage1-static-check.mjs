import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDocGate } from '../../../scripts/lib/omo-doc-gate.mjs';
import { normalizeAutomationSpec } from '../../../scripts/lib/omo-automation-spec.mjs';

// Documentation-only checks. Never connect to an application, DB or provider.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const slice = 'marketing-demand-validation-round2';
const approved = '7f00e62c13572b5b2c0d54c997fe628f7a56567e';
const workpack = `docs/workpacks/${slice}`;
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const states = ['MENU', 'EXAMPLE', 'EXAMPLE_DONE', 'SURVEY', 'SURVEY_DONE', 'LEAD', 'LEAD_DONE', 'RECOVERY'];
const topics = ['RECORDING', 'HOMEFLOW'];
const failures = [];
const checks = [];
function check(name, run) {
  try { run(); checks.push({ name, outcome: 'pass' }); }
  catch (error) { failures.push({ name, message: error.message }); }
}

check('approved-contract-provenance', () => {
  execFileSync('git', ['merge-base', '--is-ancestor', approved, 'HEAD'], { cwd: root });
  const frozen = execFileSync('git', ['show', `${approved}:docs/marketing-demand-validation-r2-contract.md`], { cwd: root, encoding: 'utf8' });
  assert.equal(read('docs/marketing-demand-validation-r2-contract.md'), frozen);
  assert.ok(read(`${workpack}/README.md`).includes(approved));
  assert.ok(read(`${workpack}/acceptance.md`).includes(approved));
});
check('official-delegation-and-json-examples', () => {
  const files = [...read('docs/sync/CURRENT_SOURCE_OF_TRUTH.md').matchAll(/^- `(docs\/[^`]+\.md)`/gm)].map((m) => m[1]);
  assert.equal(files.length, 5);
  for (const file of files) assert.ok(read(file).includes('marketing-demand-validation-r2-contract.md'), file);
  const examples = [...read('docs/marketing-demand-validation-r2-contract.md').matchAll(/```json\s*\n([\s\S]*?)```/g)];
  assert.ok(examples.length > 0);
  for (const example of examples) JSON.parse(example[1]);
});
check('workpack-contract-and-five-ui-states', () => {
  const text = read(`${workpack}/README.md`);
  for (const token of ['## Backend First Contract', '## Frontend Delivery Mode', '## QA / Test Data Plan', 'POST /api/v1/marketing/round2', 'marketing_round2_participations', 'marketing_round2_events', 'marketing_round2_lead_requests', 'marketing_round2_apply', 'cookie_resume', 'loading', 'empty', 'error', 'read-only', 'unauthorized']) assert.ok(text.includes(token), token);
  for (const forbidden of ['subject=', 'round=r2', 'opinion_submitted', 'opinion_opened', 'direct_apply', 'quiz_or_experience']) assert.ok(!text.includes(forbidden), forbidden);
});
check('automation-and-no-author-self-approval', () => {
  const spec = json(`${workpack}/automation-spec.json`);
  normalizeAutomationSpec(spec);
  const item = json(`.workflow-v2/work-items/${slice}.json`);
  assert.equal(item.status.approval_state, 'not_started');
  assert.equal(item.closeout.merge_gate_projection.approval_state, 'not_started');
  assert.equal(item.closeout.merge_gate_projection.all_checks_green, false);
  assert.equal(item.closeout.docs_projection.design_authority, 'pending');
  for (const state of ['loading', 'empty', 'error', 'read-only', 'unauthorized']) assert.ok(spec.frontend.required_states.includes(state), state);
  for (const target of spec.backend.required_test_targets) assert.ok(existsSync(join(root, target)), target);
  const pkg = json('package.json');
  for (const command of [...spec.backend.verify_commands, ...spec.frontend.verify_commands, ...item.verification.required_checks]) {
    for (const match of command.matchAll(/\bpnpm\s+([a-z][\w:-]*)/g)) {
      if (!['exec', 'install'].includes(match[1])) assert.ok(Object.hasOwn(pkg.scripts, match[1]), `Missing package script: ${match[1]}`);
    }
  }
});
check('canonical-screen-mapping-and-artifacts', () => {
  const mapping = read('ui/designs/R2_SCREEN_MAPPING.md');
  for (const state of states) {
    const generator = `ui/designs/R2_${state}.md`;
    const critic = `ui/designs/critiques/R2_${state}-critique.md`;
    for (const topic of topics) assert.ok(mapping.includes(`R2_${topic}_${state}`), `${topic}/${state}`);
    assert.ok(existsSync(join(root, generator)), generator);
    assert.ok(existsSync(join(root, critic)), critic);
    assert.ok(read(generator).includes('recording') && read(generator).includes('homeflow'), generator);
  }
  for (const topic of ['recording', 'homeflow']) for (const width of [320, 390]) {
    for (const ext of ['png', 'svg']) assert.ok(existsSync(join(root, `ui/designs/evidence/${slice}/R2_${topic}_${width}.${ext}`)));
  }
});
check('relative-markdown-links-and-whitespace', () => {
  const files = [`${workpack}/README.md`, `${workpack}/acceptance.md`];
  for (const dir of ['ui/designs', 'ui/designs/critiques']) {
    for (const name of readdirSync(join(root, dir))) if (/^R2_.*\.md$/.test(name)) files.push(`${dir}/${name}`);
  }
  for (const file of files) {
    const text = read(file);
    assert.ok(!/[\t ]+$/m.test(text), `Trailing whitespace: ${file}`);
    for (const match of text.matchAll(/\[[^\]\n]*\]\((<?[^)\n]+>?)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^[a-z]+:\/\//i.test(target)) continue;
      assert.ok(!isAbsolute(target), `Absolute Markdown link in ${file}: ${target}`);
      assert.ok(existsSync(resolve(root, dirname(file), decodeURIComponent(target))), `Missing link in ${file}: ${target}`);
    }
  }
});
check('stage1-checklist-metadata-and-design-gate', () => {
  const result = evaluateDocGate({ rootDir: root, slice });
  assert.equal(result.outcome, 'pass', result.summary);
});
process.stdout.write(JSON.stringify({ scope: 'Stage1 documents only', approved_contract: approved, canonical_screens: 16, checks, failures, outcome: failures.length ? 'fail' : 'pass', not_run: ['product behavior', 'DB', 'provider', 'deployment', 'runtime authority', 'independent internal1.5 approval'] }, null, 2) + '\n');
if (failures.length) process.exitCode = 1;
