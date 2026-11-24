# Choose which items can be stored (אפסון)

Before, only weapons, optics and drones could be stored, a fixed list in code. A soldier sometimes leaves מתפסים or a רצועה in the armory, so that could not be recorded.

- New item flag `items.ifsun_allowed` (migration `20261124090000_item_ifsun_allowed`, backfilled to true for weapon, optics and drone so nothing changes today).
- The catalog edit dialog has "אפשר לאפסן". A new item starts with it on for weapon/optics/drone, off for the rest, until the admin touches it.
- The אפסון screen, the signatures page and the server check all read the flag, not the category. `ifsun-rules.ts` is gone.
- Storing a quantity of a non-serialized item already worked (a count per signature), so מתפסים can be stored by count.
