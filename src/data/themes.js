/**
 * `card` is passed to the Components as `style` and `fonts` (see `CardInputStyle`
 * in the monei.js reference). The `--monei-*` CSS variables are not a merchant
 * API — the iframes set those on themselves from `style.base` — so theming has to
 * go through these props.
 *
 * `page` drives this store's own markup and nothing else. `cardUi` picks which
 * card component the theme mounts: one iframe, or three the merchant places.
 */
export const THEME_DATA = {
  aurora: {
    label: 'Aurora',
    tagline: "MONEI's own type: Montserrat, with Fira Code for numbers",
    cardUi: 'input',
    page: {
      body: 'bg-[#fbfaff] text-[#241c33]',
      accent: '#8961A5',
      accentHover: '#74508D',
      muted: 'text-[#6b6480]',
      surface: 'bg-white',
      border: 'border-[#e8e3f5]',
      radius: 'rounded-xl',
      heading: 'font-semibold tracking-tight',
      fontFamily: '"Montserrat", ui-sans-serif, system-ui, sans-serif',
      numerals: '"Fira Code", ui-monospace, monospace'
    },
    card: {
      style: {
        base: {
          color: '#241c33',
          // Card entry is digits, and the brand pairs its numerals with Fira Code.
          fontFamily: '"Fira Code", ui-monospace, monospace',
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
      // The card fields live in a cross-origin iframe that fetches this itself, and
      // it only reliably picks up a Google-hosted sheet. The page's own copy is
      // self-hosted and preloaded, which is what removes the flash on first paint.
      fonts: [
        {
          cssSrc:
            'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap'
        }
      ],
      preload: ['montserrat-400-latin.woff2', 'montserrat-600-latin.woff2', 'fira-code-400-latin.woff2']
    }
  },

  monoline: {
    label: 'Monoline',
    tagline: 'Sharp corners, three card fields the merchant places',
    cardUi: 'parts',
    page: {
      body: 'bg-[#f7f6f3] text-[#14110f]',
      accent: '#14110f',
      // Near-black cannot darken on hover, so it lifts instead.
      accentHover: '#3a3330',
      muted: 'text-[#6f6a63]',
      surface: 'bg-white',
      border: 'border-[#ddd8d0]',
      radius: 'rounded-none',
      heading: 'font-medium tracking-tight',
      fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif'
    },
    card: {
      style: {
        base: {
          color: '#14110f',
          fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
          fontSize: '15px',
          borderRadius: '0'
        },
        input: {
          '::placeholder': {color: '#a8a29a'}
        },
        invalid: {
          color: '#a61b3c'
        }
      },
      fonts: [{cssSrc: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap'}],
      preload: ['outfit-400-latin.woff2', 'outfit-500-latin.woff2']
    }
  }
};

export const themeFor = (name) => THEME_DATA[name] ?? THEME_DATA.aurora;
