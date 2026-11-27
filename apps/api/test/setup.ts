// Must be set before AppModule is imported: ThrottlerModule.forRoot reads this
// at module-evaluation time. A dedicated flag is used rather than NODE_ENV,
// because `dotenv/config` in the specs would overwrite NODE_ENV afterwards.
process.env.DISABLE_RATE_LIMIT = 'true';

// Fixtures are written by test code that runs outside any request, so with no battalion in scope the
// restricted database role would see and create nothing. Serve 8239 to that code; anything inside a request
// still gets exactly the battalion its token names, and the isolation specs construct their own pool with
// no fallback at all.
process.env.TENANT_FALLBACK_BATTALION_ID = '00000000-0000-4000-8000-000000008239';
