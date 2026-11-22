# fix/validation-implicit-conversion

**Bug (found by the hostile-input probe):** `main.ts` ran the global `ValidationPipe` with
`enableImplicitConversion: true`. That coerces a field by its TypeScript type *before* validators run, so
`{"firstName":{"$ne":null}}` became the string `"[object Object]"`, passed `@IsString`, and a soldier with that
name was saved. An array became its first element the same way. Needs a signed-in account with write access,
so low severity, but it is silent data corruption and defeats the type checks on every DTO.

**Fix:** implicit conversion is off. Query numbers/booleans were already converted explicitly in their DTOs
(`@Type`, `@Transform`); the full API suite and a live check of every list endpoint with typical parameters pass.

**Why the suite never caught it:** each e2e file built its own `ValidationPipe`, which had drifted from
`main.ts`. The pipe is now one function (`common/validation-pipe.ts`) used by `main.ts` and by the new
`validation-pipe.e2e.spec.ts`, so a test runs the production configuration.
