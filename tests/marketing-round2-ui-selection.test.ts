import { expect, it } from 'vitest';
import { selectUiScenarioModes } from '../scripts/verify-marketing-round2-ui-isolated.mjs';

it('uses the observed full 24 plus 4 branch with either no option or explicit lead edit', () => {
  expect(selectUiScenarioModes([])).toEqual(selectUiScenarioModes(['--lead-edit']));
  expect(selectUiScenarioModes([])).toEqual({ recoveryZoom: false, recoveryOnly: false, leadEditOnly: false, leadEdit: true });
});
it('preserves the recovery-only selection', () => {
  expect(selectUiScenarioModes(['--recovery-only'])).toEqual({ recoveryZoom: false, recoveryOnly: true, leadEditOnly: false, leadEdit: false });
});
it('preserves the recovery zoom selection', () => {
  expect(selectUiScenarioModes(['--recovery-zoom-only'])).toEqual({ recoveryZoom: true, recoveryOnly: true, leadEditOnly: false, leadEdit: false });
});
it('preserves the focused four lead-edit conditions', () => {
  expect(selectUiScenarioModes(['--lead-edit-only'])).toEqual({ recoveryZoom: false, recoveryOnly: false, leadEditOnly: true, leadEdit: true });
});
