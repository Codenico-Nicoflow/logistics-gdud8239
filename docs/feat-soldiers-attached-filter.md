# חיילים: "מסופחים בלבד" filter (feat/soldiers-attached-filter)

A checkbox next to "חסרי פרטים" on the soldiers list narrows it to מסופחים. The filter runs on the server (`attachedOnly=true` on `GET /soldiers`), like the other roster filters, so the count reflects the whole roster, not just the rows already loaded. Test in `soldiers.e2e.spec.ts`.
