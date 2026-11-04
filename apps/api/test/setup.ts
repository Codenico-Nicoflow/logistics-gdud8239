// Must be set before AppModule is imported: ThrottlerModule.forRoot reads this
// at module-evaluation time. A dedicated flag is used rather than NODE_ENV,
// because `dotenv/config` in the specs would overwrite NODE_ENV afterwards.
process.env.DISABLE_RATE_LIMIT = 'true';
