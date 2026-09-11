export function assertRecoveryZoomCombinations(rows) {
  const expected = ['recording', 'homeflow'].flatMap(topic =>
    ['320x568', '390x844', '393x852', '1280x900'].map(viewport => `${topic}:${viewport}`),
  ).sort();
  const actual = Array.isArray(rows) ? rows.map(row => `${row?.topic}:${row?.viewport?.width}x${row?.viewport?.height}`).sort() : [];
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error('Incomplete or duplicated R2 recovery zoom combinations');
  }
  return actual;
}
