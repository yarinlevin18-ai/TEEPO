'use client'

/**
 * useQuizApi — authenticated POST helper for the /api/quiz/* routes.
 *
 * Sends the Google access token as the Bearer credential (the routes use it
 * as their auth gate) and retries once with a refreshed token on 401.
 * Under the dev auth bypass the fake token is sent as-is — the routes
 * accept it because they apply the same bypass check server-side.
 */

import { useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'

export function useQuizApi() {
  const { googleToken, refreshGoogleToken } = useAuth()

  return useCallback(async (url: string, body: unknown): Promise<Response> => {
    let token = googleToken || (await refreshGoogleToken())
    if (!token) throw new Error('לא מחובר ל-Google — התחבר מחדש ונסה שוב')
    const doPost = (t: string) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    })
    let res = await doPost(token)
    if (res.status === 401) {
      token = await refreshGoogleToken()
      if (token) res = await doPost(token)
    }
    return res
  }, [googleToken, refreshGoogleToken])
}
