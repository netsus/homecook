// Explicit value and key allowlists: never serialize a request, response body, DOM text or identifier.
export function projectUiTrace(input) {
  const output = {};
  const sets = {
    kind: ['ui', 'request', 'response', 'assertion'],
    topic: ['recording', 'homeflow'],
    action: ['bootstrap', 'menu_return', 'activity_start', 'example_start', 'example_complete', 'survey_start', 'survey_submit', 'lead_start', 'lead_submit'],
    actionType: ['click', 'change', 'screen', 'navigation', 'case-start', 'case-end', 'db-receipt', 'intercepted-commit', 'intercepted-unreceived'],
    navigationType: ['navigate', 'reload', 'back_forward'],
    bootstrapIntent: ['create_or_resume', 'cookie_resume'],
    activity: ['menu', 'example', 'survey', 'lead'],
    element: ['button', 'input', 'label', 'a', 'main', 'section', 'div', 'span'],
    inputType: ['email', 'checkbox', 'radio', 'button', 'submit'],
    error: ['VALIDATION_ERROR', 'TURNSTILE_FAILED', 'LEAD_CAPTURE_UNAVAILABLE', 'CONSENT_REFRESH_REQUIRED', 'PARTICIPATION_EXPIRED', 'RATE_LIMITED', 'ACTIVITY_ALREADY_COMPLETED'],
    receipt: ['received'],
    example: ['not_started', 'started', 'completed'],
    survey: ['not_started', 'started', 'completed'],
    lead: ['not_started', 'started', 'completed'],
  };
  for (const [key, values] of Object.entries(sets)) if (values.includes(input[key])) output[key] = input[key];
  if (typeof input.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.at)) output.at = input.at;
  if (typeof input.caseId === 'string' && /^(recording|homeflow|shared|recovery|rate|storage)(-[a-z0-9]+){1,12}$/.test(input.caseId)) output.caseId = input.caseId;
  if (typeof input.screen === 'string' && /^R2_(RECORDING|HOMEFLOW)_(MENU|EXAMPLE|EXAMPLE_DONE|SURVEY|SURVEY_DONE|LEAD|LEAD_DONE|RECOVERY)$/.test(input.screen)) output.screen = input.screen;
  for (const key of ['status', 'revision', 'sequence', 'tab', 'eventRows', 'leadRows']) if (Number.isSafeInteger(input[key]) && input[key] >= 0) output[key] = input[key];
  for (const key of ['sameEvent', 'sameEmail', 'tokenPresent', 'consent', 'completed', 'noNewWrite']) if (typeof input[key] === 'boolean') output[key] = input[key];
  return output;
}
