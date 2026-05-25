import LoadingScreen from '@/components/ui/LoadingScreen'

/**
 * App-wide loading screen — Next.js streams this while a route segment
 * is resolving (data fetches, async server components, etc.).
 *
 * Delegates to the shared <LoadingScreen /> component
 * (components/ui/LoadingScreen.tsx) so any other Suspense fallback or
 * standalone full-screen loader in the app renders the exact same
 * visuals.
 */
export default function Loading() {
  return <LoadingScreen />
}
