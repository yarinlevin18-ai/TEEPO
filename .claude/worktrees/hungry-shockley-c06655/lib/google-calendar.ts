/**
 * Google Calendar API helper
 * Uses the provider_token from Supabase Google OAuth session
 */

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
  htmlLink?: string
  location?: string
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/**
 * Fetch events from Google Calendar for a given time range.
 * If a refreshToken callback is provided and the token is expired (401),
 * it will try to refresh and retry once before throwing.
 */
export async function fetchCalendarEvents(
  providerToken: string,
  timeMin: string,
  timeMax: string,
  refreshToken?: () => Promise<string | null>,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const url = `${CALENDAR_API}/calendars/primary/events?${params}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${providerToken}` },
  })

  if (res.ok) {
    const data = await res.json()
    return data.items || []
  }

  // Token expired — try to refresh and retry once
  if (res.status === 401 && refreshToken) {
    const freshToken = await refreshToken()
    if (freshToken && freshToken !== providerToken) {
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${freshToken}` },
      })
      if (retry.ok) {
        const data = await retry.json()
        return data.items || []
      }
    }
    throw new Error('TOKEN_EXPIRED')
  }

  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  throw new Error(`Calendar API error: ${res.status}`)
}

/**
 * Get events for the current week (Sunday to Saturday)
 */
export async function getWeekEvents(providerToken: string): Promise<GoogleCalendarEvent[]> {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - dayOfWeek)
  sunday.setHours(0, 0, 0, 0)

  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  saturday.setHours(23, 59, 59, 999)

  return fetchCalendarEvents(
    providerToken,
    sunday.toISOString(),
    saturday.toISOString(),
  )
}

/**
 * Get events for today
 */
export async function getTodayEvents(providerToken: string): Promise<GoogleCalendarEvent[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  return fetchCalendarEvents(
    providerToken,
    today.toISOString(),
    tomorrow.toISOString(),
  )
}

/**
 * Get the event time as a readable string
 */
export function formatEventTime(event: GoogleCalendarEvent): string {
  const start = event.start.dateTime || event.start.date
  if (!start) return ''

  if (event.start.date && !event.start.dateTime) {
    return 'כל היום'
  }

  const date = new Date(start)
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Get event color based on colorId
 */
export function getEventColor(colorId?: string): { bg: string; text: string; border: string } {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    '1':  { bg: 'rgba(121,134,203,0.15)', text: '#7986CB', border: 'rgba(121,134,203,0.3)' }, // Lavender
    '2':  { bg: 'rgba(51,182,121,0.15)',  text: '#33B679', border: 'rgba(51,182,121,0.3)' },  // Sage
    '3':  { bg: 'rgba(142,36,170,0.15)',  text: '#8E24AA', border: 'rgba(142,36,170,0.3)' },  // Grape
    '4':  { bg: 'rgba(224,82,101,0.15)',  text: '#E06055', border: 'rgba(224,82,101,0.3)' },  // Flamingo
    '5':  { bg: 'rgba(246,191,38,0.15)',  text: '#F6BF26', border: 'rgba(246,191,38,0.3)' },  // Banana
    '6':  { bg: 'rgba(244,129,36,0.15)',  text: '#F4511E', border: 'rgba(244,129,36,0.3)' },  // Tangerine
    '7':  { bg: 'rgba(3,155,229,0.15)',   text: '#039BE5', border: 'rgba(3,155,229,0.3)' },   // Peacock
    '8':  { bg: 'rgba(97,97,97,0.15)',    text: '#616161', border: 'rgba(97,97,97,0.3)' },    // Graphite
    '9':  { bg: 'rgba(63,81,181,0.15)',   text: '#3F51B5', border: 'rgba(63,81,181,0.3)' },   // Blueberry
    '10': { bg: 'rgba(11,128,67,0.15)',   text: '#0B8043', border: 'rgba(11,128,67,0.3)' },   // Basil
    '11': { bg: 'rgba(213,0,0,0.15)',     text: '#D50000', border: 'rgba(213,0,0,0.3)' },     // Tomato
  }
  return colors[colorId || ''] || { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' }
}
