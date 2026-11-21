/** Lower-cased and trimmed, so "m-4" finds "M-4". Hebrew has no case, so it passes through untouched. */
export function normalizeSearch(text: string): string {
  return text.trim().toLowerCase();
}

/** `query` must already be normalized (see `normalizeSearch`). */
export function itemMatches(item: { name: string; aliases: string[] }, query: string): boolean {
  if (!query) return true;
  return (
    item.name.toLowerCase().includes(query) || item.aliases.some((a) => a.toLowerCase().includes(query))
  );
}
