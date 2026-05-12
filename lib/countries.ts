/**
 * Country DB for the daily <CountryClock /> guess game.
 *
 * Ported verbatim from teepo-design/mockup_dashboard.html (the COUNTRIES + FLAGS
 * objects, ~lines 1496-1579 in the mockup). Each country carries:
 *   - name      → Hebrew display name (also stored in `aliases` for matching)
 *   - aliases   → case-insensitive substrings the guess input matches against
 *   - utcOffset → integer or fractional UTC hour offset, used to drive the
 *                 analog clock hands
 *   - ringColor → outer clock ring fill (usually a flag accent)
 *   - flagSvg   → SVG inner markup drawn behind the clock face (clipped to
 *                 a 100×100 circle by the parent <AnalogClock />)
 *
 * Refresh-safety: pick by `pickDaily()` so a reload doesn't reveal the answer.
 */

export interface Country {
  name: string
  aliases: string[]
  utcOffset: number
  ringColor: string
  flagSvg: string
}

export const COUNTRIES: readonly Country[] = [
  {
    name: 'יפן',
    aliases: ['japan', 'יפן'],
    utcOffset: 9,
    ringColor: '#bc002d',
    flagSvg: '<rect width="100" height="100" fill="#ffffff"/><circle cx="50" cy="50" r="26" fill="#bc002d"/>',
  },
  {
    name: 'צרפת',
    aliases: ['france', 'צרפת'],
    utcOffset: 2,
    ringColor: '#002395',
    flagSvg: '<rect x="0" width="33.34" height="100" fill="#002395"/><rect x="33.33" width="33.34" height="100" fill="#ffffff"/><rect x="66.66" width="33.34" height="100" fill="#ed2939"/>',
  },
  {
    name: 'איטליה',
    aliases: ['italy', 'איטליה'],
    utcOffset: 2,
    ringColor: '#008c45',
    flagSvg: '<rect x="0" width="33.34" height="100" fill="#008c45"/><rect x="33.33" width="33.34" height="100" fill="#ffffff"/><rect x="66.66" width="33.34" height="100" fill="#cd212a"/>',
  },
  {
    name: 'ברזיל',
    aliases: ['brazil', 'ברזיל'],
    utcOffset: -3,
    ringColor: '#009c3b',
    flagSvg: '<rect width="100" height="100" fill="#009c3b"/><polygon points="50,12 90,50 50,88 10,50" fill="#ffdf00"/><circle cx="50" cy="50" r="17" fill="#002776"/>',
  },
  {
    name: 'הודו',
    aliases: ['india', 'הודו'],
    utcOffset: 5.5,
    ringColor: '#ff9933',
    flagSvg: '<rect width="100" height="33.4" fill="#ff9933"/><rect y="33.3" width="100" height="33.4" fill="#ffffff"/><rect y="66.6" width="100" height="33.4" fill="#138808"/><circle cx="50" cy="50" r="9" fill="none" stroke="#000080" stroke-width="1.5"/>',
  },
  {
    name: 'מקסיקו',
    aliases: ['mexico', 'מקסיקו'],
    utcOffset: -6,
    ringColor: '#006847',
    flagSvg: '<rect x="0" width="33.34" height="100" fill="#006847"/><rect x="33.33" width="33.34" height="100" fill="#ffffff"/><rect x="66.66" width="33.34" height="100" fill="#ce1126"/>',
  },
  {
    name: 'גרמניה',
    aliases: ['germany', 'גרמניה'],
    utcOffset: 2,
    ringColor: '#000000',
    flagSvg: '<rect width="100" height="33.4" fill="#000000"/><rect y="33.3" width="100" height="33.4" fill="#dd0000"/><rect y="66.6" width="100" height="33.4" fill="#ffce00"/>',
  },
  {
    name: 'אוסטרליה',
    aliases: ['australia', 'אוסטרליה'],
    utcOffset: 10,
    ringColor: '#012169',
    flagSvg: '<rect width="100" height="100" fill="#012169"/><path d="M0 0 L50 50 M50 0 L0 50" stroke="#ffffff" stroke-width="7"/><path d="M0 0 L50 50 M50 0 L0 50" stroke="#e4002b" stroke-width="3.5"/><path d="M25 0 L25 50 M0 25 L50 25" stroke="#ffffff" stroke-width="9"/><path d="M25 0 L25 50 M0 25 L50 25" stroke="#e4002b" stroke-width="5"/><circle cx="72" cy="78" r="3.5" fill="#ffffff"/><circle cx="86" cy="62" r="2" fill="#ffffff"/><circle cx="76" cy="33" r="2" fill="#ffffff"/><circle cx="60" cy="60" r="2" fill="#ffffff"/>',
  },
  {
    name: 'קנדה',
    aliases: ['canada', 'קנדה'],
    utcOffset: -4,
    ringColor: '#d52b1e',
    flagSvg: '<rect width="100" height="100" fill="#ffffff"/><rect x="0" width="25" height="100" fill="#d52b1e"/><rect x="75" width="25" height="100" fill="#d52b1e"/><path d="M50 25 L54 38 L66 36 L62 47 L70 55 L60 56 L62 66 L54 60 L50 72 L46 60 L38 66 L40 56 L30 55 L38 47 L34 36 L46 38 Z" fill="#d52b1e"/>',
  },
  {
    name: 'סין',
    aliases: ['china', 'סין'],
    utcOffset: 8,
    ringColor: '#de2910',
    flagSvg: '<rect width="100" height="100" fill="#de2910"/><polygon points="25,18 28,28 38,28 30,34 33,44 25,38 17,44 20,34 12,28 22,28" fill="#ffde00"/><circle cx="44" cy="14" r="2.5" fill="#ffde00"/><circle cx="52" cy="22" r="2.5" fill="#ffde00"/><circle cx="52" cy="32" r="2.5" fill="#ffde00"/><circle cx="44" cy="40" r="2.5" fill="#ffde00"/>',
  },
  {
    name: 'אנגליה',
    aliases: ['uk', 'england', 'אנגליה', 'בריטניה'],
    utcOffset: 1,
    ringColor: '#012169',
    flagSvg: '<rect width="100" height="100" fill="#012169"/><path d="M0 0 L100 100 M100 0 L0 100" stroke="#ffffff" stroke-width="14"/><path d="M0 0 L100 100 M100 0 L0 100" stroke="#c8102e" stroke-width="6"/><path d="M50 0 L50 100 M0 50 L100 50" stroke="#ffffff" stroke-width="22"/><path d="M50 0 L50 100 M0 50 L100 50" stroke="#c8102e" stroke-width="13"/>',
  },
  {
    name: 'ספרד',
    aliases: ['spain', 'ספרד'],
    utcOffset: 2,
    ringColor: '#aa151b',
    flagSvg: '<rect y="0" width="100" height="25" fill="#aa151b"/><rect y="25" width="100" height="50" fill="#f1bf00"/><rect y="75" width="100" height="25" fill="#aa151b"/>',
  },
  {
    name: 'ארגנטינה',
    aliases: ['argentina', 'ארגנטינה'],
    utcOffset: -3,
    ringColor: '#74acdf',
    flagSvg: '<rect width="100" height="33.4" fill="#74acdf"/><rect y="33.3" width="100" height="33.4" fill="#ffffff"/><rect y="66.6" width="100" height="33.4" fill="#74acdf"/><circle cx="50" cy="50" r="6" fill="#fcbf49"/>',
  },
  {
    name: 'דרום אפריקה',
    aliases: ['south africa', 'דרום אפריקה'],
    utcOffset: 2,
    ringColor: '#007a4d',
    flagSvg: '<rect width="100" height="100" fill="#ffffff"/><polygon points="0,0 100,0 100,30 30,50 100,70 100,100 0,100" fill="#007a4d"/><polygon points="0,0 40,50 0,100" fill="#000000"/><rect y="0" width="100" height="22" fill="#de3831"/><rect y="78" width="100" height="22" fill="#001489"/><polygon points="0,22 32,50 0,78 0,22" fill="#ffb612"/><polygon points="0,30 25,50 0,70 0,30" fill="#000000"/><polygon points="42,50 100,30 100,70" fill="#ffffff"/><polygon points="42,50 100,38 100,62" fill="#007a4d"/>',
  },
  {
    name: 'תאילנד',
    aliases: ['thailand', 'תאילנד'],
    utcOffset: 7,
    ringColor: '#a51931',
    flagSvg: '<rect y="0" width="100" height="16.7" fill="#a51931"/><rect y="16.7" width="100" height="16.7" fill="#f4f5f8"/><rect y="33.4" width="100" height="33.3" fill="#2d2a4a"/><rect y="66.7" width="100" height="16.7" fill="#f4f5f8"/><rect y="83.4" width="100" height="16.6" fill="#a51931"/>',
  },
  {
    name: 'רוסיה',
    aliases: ['russia', 'רוסיה'],
    utcOffset: 3,
    ringColor: '#0039a6',
    flagSvg: '<rect y="0" width="100" height="33.4" fill="#ffffff"/><rect y="33.3" width="100" height="33.4" fill="#0039a6"/><rect y="66.6" width="100" height="33.4" fill="#d52b1e"/>',
  },
]

/** Case-insensitive substring match against any of a country's aliases. */
export function matchesCountry(country: Country, guess: string): boolean {
  const v = guess.trim().toLowerCase()
  if (!v) return false
  return country.aliases.some(a => {
    const al = a.toLowerCase()
    return v === al || v.includes(al) || al.includes(v)
  })
}
