import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root = '/tmp/homecook-cooking-experience-20261017';
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const files = new Map();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function source(file) {
  if (!files.has(file)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    files.set(file, { text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) });
  }
  return files.get(file);
}
const extracted = [];
function fn(file, name) {
  const { ast } = source(file);
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert(node, `${file}: ${name} missing`);
  const text = node.getText(ast).replace(/^export\s+/, '');
  extracted.push({ file, name, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, sha256: hash(text) });
  return text;
}
function callback(file, predicate, label) {
  const { ast } = source(file); let found;
  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])
      && predicate(node)) { assert(!found, `ambiguous ${label}`); found = node.arguments[0]; }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(found, `${label} missing`);
  const text = found.getText(ast);
  extracted.push({ file, name: label, line: ast.getLineAndCharacterOfPosition(found.getStart(ast)).line + 1, sha256: hash(text) });
  return text;
}
const importsFile = 'lib/server/youtube-import.ts';
const savedFile = 'lib/server/youtube-saved-recipes.ts';
const uiFile = 'components/recipe/youtube-import-screen.tsx';
const quantityFile = 'lib/quantity-input.ts';
const executionFile = 'lib/server/cooking-execution-quantities.ts';
const bundle = [
  ...['normalizeNullableString', 'normalizeParsedIngredientName', 'parseRecipeAmount', 'normalizeLlmAmount',
    'normalizeI031QuantityEvidenceRefs', 'i031QuantitySource', 'isConsistentI031QuantityMetadata', 'buildI031ParsedRecipe'].map(name => fn(importsFile, name)),
  ...['isRecord', 'hasExactKeys', 'isUuid', 'isNullableString', 'parseIngredient'].map(name => fn(savedFile, name)),
  ...['gcd', 'parseQuantityInput', 'record', 'exact', 'isQuantityInputDraft', 'isQuantityInputSnapshot'].map(name => fn(quantityFile, name)),
  ...['savedQuantityText', 'savedQuantitySnapshot'].map(name => fn('lib/youtube-saved-quantity-input.ts', name)),
  ...['getIngredientName', 'getQuantityEditPatch', 'formatIngredientDisplayText', 'normalizeIngredient', 'applyIngredientQuantityPatch'].map(name => fn(uiFile, name)),
  ...['parseExecutionQuantityChanges', 'applyExecutionQuantityChanges'].map(name => fn(executionFile, name)),
  fn('lib/server/youtube-public-recipe-nutrition.ts', 'hasExactFrozenQuantity'),
  `const reopen = ${callback(uiFile, node => node.expression.getText() === 'saved.content.ingredients.map', 'saved content reopen mapper')};`,
  `const payload = ${callback(uiFile, node => node.expression.getText() === 'ingredients.map' && node.arguments[0].getText().includes('row_id: getStableRowId'), 'saved content payload mapper')};`,
  'globalThis.api = {buildI031ParsedRecipe,parseIngredient,reopen,payload,applyIngredientQuantityPatch,parseExecutionQuantityChanges,applyExecutionQuantityChanges,hasExactFrozenQuantity,savedQuantityText};',
].join('\n');
const context = vm.createContext({
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  QUANTITY_INPUT_VERSION: 'quantity-v4',
  originalIngredientNamesRef: { current: new Map() },
  getStableRowId: value => value,
  switchSavedQuantityUnit: () => { throw new Error('conversion path outside this focused extraction'); },
});
const compiled = ts.transpileModule(bundle, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
vm.runInContext(compiled, context, { timeout: 1000 });
const api = context.api;
const plain = value => JSON.parse(JSON.stringify(value));
const cases = [];
const add = (name, input, output) => cases.push({ name, input: plain(input), output: plain(output), passed: true });
const id = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const ingredient = { name: '합성 재료', amount: '10', unit: 'g', optional: true, quantityState: 'explicit',
  amountBasis: 'stated', evidenceRefs: [{ source_method: 'description', source_provider: 'synthetic', snippet: '합성 재료 10g (선택)' }] };
const parsedTrue = api.buildI031ParsedRecipe({ recipe: { ingredients: [ingredient], steps: [] } }).ingredients[0];
const parsedFalse = api.buildI031ParsedRecipe({ recipe: { ingredients: [{ ...ingredient, optional: false }], steps: [] } }).ingredients[0];
assert.deepEqual(plain(parsedTrue), plain(parsedFalse));
assert(!Object.hasOwn(parsedTrue, 'optional'));
add('optional numeric source flag is lost at current parser', ingredient, parsedTrue);
const row = { row_id: id, source_draft_ingredient_id: sourceId, standard_name: '합성 재료', quantity_mode: 'quantity',
  amount: 25, unit: 'g', display_text: '합성 재료 약 25g', component_label: null };
let fields = [];
assert.equal(api.parseIngredient({ ...row, optional: true }, 0, fields, false), null);
assert.equal(fields[0].reason, 'invalid_shape');
add('optional is not accepted by current saved row contract', { ...row, optional: true }, { fields });
function reopen(row, extras = {}) {
  context.saved = { source: { ingredient_quantity_sources: { [sourceId]: 'recipe_inferred' } }, content: { ingredients: [row] }, ...extras };
  return api.reopen(row, 0);
}
const unknown = reopen({ ...row, quantity_mode: 'unknown' });
const unknownPayload = api.payload(unknown);
assert.equal(unknown.quantity_review_required, true);
assert.equal(unknown.quantity_user_confirmed, false);
assert.equal(unknownPayload.quantity_mode, 'unknown');
assert.equal(unknownPayload.amount, 25);
assert.equal(unknownPayload.display_text, row.display_text);
add('legacy unknown is not promoted after saved reopen', { ...row, quantity_mode: 'unknown' }, { reopened: unknown, payload: unknownPayload });
const confirmed = reopen(row);
const confirmedPayload = api.payload(confirmed);
assert.equal(confirmed.quantity_user_confirmed, true);
assert.equal(confirmedPayload.quantity_mode, 'quantity');
assert(!Object.hasOwn(confirmed, 'quantity_source'));
add('historical inferred provenance does not revoke current user quantity', row, { reopened: confirmed, payload: confirmedPayload });
const fingerprint = 'a'.repeat(64);
const input = { schema_version: 'quantity-v4', raw_value: '1/3', raw_unit: 'g', numerator: '1', denominator: '3',
  normalized: { amount: 1 / 3, unit: 'g' }, quality: 'direct', reason: null, evidence_ids: ['synthetic-evidence'], source_versions: ['synthetic-version'], batch_basis: null };
const fractionRow = { ...row, amount: 1 / 3, display_text: '합성 재료 1/3g', quantity_input: input, quantity_context_fingerprint: fingerprint };
const reopened = reopen(fractionRow, { quantity_policy: 'quantity-v4', quantity_contexts: { [id]: { fingerprint, options: null } } });
assert.equal(reopened.savedQuantity.text, '1/3');
assert.equal(reopened.savedQuantity.enabled, true);
assert(!Object.hasOwn(api.payload(reopened), 'quantity_input'));
const edited = api.applyIngredientQuantityPatch(reopened, { savedQuantityText: '2/3' });
const editedPayload = api.payload(edited);
fields = [];
assert(api.parseIngredient(editedPayload, 0, fields, true));
assert.equal(fields.length, 0);
assert.equal(editedPayload.amount, 2 / 3);
assert.equal(editedPayload.quantity_input.raw_value, '2/3');
assert.equal(editedPayload.quantity_input.expected_context_fingerprint, fingerprint);
add('current v4 raw fraction and user edit payload survive without historical projection', fractionRow,
  { reopened, unchangedPayload: api.payload(reopened), editedPayload });
const originals = [{ id, ingredient_id: sourceId, amount: 100, unit: 'g', ingredient_type: 'QUANT', scalable: true,
  display_text: '합성 재료 100g', quantity_input: { ...input, raw_value: '100', numerator: '100', normalized: { amount: 100, unit: 'g' } } }];
const changes = api.parseExecutionQuantityChanges({ expected_revision: 0, changes: [{ row_index: 0, amount: 190, unit: 'g' }] });
assert(changes);
const execution = api.applyExecutionQuantityChanges(originals, changes.changes);
assert.equal(originals[0].amount, 100);
assert.equal(execution[0].amount, 190);
assert.equal(execution[0].scalable, false);
assert.equal(execution[0].display_text, null);
assert(!Object.hasOwn(execution[0], 'quantity_input'));
assert.equal(execution[0].ingredient_id, sourceId);
assert.equal(api.parseExecutionQuantityChanges({ expected_revision: 0, changes: [{ row_index: 0, amount: 0, unit: 'g' }] }), null);
add('run edit removes stale proof and scaling, preserves original and identity, zero is outside contract', { originals, changes }, execution);
assert.equal(api.hasExactFrozenQuantity({ ...fractionRow, quantity_input: input }), true);
assert.equal(api.hasExactFrozenQuantity({ ...fractionRow, quantity_input: { ...input, quality: 'estimated' } }), false);
assert.equal(api.hasExactFrozenQuantity({ ...fractionRow, quantity_input: { ...input, raw_unit: '개' } }), false);
add('public fallback distinguishes exact from estimated/count frozen proof', { input }, { exact: true, estimated: false, count: false });
const result = { kind: 'local-pure-source-extraction-review', head: '14464a83c', runtime: process.version,
  command: `${process.execPath} /tmp/homecook-quantity-provenance-review-20261017.mjs`,
  restrictions: { repositoryWrites: 0, operatingAccess: 0, databaseAccess: 0, models: 0, network: 0 },
  limits: ['Functions/callbacks are AST-extracted from current source and transpiled, not full React/HTTP modules.',
    'Synthetic identities and source evidence only.', 'SQL preservation/projection, RPC authorization, nutrition/weight calculation and completion persistence are static review, not executed by this artifact.',
    'The historical ingredient_quantity_sources field is intentionally injected to show the current reopen mapper ignores it; this does not assert the live response contains it.'],
  sourceFiles: [...files].map(([file, { text }]) => ({ file, sha256: hash(text) })), extracted,
  count: cases.length, cases };
const destination = '/tmp/homecook-quantity-provenance-review-20261017.json';
fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ result: destination, count: cases.length, sha256: hash(fs.readFileSync(destination)), passed: true }));
