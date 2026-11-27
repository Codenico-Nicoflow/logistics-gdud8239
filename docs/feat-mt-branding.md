# Multi-tenant step 3: branding

One deployment serves several battalions, so nothing the app shows or prints may assume 8239.

## What changed

- **Login and setup pages** are redesigned (`features/auth/AuthLayout.tsx`): a dark split-screen on wide
  screens, a brand band with the form card sliding over it on a phone. Staggered entrance, slowly turning
  dial rings, drifting light; `prefers-reduced-motion` turns it all off. Before sign-in nobody has said which
  battalion they belong to, so these screens show the platform's own mark (three chevrons) and the product
  name only. No battalion name or number.
- **The signed-in app** shows the battalion's own name and logo (`BattalionMark`). Until a logo is uploaded
  it is the same medallion as before, engraved with that battalion's number, so 8239 looks unchanged.
- **Logo upload**: מערכת ← זהות הגדוד (admin). PNG or JPEG, up to 512KB, stored in `battalions.logo_data`
  so it needs no file storage and is part of every backup. The type is taken from the file's own header,
  not the client's claim, and SVG is refused (it can carry script and is served from our origin).
  `GET /battalion` returns name, number, `hasLogo`, `logoVersion`; `GET /battalion/logo` serves the
  picture (behind the sign-in; the version in the query string lets the browser cache it for good).
- **Printed output names the battalion it belongs to**: the 1008, the count sheet, אפסון, the weekly
  attendance PDF and every Excel workbook (title banner and print footer) read the name from the
  signed-in battalion through `BattalionService.unit()`. The Excel helpers read it from the workbook's
  `company` property, set where the workbook is created.
- **MFA label** in the authenticator app is `Logistics <number>`, so a person with two battalions' accounts
  can tell them apart. Existing enrolments keep working (the label is display only).
- **Installed app** (manifest, `index.html`, home-screen icon) is generic: "לוגיסטיקה גדודית", icon without a
  number.

## Renaming the Vercel project

No URL is hardcoded in the repo, so this is configuration only:

1. Vercel → the project → Settings → rename it (and the domain, if you use a custom one).
2. Render → the API service → set `WEB_ORIGIN` to the new web address, then redeploy. The API refuses
   browser writes from any other origin, so skipping this makes every login fail.
3. People who installed the app on a phone should remove it and add it again from the new address.

## Not in this step

- The name and number of a battalion are fixed at creation (step 4 adds creating battalions).
- The logo is not printed on the forms, only the name and number.
- Slack and backups per battalion are step 6.
