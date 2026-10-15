import { nowIso } from '../util.js';

const MESSENGERS = new Set(['whatsapp', 'telegram', 'viber', 'max', 'skype']);
const SOCIALS = {
  vkontakte: 'vk',
  instagram: 'instagram',
  facebook: 'facebook',
  odnoklassniki: 'ok',
  youtube: 'youtube',
  twitter: 'twitter',
  tiktok: 'tiktok',
};

// Домены, которые 2ГИС отдаёт как «website», но сайтом компании не являются:
// виджеты чата/записи, мессенджеры, соцсети, агрегаторы. Если первый «сайт» в
// карточке — jivo.chat или booking.medflex.ru, настоящий домен шёл вторым и терялся
// (такое встречалось в реальных выгрузках). Теперь берём первый НАСТОЯЩИЙ.
const NON_SITE_HOST = /(?:^|\.)(jivo\.ru|jivo\.chat|jivosite\.com|medflex\.ru|max\.ru|t\.me|telegram\.me|vk\.com|vk\.me|wa\.me|whatsapp\.com|prodoctorov\.ru|yclients\.com|dikidi\.net|dikidi\.ru|taplink\.cc|taplink\.ws|instagram\.com|ok\.ru|youtube\.com|2gis\.ru|2gis\.com|zoon\.ru|yandex\.ru|google\.com|avito\.ru|flamp\.ru|napopravku\.ru|docdoc\.ru|sberhealth\.ru)$/i;

function hostOf(u) {
  try {
    const s = String(u || '').trim();
    return new URL(/^https?:\/\//i.test(s) ? s : 'http://' + s).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// Pull every contact channel out of contact_groups. For websites the clean URL
// is in `url` (`value` is a link.2gis.ru redirect); messengers/socials carry a
// clean deep-link in `url`/`value` (e.g. wa.me/..., t.me/...).
function extractContacts(item) {
  const phones = [];
  const phonesDetail = [];
  const emails = [];
  const websites = [];
  const messengers = {};
  const socials = {};

  for (const g of item.contact_groups || []) {
    for (const c of g.contacts || []) {
      const val = c.value;
      const link = c.url || c.value;
      switch (c.type) {
        case 'phone':
          if (val) {
            phones.push(val);
            // комментарий 2ГИС к номеру («регистратура», «единая справочная: пн-пт 8:00-20:00»)
            // — подсказка, какой номер главный и когда он живой
            phonesDetail.push({ number: val, comment: c.comment || g.comment || null });
          }
          break;
        case 'email':
          if (val) emails.push(val);
          break;
        case 'website': {
          const w = c.url || c.text || val;
          if (w && !websites.includes(w)) websites.push(w);
          break;
        }
        default:
          if (MESSENGERS.has(c.type)) {
            if (!messengers[c.type]) messengers[c.type] = link;
          } else if (SOCIALS[c.type]) {
            const key = SOCIALS[c.type];
            if (!socials[key]) socials[key] = link;
          }
      }
    }
  }

  const realSites = websites.filter((w) => !NON_SITE_HOST.test(hostOf(w)));
  const seenNumbers = new Set();
  return {
    phones: [...new Set(phones)],
    phones_detail: phonesDetail.filter((p) => {
      if (seenNumbers.has(p.number)) return false;
      seenNumbers.add(p.number);
      return true;
    }),
    emails: [...new Set(emails)],
    website: realSites[0] || websites[0] || null,
    websites,
    messengers,
    socials,
  };
}

// Single recommended channel to leave a test заявка (request):
// website form -> WhatsApp -> Telegram -> MAX -> phone -> the 2GIS card.
function testRequest({ website, messengers, phones }, twogisUrl) {
  if (website) return { channel: 'website', link: website };
  if (messengers.whatsapp) return { channel: 'whatsapp', link: messengers.whatsapp };
  if (messengers.telegram) return { channel: 'telegram', link: messengers.telegram };
  if (messengers.max) return { channel: 'max', link: messengers.max };
  if (phones.length) return { channel: 'phone', link: phones[0] };
  return { channel: '2gis', link: twogisUrl };
}

function cityDiv(item) {
  const divs = item.adm_div || [];
  return divs.find((d) => d.type === 'city') || divs.find((d) => d.city_alias) || null;
}

function buildAddress(item) {
  const parts = [];
  const city = cityDiv(item);
  if (city?.name) parts.push(city.name);
  if (item.address_name) parts.push(item.address_name);
  else if (item.address?.components?.length) {
    const c = item.address.components[0];
    parts.push([c.street, c.number].filter(Boolean).join(', '));
  }
  return parts.join(', ');
}

function buildUrl(item) {
  const alias = cityDiv(item)?.city_alias || 'geo';
  return `https://2gis.ru/${alias}/firm/${item.id}`;
}

function primaryRubric(item) {
  const r = item.rubrics || [];
  return r.find((x) => x.kind === 'primary') || r[0] || null;
}

/**
 * Map a raw 2GIS item to our flat record with full contact channels.
 * ctx: { niche, fallbackRubricId, regionName, regionId, rawPath, point }
 */
export function normalizeItem(item, ctx) {
  const contacts = extractContacts(item);
  const url = buildUrl(item);
  const zr = testRequest(contacts, url);
  const rub = primaryRubric(item);
  const reviews = item.reviews || {};
  const fullName = item.name_ex?.primary
    ? [item.name_ex.primary, item.name_ex.extension].filter(Boolean).join(', ')
    : item.name || '';

  return {
    niche: ctx.niche,
    rubric_id: rub ? String(rub.id) : ctx.fallbackRubricId ?? null,
    rubric_name: rub?.name ?? null,
    region_name: ctx.regionName,
    region_id: ctx.regionId,
    '2gis_id': item.id ? String(item.id) : null,
    name: item.name || item.name_ex?.primary || '',
    full_name: fullName,
    address: buildAddress(item),
    lat: item.point?.lat ?? null,
    lon: item.point?.lon ?? null,
    url,
    website: contacts.website,
    websites: contacts.websites,
    phones: contacts.phones,
    phones_detail: contacts.phones_detail,
    emails: contacts.emails,
    whatsapp: contacts.messengers.whatsapp || null,
    telegram: contacts.messengers.telegram || null,
    viber: contacts.messengers.viber || null,
    max: contacts.messengers.max || null,
    vk: contacts.socials.vk || null,
    socials: contacts.socials,
    zayavka_channel: zr.channel,
    zayavka_link: zr.link,
    rating: reviews.general_rating ?? reviews.org_rating ?? null,
    reviews_count: reviews.general_review_count ?? reviews.org_review_count ?? null,
    schedule: item.schedule || null,
    raw_json_path: ctx.rawPath,
    collected_at: nowIso(),
    source_point: ctx.point?.name || null,
  };
}
