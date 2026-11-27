# Printed times and "today" follow Israel, not the server

Render runs in UTC. Three places read the server's clock instead of Israel's:

- **The 1008 print** showed the signing time two hours early (21:11 for a form signed at 23:11) and, between midnight
  and 02:00 (03:00 in summer), the previous day's date, on a document people sign.
- **The count-session print** formatted its date without a timezone.
- **`findOperationalServicePeriod`** (the gate on handing out a weapon) took "today" from the server, so a period
  starting today stayed shut, and one that ended yesterday stayed open, until 02:00-03:00 Israel time.

All three now use `Asia/Jerusalem` (the last through `israelToday()`). The rest of the app already did: Excel, אפסון,
movements, mesakem and every cron. Tests run the same assertions under UTC, New York and Jerusalem server clocks.
