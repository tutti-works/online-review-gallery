import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { filterGalleriesByMode, galleryPath, lastViewedKey, resolveGallerySelection } from '../src/lib/courseArchive.ts';

const galleries = [
  { id: 'a1', courseId: 'a' },
  { id: 'a2', courseId: 'a' },
  { id: 'b1', courseId: 'b' },
  { id: 'legacy', courseId: '' },
];

test('記録がなければ全課題が通常ギャラリーに残る', () => {
  assert.deepEqual(filterGalleriesByMode(galleries, new Set(), 'active').map((gallery) => gallery.id),
    ['a1', 'a2', 'b1', 'legacy']);
  assert.deepEqual(filterGalleriesByMode(galleries, new Set(), 'archive'), []);
});

test('授業単位で全課題が切り替わり、他の授業には影響しない', () => {
  const archived = new Set(['a']);
  assert.deepEqual(filterGalleriesByMode(galleries, archived, 'active').map((gallery) => gallery.id),
    ['b1', 'legacy']);
  assert.deepEqual(filterGalleriesByMode(galleries, archived, 'archive').map((gallery) => gallery.id),
    ['a1', 'a2']);
  archived.delete('a');
  assert.equal(filterGalleriesByMode(galleries, archived, 'active').length, 4);
});

test('通常とアーカイブの URL と保存キーを分離する', () => {
  assert.equal(galleryPath('active'), '/gallery');
  assert.equal(galleryPath('archive'), '/archive');
  assert.notEqual(lastViewedKey('active'), lastViewedKey('archive'));
});

test('別区分の URL と保存値から課題を復元しない', () => {
  const active = filterGalleriesByMode(galleries, new Set(['a']), 'active');
  assert.deepEqual(resolveGallerySelection(active, 'a1', 'b1'), {
    galleryId: null, restoreSaved: false, clearUrl: true, clearSaved: false,
  });
  assert.deepEqual(resolveGallerySelection(active, null, 'a2'), {
    galleryId: null, restoreSaved: false, clearUrl: false, clearSaved: true,
  });
  assert.deepEqual(resolveGallerySelection(active, null, 'b1'), {
    galleryId: 'b1', restoreSaved: true, clearUrl: false, clearSaved: false,
  });
});
