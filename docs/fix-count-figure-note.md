# fix/count-figure-note

The note above the ספירה table ("המספר הוא זה שהוזן במסכם ב-…") showed
"Invalid Date" when the sheet response had no `figureDate`. Web (Vercel) and API
(Render) deploy separately, so for a few minutes after a release the new web can
talk to the old API. The date is now parsed defensively and the note is hidden
when it is missing or invalid.
