// A finite new operator image; original DB240 reviewed blobs stay immutable.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as same } from 'node:util';
export const COMPAT_SOURCE_PIN = Object.freeze({"ref":null,"files":null});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(`gen51 operator: ${message}`); };
const bindingFile = 'scripts/lib/worker-gen51-compat-source.mjs';
export const GEN51_OPERATOR_FILES = Object.freeze([
  'scripts/deploy-prelaunch-web.mjs', 'scripts/lib/prelaunch-web-deploy.mjs', 'scripts/lib/prelaunch-database.mjs',
  'scripts/lib/saved-frozen-quantity-maintenance.mjs', 'scripts/lib/saved-frozen-quantity-source.json',
  'scripts/lib/cooking-maintenance-local.mjs', 'scripts/lib/worker-gen51-renewal-authority.mjs', bindingFile,
  'scripts/plan-worker-gen51-compatibility.mjs',
]);
export function canonicalGen51OperatorText(text) {
  const declaration = /^export const COMPAT_SOURCE_PIN = Object\.freeze\((\{[^\n]*\})\);$/gmu;
  const matches = [...text.matchAll(declaration)];
  check(matches.length === 1, 'one static source pin required');
  let value; try { value = JSON.parse(matches[0][1]); } catch { check(false, 'static JSON source pin required'); }
  check(Object.keys(value).sort().join() === 'files,ref' && (value.ref === null && value.files === null
    || /^[a-f0-9]{40}$/u.test(value.ref ?? '') && value.files && typeof value.files === 'object'
      && Object.values(value.files).every(digest => /^[a-f0-9]{64}$/u.test(digest))), 'closed source pin shape required');
  return text.replace(declaration, 'export const COMPAT_SOURCE_PIN = Object.freeze({"ref":null,"files":null});');
}
export function gen51OperatorImages(repositoryRoot) {
  return Object.fromEntries(GEN51_OPERATOR_FILES.map(file => {
    const bytes = readFileSync(join(repositoryRoot, file));
    return [file, hash(file === bindingFile ? canonicalGen51OperatorText(bytes.toString('utf8')) : bytes)];
  }));
}
export const GEN51_PUBLIC_BASE = '04b7143cf6636cb4a35175fe7b633d07f04181ba';
export function assertGen51ExecutionCommit({ parents, headTree, bindingTree }) {
  // A default-branch merge may execute only the IDENTICAL complete tree of B.
  // This preserves every imported helper, not just the listed operator images.
  if (parents.length === 1) {
    check(parents[0] === COMPAT_SOURCE_PIN.ref, 'exact pin-only binding commit required');
    return true;
  }
  check(parents.length === 2 && parents[0] === GEN51_PUBLIC_BASE
    && parents[1] !== COMPAT_SOURCE_PIN.ref && headTree === bindingTree,
  'only exact public-base merge with the complete binding tree may execute');
  return true;
}
export function assertGen51CheckoutEvidence({ parent, bindingChangedFiles, dirty, implementationChangedFiles }) {
  check(parent === COMPAT_SOURCE_PIN.ref, 'binding must be a direct child of the implementation');
  check(bindingChangedFiles === bindingFile, 'binding commit may change only the static pin');
  check(dirty === '', 'clean complete operator checkout required');
  const allowed = new Set([...GEN51_OPERATOR_FILES, 'tests/worker-gen51-renewal-authority.test.mjs', 'docs/engineering/worker-gen51-authority-compatibility-20261022.md',
    'scripts/youtube-worker-gen51-renewal.mjs', 'tests/youtube-worker-gen51-renewal.test.mjs', 'docs/engineering/youtube-worker-gen51-renewal-20261022.md']);
  check(implementationChangedFiles.every(file => allowed.has(file)), 'implementation changed an unreviewed imported helper / file');
  return true;
}
export function assertGen51CompatOperator(review, repositoryRoot, canonicalFrozen) {
  check(realpathSync(repositoryRoot) === realpathSync(fileURLToPath(new URL('../../', import.meta.url))), 'executing repository differs');
  check(review.operator.ref === '40f2e279508048ec30952e5d6fe5808314d44796', 'exact original DB240 operator required');
  check(/^[a-f0-9]{40}$/u.test(COMPAT_SOURCE_PIN.ref ?? '') && same(Object.keys(COMPAT_SOURCE_PIN.files ?? {}).sort(), [...GEN51_OPERATOR_FILES].sort()), 'complete committed successor pin required');
  check(same(gen51OperatorImages(repositoryRoot), COMPAT_SOURCE_PIN.files), 'new operator bytes differ');
  const git = args => execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['merge-base', '--is-ancestor', GEN51_PUBLIC_BASE, COMPAT_SOURCE_PIN.ref]);
  const parents = git(['show', '-s', '--format=%P', 'HEAD']).split(' ');
  check(parents.length === 1 || parents.length === 2, 'unsupported execution commit');
  const binding = parents.length === 2 ? parents[1] : 'HEAD';
  assertGen51ExecutionCommit({ parents, headTree: git(['rev-parse', 'HEAD^{tree}']), bindingTree: git(['rev-parse', `${binding}^{tree}`]) });
  const bindingParents = git(['show', '-s', '--format=%P', binding]).split(' ');
  check(bindingParents.length === 1, 'binding commit must have exactly one parent');
  assertGen51CheckoutEvidence({ parent: bindingParents[0],
    bindingChangedFiles: git(['diff', '--name-only', COMPAT_SOURCE_PIN.ref, binding]),
    dirty: git(['status', '--porcelain', '--untracked-files=all']),
    implementationChangedFiles: git(['diff', '--name-only', GEN51_PUBLIC_BASE, COMPAT_SOURCE_PIN.ref]).split('\n').filter(Boolean) });
  for (const [file, digest] of Object.entries(review.operator.files)) {
    const bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${review.operator.ref}:${file}`], { maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    check(hash(file.endsWith('/saved-frozen-quantity-maintenance.mjs') ? canonicalFrozen(bytes.toString('utf8')) : bytes) === digest, 'original reviewed operator blob differs');
  }
  for (const file of GEN51_OPERATOR_FILES) {
    const bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${COMPAT_SOURCE_PIN.ref}:${file}`], { maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    check(hash(file === bindingFile ? canonicalGen51OperatorText(bytes.toString('utf8')) : bytes) === COMPAT_SOURCE_PIN.files[file], 'committed successor blob differs');
  }
  return true;
}
