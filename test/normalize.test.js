import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from '../src/core/normalize.js';

// Synthetic 2GIS /3.0/items record: names, phones and sites are made up.
const ctx = { niche: 'стоматологии', regionName: 'Омск', regionId: '1', rawPath: 'data/raw/x.json', point: { name: 'Центр' } };

test('normalizeItem: first real website (not a chat widget), unique phones, address and card url', () => {
  const item = {
    id: 'demo-1',
    name: 'Тестовая клиника №1',
    address_name: 'Тестовая улица, 1',
    adm_div: [{ type: 'city', name: 'Омск', city_alias: 'omsk' }],
    point: { lat: 54.98, lon: 73.37 },
    rubrics: [{ id: 1, name: 'Стоматологии', kind: 'primary' }],
    reviews: { general_rating: 4.7, general_review_count: 12 },
    contact_groups: [
      {
        contacts: [
          { type: 'website', value: 'http://link.2gis.ru/a', url: 'https://jivo.chat/demo' },
          { type: 'website', value: 'http://link.2gis.ru/b', url: 'https://clinic-1.example.com' },
          { type: 'phone', value: '+70000000001', comment: 'регистратура' },
          { type: 'phone', value: '+70000000001' },
          { type: 'email', value: 'info@clinic-1.example.com' },
          { type: 'whatsapp', value: 'https://wa.me/70000000001' },
        ],
      },
    ],
  };

  const rec = normalizeItem(item, ctx);

  assert.equal(rec['2gis_id'], 'demo-1');
  assert.equal(rec.website, 'https://clinic-1.example.com');
  assert.equal(rec.websites.length, 2);
  assert.deepEqual(rec.phones, ['+70000000001']);
  assert.deepEqual(rec.phones_detail, [{ number: '+70000000001', comment: 'регистратура' }]);
  assert.deepEqual(rec.emails, ['info@clinic-1.example.com']);
  assert.equal(rec.address, 'Омск, Тестовая улица, 1');
  assert.equal(rec.url, 'https://2gis.ru/omsk/firm/demo-1');
  assert.equal(rec.rubric_id, '1');
  assert.equal(rec.rating, 4.7);
  assert.equal(rec.reviews_count, 12);
  assert.equal(rec.zayavka_channel, 'website');
  assert.equal(rec.source_point, 'Центр');
});

test('normalizeItem: contact channel falls back website -> WhatsApp -> phone -> 2GIS card', () => {
  const base = { id: 'demo-2', name: 'Тестовая фирма' };
  const withContacts = (contacts) => normalizeItem({ ...base, contact_groups: [{ contacts }] }, ctx);

  const wa = withContacts([
    { type: 'phone', value: '+70000000002' },
    { type: 'whatsapp', value: 'https://wa.me/70000000002' },
  ]);
  assert.deepEqual([wa.zayavka_channel, wa.zayavka_link], ['whatsapp', 'https://wa.me/70000000002']);

  const phone = withContacts([{ type: 'phone', value: '+70000000002' }]);
  assert.deepEqual([phone.zayavka_channel, phone.zayavka_link], ['phone', '+70000000002']);

  const none = normalizeItem(base, ctx);
  assert.equal(none.website, null);
  assert.equal(none.zayavka_channel, '2gis');
  assert.equal(none.zayavka_link, 'https://2gis.ru/geo/firm/demo-2'); // no city -> "geo" alias
});
