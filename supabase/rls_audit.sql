-- ============================================================================
-- SmartDesk — RLS audit (run in Supabase SQL editor)
-- Verifies that every user-scoped table has RLS enabled + a policy.
-- Any row in the "BAD" columns = a security hole.
-- ============================================================================

-- 1) RLS enabled on all user-data tables?
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'BAD — enable RLS' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2) Tables with RLS enabled but NO policies (= locked out entirely, usually a bug)
SELECT
  c.relname AS table_name,
  COUNT(p.polname) AS policy_count,
  CASE
    WHEN c.relrowsecurity AND COUNT(p.polname) = 0 THEN 'BAD — RLS on, zero policies'
    WHEN NOT c.relrowsecurity THEN 'BAD — RLS off'
    ELSE 'OK'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY status DESC, c.relname;

-- 3) Full policy listing (review every row — each USING expression is your access rule)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4) Sanity: service_role bypass check
-- (Service role bypasses RLS by design — confirm service key is NEVER exposed client-side.)
SELECT 'Reminder: SUPABASE_SERVICE_ROLE_KEY must live only in backend env. Never in frontend.' AS reminder;
