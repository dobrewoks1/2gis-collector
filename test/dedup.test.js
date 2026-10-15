import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupKey, dedupeRecords } from '../src/core/dedup.js';
import { normKey } from '../src/util.js';

test('dedupKey: 2GIS id wins; otherwise normalized name + address (case, ё/е, punctuation)', () => {
  assert.equal(normKey('  Демо-Кофейня «Ёж»,  ул. Тестовая, 1 '), 'демо кофейня еж ул тестовая 1');
  assert.equal(normKey(null), '');

  assert.equal(dedupKey({ '2gis_id': '42', name: 'A', address: 'B' }), 'id:42');
  assert.equal(
    dedupKey({ name: 'Демо-Кофейня «Ёж»', address: 'ул. Тестовая, 1' }),
    dedupKey({ name: 'демо кофейня еж', address: 'Ул Тестовая 1' })
  );
  assert.notEqual(
    dedupKey({ name: 'Демо-Кофейня «Ёж»', address: 'ул. Тестовая, 1' }),
    dedupKey({ name: 'Демо-Кофейня «Ёж»', address: 'ул. Тестовая, 2' })
  );
});

test('dedupeRecords: first record wins, later duplicates only fill its empty fields', () => {
  const records = [
    { '2gis_id': '1', name: 'Первая', website: null, phones: [], rating: 4.5 },
    { '2gis_id': '1', name: 'Дубль', website: 'https://demo-1.example.com', phones: ['+70000000001'], rating: 3.9 },
    { '2gis_id': '2', name: 'Вторая', phones: [] },
    { name: 'Без id', address: 'ул. Тестовая, 5' },
    { name: 'без ID', address: 'Ул. Тестовая 5', website: 'https://demo-5.example.com' },
  ];
  const { unique, removed } = dedupeRecords(records);

  assert.equal(removed, 2);
  assert.deepEqual(unique.map((r) => r.name), ['Первая', 'Вторая', 'Без id']);
  assert.equal(unique[0].website, 'https://demo-1.example.com'); // gap filled from the duplicate
  assert.deepEqual(unique[0].phones, ['+70000000001']);
  assert.equal(unique[0].rating, 4.5); // existing value is not overwritten
  assert.equal(unique[2].website, 'https://demo-5.example.com');
});
