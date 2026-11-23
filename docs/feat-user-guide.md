# feat: in-app user guide (מדריך)

A `/help` page, for admin and logistics only, that explains how to work with the app in plain Hebrew: signing a 1008, returns, enlisting, אפסון, the evening summary and count, attendance, service periods, and (admin only) catalog, kits, intake, naming, users, backups, plus two-step sign-in.

## Shape
- **Content is data:** `apps/web/src/i18n/guide.ts` holds one typed topic per screen: a one-line purpose, 3–7 steps, optional tips and warnings, and the route it describes. The page (`features/help/HelpPage.tsx`) only lays it out, so editing the guide never means touching a component.
- **Page:** search (runs on every key, it is local), a "typical day" strip linking into topics, topics grouped and collapsible, deep links like `/help#kits`, and an "open this screen" link on each topic.
- **Who sees what:** topics are `staff` or `admin`. Logistics gets only topics about screens it can open; an admin sees everything, with admin-only topics tagged "מנהל בלבד". The route and the nav entry are admin + logistics; other roles are redirected.
- The ifsun rules come from `he.ifsun.rules`, so the guide and the screen cannot disagree about them.

## Keeping it true
`HelpPage.test.tsx` checks the content itself: unique ids, a known group and a route and at least one step per topic, that the typical day points at real topics, that every screen an admin can open has a topic, and that logistics never gets a topic about an admin-only screen. Adding a screen without a topic fails that test.

## Depends on
The ערכות topic describes the screen from #63 (`feat/editable-item-kits`), so this branch is stacked on it.
