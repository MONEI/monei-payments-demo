const MAX_ZIP_LENGTH = 12;

/**
 * First match wins, so specific arms come before general ones and the last arm
 * matches everything. A lookup that returned nothing would leave a wallet sheet
 * spinning, so the table must always terminate.
 */
const ZONES = [
  {id: 'unserviceable', label: 'Not served', match: {country: ['GB']}},
  {id: 'canary', label: 'Canary Islands', match: {country: 'ES', zip: /^(35|38)/}},
  {id: 'peninsula', label: 'Mainland Spain', match: {country: 'ES'}},
  {id: 'row', label: 'International', match: {}}
];

const RATES = {
  canary: [
    {id: 'canary-standard', label: 'Standard (5–8 days)', amount: 1499},
    {id: 'canary-express', label: 'Express (48 h)', amount: 2499}
  ],
  peninsula: [
    {id: 'standard', label: 'Standard (3–5 days)', amount: 499},
    {id: 'express', label: 'Express (24 h)', amount: 999},
    {id: 'pickup', label: 'Collect in store', amount: 0, type: 'PICKUP'}
  ],
  row: [{id: 'international', label: 'International (7–14 days)', amount: 1999}],
  unserviceable: []
};

const normalizeZip = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .slice(0, MAX_ZIP_LENGTH);

const countryMatches = (rule, country) => (Array.isArray(rule) ? rule.includes(country) : rule === country);

/**
 * The address arrives from a wallet mid-flow, where it is redacted: no street,
 * and often no postcode at all. Only country and zip are consulted, and a missing
 * zip must not fall through to a cheaper zone by accident.
 */
export const matchZone = (address = {}) => {
  const country = String(address.country ?? '')
    .trim()
    .toUpperCase();
  const zip = normalizeZip(address.zip);
  const spanishZip = /^\d{5}$/.test(zip);

  for (const zone of ZONES) {
    const {match} = zone;
    if (match.country !== undefined && !countryMatches(match.country, country)) continue;
    if (match.zip !== undefined) if (!spanishZip || !match.zip.test(zip)) continue;
    return zone;
  }

  return ZONES[ZONES.length - 1];
};

/** Empty means the zone is not served — distinct from "rates not looked up yet". */
export const ratesFor = (zone) => RATES[zone.id] ?? [];

export const isServiceable = (zone) => ratesFor(zone).length > 0;

/**
 * Throws on an unknown id rather than defaulting: silently picking the first rate
 * or zero would hand out free shipping to anyone who edits the request.
 */
export const rateFor = (zoneId, optionId) => {
  const rate = (RATES[zoneId] ?? []).find((r) => r.id === optionId);
  if (!rate) throw new Error(`Unknown shipping option "${optionId}" for zone "${zoneId}"`);
  return rate;
};

export const zoneIds = () => ZONES.map((z) => z.id);
