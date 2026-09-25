import assert from 'node:assert/strict';
import test from 'node:test';
import { getGalleryLabelOptions, getLabelTotal, matchesAnyLabel, toggleColorLabel } from '../src/lib/reviewLabels.ts';

test('each color can be selected, replaced and cleared without changing other colors', () => {
  assert.deepEqual(toggleColorLabel([], 'red-3'), ['red-3']);
  assert.deepEqual(toggleColorLabel(['red-3'], 'red-5'), ['red-5']);
  assert.deepEqual(toggleColorLabel(['red-3'], 'red-3'), []);
  assert.deepEqual(toggleColorLabel(['red-3', 'blue-4'], 'red-5'), ['blue-4', 'red-5']);
  for (let score = 1; score <= 5; score++) {
    const green = `green-${score}`;
    assert.deepEqual(toggleColorLabel(['red-3', 'blue-4'], green), ['red-3', 'blue-4', green]);
    assert.deepEqual(toggleColorLabel(['red-3', 'blue-4', green], green), ['red-3', 'blue-4']);
  }
  assert.deepEqual(toggleColorLabel(['red-2', 'red-4', 'blue-1'], 'red-5'), ['blue-1', 'red-5']);
});

test('totals count entered colors once and include single color scores and 15', () => {
  assert.equal(getLabelTotal(['red-1']), 1);
  assert.equal(getLabelTotal(['red-4', 'blue-3']), 7);
  assert.equal(getLabelTotal(['red-4', 'blue-3', 'green-2']), 9);
  assert.equal(getLabelTotal(['red-5', 'blue-5', 'green-5']), 15);
  assert.equal(getLabelTotal(['red-2', 'red-4', 'blue-3', 'invalid']), 7);
});

test('available options come from all gallery artworks and recalculate for another gallery', () => {
  const first = getGalleryLabelOptions([
    { labels: ['red-4', 'blue-3'] },
    { labels: ['green-2', 'red-1'] },
    { labels: [] },
  ]);
  assert.deepEqual([...first.labels].sort(), ['blue-3', 'green-2', 'red-1', 'red-4']);
  assert.deepEqual(first.totals, [3, 7]);
  const second = getGalleryLabelOptions([{ labels: ['green-5'] }]);
  assert.deepEqual([...second.labels], ['green-5']);
  assert.deepEqual(second.totals, [5]);
});

test('individual filters retain OR matching for existing and green labels', () => {
  assert.equal(matchesAnyLabel(['red-4', 'blue-3'], ['red-4', 'green-2']), true);
  assert.equal(matchesAnyLabel(['red-4', 'blue-3'], ['blue-3']), true);
  assert.equal(matchesAnyLabel(['green-2'], ['red-4', 'green-2']), true);
  assert.equal(matchesAnyLabel(['blue-1'], ['red-4', 'green-2']), false);
});
