# fix: אפסון print with long unbroken text

A name, serial or note with no spaces made the table and the signature boxes wider than the
page, so part of the form was cut off when printed. Columns are now fixed-width and text wraps
anywhere. Checked by printing a record with 300-character names to PDF: one page, nothing clipped.

The count-session print was checked too: 150 items run to a second page with the signatures
intact, so no change there.
