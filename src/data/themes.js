/**
 * `card` is passed to the Components as `style` and `fonts` (see `CardInputStyle`
 * in the monei.js reference). The `--monei-*` CSS variables are not a merchant
 * API — the iframes set those on themselves from `style.base` — so theming has to
 * go through these props.
 *
 * `page` drives this store's own markup and nothing else.
 */
export const THEME_DATA = {
  aurora: {
    label: 'Aurora',
    tagline: 'Modern, soft, generous whitespace',
    page: {
      body: 'bg-[#fbfaff] text-[#241c33]',
      accent: '#6d4aff',
      muted: 'text-[#6b6480]',
      surface: 'bg-white',
      border: 'border-[#e8e3f5]',
      radius: 'rounded-xl',
      heading: 'font-semibold tracking-tight',
      fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif'
    },
    card: {
      style: {
        base: {
          color: '#241c33',
          fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
          fontSize: '16px',
          borderRadius: '12px'
        },
        input: {
          '::placeholder': {color: '#a49cbb'}
        },
        invalid: {
          color: '#c2255c'
        }
      },
      fonts: [{cssSrc: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap'}]
    }
  }
};

export const themeFor = (name) => THEME_DATA[name] ?? THEME_DATA.aurora;
