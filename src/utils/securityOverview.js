export function buildSecurityOverview({
  hasSupabaseUrl,
  hasSupabaseKey,
  corsConfiguration = null,
  rateLimitConfiguration = null,
}) {
  const supabaseReady = hasSupabaseUrl && hasSupabaseKey
  const corsAvailable = Array.isArray(corsConfiguration?.allowedOrigins)
  const allowedOrigins = corsAvailable ? corsConfiguration.allowedOrigins : []
  const corsStatus = !corsAvailable
    ? 'Configuration unavailable'
    : allowedOrigins.length
      ? 'Restricted origin allowlist'
      : 'No cross-origin origins allowed'
  const corsDescription = !corsAvailable
    ? `The API's runtime CORS configuration could not be read${corsConfiguration?.reason ? `: ${corsConfiguration.reason}` : '.'} Check the API URL and health endpoint.`
    : [
      allowedOrigins.length
        ? `Allowed origins: ${allowedOrigins.join(', ')}.`
        : 'No cross-origin browser origins are allowed; configure CORS_ALLOWED_ORIGINS for production.',
      `Allowed methods: ${(corsConfiguration.allowedMethods || []).join(', ') || 'unavailable'}.`,
      `Allowed request headers: ${(corsConfiguration.allowedHeaders || []).join(', ') || 'unavailable'}.`,
      corsConfiguration.credentials ? 'Credentials are enabled.' : 'Credentials are not enabled.',
      'Requests with unapproved Origin headers are rejected.',
    ].join(' ')
  const rateLimitAvailable = typeof rateLimitConfiguration?.configured === 'boolean'
    && typeof rateLimitConfiguration?.operational === 'boolean'
  const rateLimitStatus = !rateLimitAvailable
    ? 'Configuration unavailable'
    : !rateLimitConfiguration.configured || !rateLimitConfiguration.operational
      ? 'Unavailable'
      : rateLimitConfiguration.distributed
        ? 'Operational (shared storage)'
        : 'Operational (single instance only)'
  const rateLimitDescription = !rateLimitAvailable
    ? 'The API runtime rate-limit status could not be read. Check the API URL, health endpoint, and rate-limit storage migration.'
    : [
      rateLimitConfiguration.configured
        ? `Rate limiting is enabled with ${rateLimitConfiguration.storage || 'unknown'} storage.`
        : 'Rate limiting is not configured.',
      rateLimitConfiguration.operational
        ? 'The rate-limit storage health check is passing.'
        : `The rate-limit storage health check is failing${rateLimitConfiguration.lastErrorCode ? ` (${rateLimitConfiguration.lastErrorCode})` : ''}.`,
      rateLimitConfiguration.distributed
        ? 'Limits are shared across API instances.'
        : 'This storage is per-instance and is suitable only for local development or health probes.',
      'Sign-in, registration, password-reset, and direct Supabase Storage requests bypass this Node API and rely on Supabase project-level controls.',
    ].join(' ')
  const checks = [
    {
      key: 'authentication',
      label: 'Authentication',
      status: supabaseReady ? 'Configured' : 'Needs configuration',
      tone: supabaseReady ? 'green' : 'red',
      description: supabaseReady
        ? 'Supabase URL and a supported public client key are configured. This page does not test sign-in availability.'
        : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the supported VITE_SUPABASE_ANON_KEY fallback).',
    },
    {
      key: 'authorization',
      label: 'Admin access & database policies',
      status: 'Configured in application',
      tone: 'blue',
      description: 'Admin routes use authenticated and role-aware guards; database access relies on the admin RLS policies. Runtime policy enforcement is not tested here.',
    },
    {
      key: 'api',
      label: 'API cross-origin access',
      status: corsStatus,
      tone: !corsAvailable || !allowedOrigins.length ? 'amber' : 'green',
      description: corsDescription,
    },
    {
      key: 'abuse-protection',
      label: 'API rate limiting',
      status: rateLimitStatus,
      tone: !rateLimitAvailable || !rateLimitConfiguration.configured || !rateLimitConfiguration.operational
        ? 'red'
        : rateLimitConfiguration.distributed ? 'green' : 'amber',
      description: rateLimitDescription,
    },
    {
      key: 'supabase-auth-rate-limits',
      label: 'Supabase Auth request limits',
      status: 'Not verified',
      tone: 'amber',
      description: 'Sign-in, registration, password-reset, and password-update requests go directly to Supabase Auth. Review their project-level limits in Supabase Dashboard > Authentication > Rate Limits; the browser client cannot inspect that configuration.',
    },
    {
      key: 'secrets',
      label: 'Client credentials',
      status: 'Public key only',
      tone: 'blue',
      description: 'The browser uses a Supabase publishable/anon key. Server-side secrets are not inspected by this client-side overview.',
    },
  ]

  return {
    checks,
    generatedAt: new Date().toISOString(),
    note: 'Repository configuration summary only; this is not a penetration test or live infrastructure audit.',
    controls: [
      'ProtectedRoute requires an authenticated session before private routes render.',
      'RoleRoute restricts Admin pages to profiles with the admin role.',
      'Supabase RLS policies are defined for admin access in the database migrations.',
      'The browser uses a publishable/anon key; never put a service-role key in frontend configuration.',
    ],
  }
}
