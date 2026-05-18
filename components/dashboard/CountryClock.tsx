'use client'

/**
 * <CountryClock /> — the daily guess-the-country widget.
 *
 * Source: teepo-design/mockup_dashboard.html (#countryGuessForm + the
 * .mini-clock SVG above it).
 *
 * Each day picks one country deterministically (so a refresh doesn't reveal
 * the answer). The analog clock shows that country's local time via UTC
 * offset; the ring + face are tinted with the flag pattern. User types the
 * country name in Hebrew or English — match is fuzzy (substring on aliases).
 *
 * State stays local — winning doesn't propagate anywhere; tomorrow rolls a
 * new country regardless.
 */
import { useRef, useState } from 'react'
import AnalogClock from '@/components/ui/AnalogClock'
import { COUNTRIES, matchesCountry, type Country } from '@/lib/countries'
import { pickDaily } from '@/lib/daily-seed'

const TODAY_COUNTRY: Country = pickDaily(COUNTRIES)

export default function CountryClock() {
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function check() {
    if (status === 'correct') return
    if (matchesCountry(TODAY_COUNTRY, value)) {
      setStatus('correct')
      setValue(`${TODAY_COUNTRY.name} ✓`)
    } else {
      setStatus('wrong')
      // Clear the wrong state after the shake animation completes so the
      // user can keep guessing without manually resetting.
      setTimeout(() => setStatus('idle'), 400)
    }
  }

  return (
    <div className="country-clock-widget" title="זהה את המדינה לפי השעון">
      <AnalogClock
        // 42 px was too small to read the hand positions — at that size the
        // user couldn't actually tell what time the clock showed (which is
        // the whole point of the country guess). 56 px gives ~33% more
        // angular resolution per hand without disturbing the header row.
        size={56}
        utcOffset={TODAY_COUNTRY.utcOffset}
        ringColor={TODAY_COUNTRY.ringColor}
        className="mini-clock"
        faceContent={<g dangerouslySetInnerHTML={{ __html: TODAY_COUNTRY.flagSvg }} />}
      />
      <form
        className={`country-guess ${status === 'correct' ? 'correct' : ''} ${status === 'wrong' ? 'wrong' : ''}`}
        onSubmit={(e) => { e.preventDefault(); check() }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (status !== 'correct') setStatus('idle') }}
          placeholder="איזו מדינה?"
          autoComplete="off"
          disabled={status === 'correct'}
          aria-label="ניחוש המדינה"
        />
        <button type="button" onClick={check} disabled={status === 'correct'} aria-label="בדוק ניחוש">
          ✓
        </button>
      </form>
    </div>
  )
}
