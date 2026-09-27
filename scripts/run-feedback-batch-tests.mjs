import { spawnSync } from 'node:child_process';

// Release checks for the September 28 feedback follow-up batch. Keep unrelated historical
// image/UI fixtures out of this focused suite; their failures are documented.
const files = [
  'account-quarantine-screen', 'auth-logout', 'login-screen',
  'full-local-session-authority', 'hybrid-session-authority-bootstrap',
  'hybrid-session-authority-gateway', 'hybrid-public-read-policy', 'supabase-server',
  'fetch-json', 'home-screen', 'recipe-ingredient-search', 'recipe-tags-search',
  'personal-recipe-api', 'recipe-editor-ingredients', 'recipe-ingredient-units',
  'recipe-detail-ingredient-edit', 'recipe-detail-screen', 'recipe-nutrition-ui',
  'recipe-future-impact-flow', 'recipe-image-read', 'recipe-image',
  'recipe-managed-image-route', 'recipe-book-detail-screen', 'meal-screen',
  'meal-recipe-snapshot', 'meal-recipe-snapshot-route', 'meal-recipe-snapshot-screen',
  'manual-recipe-publication', 'manual-recipe-publish-route', 'manual-recipe-publish-action',
  'manual-recipe-public-runtime-route', 'manual-recipe-create-client',
  'decimal-input', 'cooking-method-suggestion', 'recipe-step-composer-suggestion',
  'cooked-batch-weight-estimate', 'cooking-snapshot-v2-api', 'snapshot-v2-complete',
  'cooked-batch-completion-sheet', 'cooked-batch-completion-replay',
  'cooked-batch-pantry-row-selection', 'cooked-batch-lifecycle-actions',
  'mobile-keyboard-navigation', 'use-dialog-boundary', 'recipe-food-catalog-picker',
  'recipe-content-snapshot-future-propagation', 'recipe-nutrition-service',
  'account-delete-request', 'recipe-cooking-entry', 'recipe-books-route',
  'leftovers.frontend', 'meal-log-add-sheet', 'meal-log-detail-actions',
  'meal-log-ui', 'meal-log-ui-history', 'app-back-button', 'settings-screen',
];

const groups = [
  files.map((file) => `tests/${file}.test`),
  ['tests/manual-recipe-create-screen.test.tsx', '-t', 'cleared ingredient amount|pending publication|does not replay a pending POST|composition|callback identity|history|Korean|save without image'],
  ['tests/planner-meal-screen.test.tsx', '-t', 'does not create a legacy session|snapshot-v2|only the selected shopping_done|sole 식사 추가|opens the meal-add|renders the desktop meal screen as'],
  ['tests/planner-week-screen.test.tsx', '-t', 'scroll|shopping history|distant selected'],
];
for (const group of groups) {
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...group], {
    stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
