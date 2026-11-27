# Date inputs overflowing on iPhone

On iOS Safari a `type="date"` input is sized by its native picker and ignores the width it is given, so an empty one
spilled out of its card and overlapped its neighbour (ימי תנועות: תאריך / עד תאריך, and the same field on the mesakem
report).

- `index.css`: every date input drops the native chrome (`appearance: none`) and may shrink (`min-width: 0`,
  `max-width: 100%`); the value text is aligned to the start. The `h-11` on `TextField` stays, because an empty date
  input collapses to nothing on iOS without an explicit height.
- `DailyMovementsPage`: the two date fields each take half the row on a phone (`w-[calc(50%-0.5rem)]`) and keep
  `sm:w-44` from the tablet width up. `CountsPage` date is full width on a phone.

Verified by typecheck and the web tests only; the iOS rendering itself needs checking on a device.
