/** What the database role the API connected as can do, as far as row-level security is concerned. */
export type RlsFacts = {
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  /** Tables this role owns: an owner skips row-level security unless it is forced on the table. */
  ownedTables: string[];
  /** Tables that carry `battalion_id` but have no row-level security switched on. */
  unprotectedTables: string[];
};

/**
 * Everything wrong with the connection, as plain sentences; empty when the connection is safe to serve a
 * multi-tenant app. The API refuses to start on any of them: the whole isolation guarantee is that the
 * database filters rows, so a connection the database does not filter would silently serve every battalion
 * to every battalion.
 */
export function rlsProblems(facts: RlsFacts): string[] {
  const problems: string[] = [];
  if (facts.superuser) problems.push(`role "${facts.role}" is a superuser, so row-level security does not apply to it`);
  if (facts.bypassRls) problems.push(`role "${facts.role}" has BYPASSRLS`);
  if (facts.ownedTables.length > 0) {
    problems.push(`role "${facts.role}" owns tables (${facts.ownedTables.slice(0, 3).join(', ')}…), and an owner skips row-level security`);
  }
  if (facts.unprotectedTables.length > 0) {
    problems.push(`tables with battalion_id but no row-level security: ${facts.unprotectedTables.join(', ')}`);
  }
  return problems;
}
