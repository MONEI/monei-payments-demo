/**
 * Postcode patterns validate shape, not existence — the same thing a real store
 * does before handing the address to a carrier. NL and GB are alphanumeric, so
 * `inputmode` has to come from the format rather than being hardcoded numeric.
 */
const COUNTRIES = [
  {
    code: 'ES',
    name: 'Spain',
    postcode: /^\d{5}$/,
    example: '28001',
    samples: [
      {line1: 'Calle de Alcalá 42', city: 'Madrid', zip: '28014'},
      {line1: 'Carrer de Mallorca 401', city: 'Barcelona', zip: '08013'},
      // Canary postcodes (35xxx, 38xxx) fall in their own shipping zone.
      {line1: 'Calle del Castillo 17', city: 'Santa Cruz de Tenerife', zip: '38002'}
    ]
  },
  {
    code: 'PT',
    name: 'Portugal',
    postcode: /^\d{4}(-\d{3})?$/,
    example: '1000-001',
    samples: [
      {line1: 'Rua Augusta 24', city: 'Lisboa', zip: '1100-053'},
      {line1: 'Rua de Cedofeita 210', city: 'Porto', zip: '4050-178'}
    ]
  },
  {
    code: 'FR',
    name: 'France',
    postcode: /^\d{5}$/,
    example: '75001',
    samples: [
      {line1: '18 Rue de Rivoli', city: 'Paris', zip: '75004'},
      {line1: '7 Rue de la République', city: 'Lyon', zip: '69002'}
    ]
  },
  {
    code: 'DE',
    name: 'Germany',
    postcode: /^\d{5}$/,
    example: '10115',
    samples: [
      {line1: 'Torstraße 130', city: 'Berlin', zip: '10119'},
      {line1: 'Schellingstraße 44', city: 'München', zip: '80799'}
    ]
  },
  {
    code: 'IT',
    name: 'Italy',
    postcode: /^\d{5}$/,
    example: '00100',
    samples: [
      {line1: 'Via del Corso 88', city: 'Roma', zip: '00186'},
      {line1: 'Corso Buenos Aires 33', city: 'Milano', zip: '20124'}
    ]
  },
  {
    code: 'BE',
    name: 'Belgium',
    postcode: /^\d{4}$/,
    example: '1000',
    samples: [
      {line1: 'Rue Antoine Dansaert 62', city: 'Bruxelles', zip: '1000'},
      {line1: 'Nationalestraat 44', city: 'Antwerpen', zip: '2000'}
    ]
  },
  {
    code: 'NL',
    name: 'Netherlands',
    postcode: /^\d{4} ?[A-Z]{2}$/i,
    example: '1011 AB',
    samples: [
      {line1: 'Haarlemmerstraat 78', city: 'Amsterdam', zip: '1013 EU'},
      {line1: 'Witte de Withstraat 19', city: 'Rotterdam', zip: '3012 BL'}
    ]
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    postcode: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    example: 'SW1A 1AA',
    unserviceable: true,
    samples: [
      {line1: '55 Broadwick Street', city: 'London', zip: 'W1F 9QT'},
      {line1: '12 Deansgate', city: 'Manchester', zip: 'M3 2BW'}
    ]
  }
];

const PEOPLE = [
  {name: 'Lucía Ferrer', email: 'lucia.ferrer@example.com'},
  {name: 'Marc Oliveira', email: 'marc.oliveira@example.com'},
  {name: 'Ana Costa', email: 'ana.costa@example.com'},
  {name: 'Jonas Weber', email: 'jonas.weber@example.com'},
  {name: 'Elena Rossi', email: 'elena.rossi@example.com'},
  {name: 'Sofie Janssens', email: 'sofie.janssens@example.com'}
];

export const DEFAULT_COUNTRY = 'ES';

export const countryList = () =>
  COUNTRIES.map(({code, name, example, postcode, unserviceable, samples}) => ({
    code,
    name,
    example,
    samples,
    unserviceable: Boolean(unserviceable),
    inputmode: /[A-Z]/.test(example) ? 'text' : 'numeric',
    // The `pattern` attribute is implicitly anchored and case-sensitive, so the
    // anchors come off and a lowercase alternative goes in.
    pattern: postcode.source.replace(/^\^|\$$/g, '').replace(/A-Z/g, 'A-Za-z')
  }));

export const people = () => PEOPLE;

export const countryByCode = (code) => COUNTRIES.find((c) => c.code === code);

/** Unlisted countries accept anything non-empty rather than being rejected. */
export const isValidPostcode = (code, value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const country = countryByCode(code);
  if (!country) return true;
  return country.postcode.test(raw.toUpperCase());
};

export const normalizeCountry = (code) =>
  countryByCode(String(code ?? '').toUpperCase()) ? String(code).toUpperCase() : DEFAULT_COUNTRY;
