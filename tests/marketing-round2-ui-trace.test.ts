import { expect, it } from 'vitest';
import { projectUiTrace } from './helpers/marketing-round2-ui-trace.mjs';

it('retains observed states while excluding arbitrary nested request and browser secrets', () => {
  const secret = 'private@example.test cookie-token-secret';
  const result = projectUiTrace({ kind: 'response', at: '2026-09-11T10:00:00.000Z', caseId: 'recording-solo-example', action: 'lead_submit', topic: 'recording', status: 200, sameEvent: true, tokenPresent: false, email: secret, cookie: secret, request: { token: secret }, data: { email: secret }, revision: 2 });
  expect(result).toEqual({ kind: 'response', at: '2026-09-11T10:00:00.000Z', caseId: 'recording-solo-example', action: 'lead_submit', topic: 'recording', status: 200, sameEvent: true, tokenPresent: false, revision: 2 });
  expect(JSON.stringify(result)).not.toContain(secret);
});

it('rejects sensitive strings smuggled through permitted fields and unknown states', () => {
  const result = projectUiTrace({ kind: 'response', at: 'email@example.test', caseId: 'email@example.test', action: 'raw-secret', topic: 'email@example.test', error: 'secret', screen: 'email@example.test', element: 'secret', status: 'secret', sameEvent: 'secret', revision: 'secret' });
  expect(result).toEqual({ kind: 'response' });
});

it('keeps only predefined observation fields rather than copying raw payload properties', () => {
  expect(projectUiTrace({ kind: 'ui', at: '2026-09-11T10:00:00.000Z', caseId: 'homeflow-s5-lost', actionType: 'change', screen: 'R2_HOMEFLOW_LEAD', element: 'input', inputType: 'email', value: 'secret', text: 'secret', href: 'secret' })).toEqual({ kind: 'ui', at: '2026-09-11T10:00:00.000Z', caseId: 'homeflow-s5-lost', actionType: 'change', screen: 'R2_HOMEFLOW_LEAD', element: 'input', inputType: 'email' });
});

it('preserves enumerated reload and cookie-resume evidence without retaining URL or cookie values', () => {
  expect(projectUiTrace({ kind: 'ui', actionType: 'navigation', navigationType: 'reload', activity: 'lead', bootstrapIntent: 'cookie_resume', url: 'secret', cookie: 'secret' })).toEqual({ kind: 'ui', actionType: 'navigation', navigationType: 'reload', activity: 'lead', bootstrapIntent: 'cookie_resume' });
});
