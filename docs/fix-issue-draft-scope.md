# ניפוק drafts are per battalion and per person

The unsigned basket kept on the device (so a reload or a stray tap does not cost the operator the basket) lived under
one browser key, `issue-drafts-v1`. With two battalions on one deployment that meant switching into another battalion
(the platform admin acting as 5033), or another operator picking up the same tablet, resumed the last basket: a
soldier of the wrong battalion on screen, and a submit that could only fail.

Drafts are now stored under `issue-drafts-v1:<battalionId>:<userId>` (`draftScope`). Until the signed-in person is known
nothing is read or written. The old shared key is removed the first time a draft is read: its contents belonged to no
one in particular, and drafts expire after a day anyway.

Nothing crossed the database; this was only what the screen showed. Tests: `issueDraft.test.ts` (other battalion, other
operator, nobody known, legacy key) and `IssuePage.resume.test.tsx` (a basket saved for another battalion is not resumed).
