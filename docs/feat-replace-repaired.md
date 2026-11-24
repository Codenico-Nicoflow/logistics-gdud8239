# A repaired unit that comes back as a different one

Sometimes a unit sent for repair cannot be fixed and the workshop returns another one, with another מסד.

- `POST /items/:id/replace-repaired { oldSerial, newSerial, notes? }` (admin, logistics) and `GET /items/:id/replacements`.
- Serialized item: the old instance (it must be IN_REPAIR and not held) is deleted and the new one is created as OK, so מצבה is unchanged.
- Bulk item: the old מסד leaves the repair list, the repair count drops by one, and the new מסד is registered as a unit in stock. A unit that never had a מסד can be replaced without `oldSerial`.
- Every replacement is written to `item_replacements`, append-only by DB trigger (old מסד, new מסד, who, when, note). The new instance's note says what it replaced.
- UI: "חזר מסד אחר" next to a מסד in repair, in the מסדים dialog (serialized) and in the catalog's repair list (bulk).
