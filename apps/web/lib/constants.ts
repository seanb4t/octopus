export const DISCORD_INVITE_URL = "https://discord.gg/qyuWTXghbS";
// Max organizations a single user can own. Server-runtime configurable via
// MAX_OWNED_ORGS_PER_USER (default 3). A value <= 0 disables the limit
// (unlimited). Read server-side in canUserCreateOrg; the client import is
// cosmetic copy only (shown via the server-provided canCreateOrg prop).
export const MAX_OWNED_ORGS_PER_USER = Number(process.env.MAX_OWNED_ORGS_PER_USER ?? 3);

/**
 * Single source of truth for the owned-org limit rule: true when a user who
 * already owns `ownedCount` organizations is at/over the cap. `max <= 0` means
 * unlimited (the limit is never reached). Used by `canUserCreateOrg` AND by the
 * atomic TOCTOU re-checks inside `createOrganization` / `createOrgForUser`, so
 * the unlimited sentinel cannot drift between call sites (a direct
 * `ownedCount >= max` comparison wrongly rejects everything when `max === 0`).
 */
export function orgLimitReached(
  ownedCount: number,
  max: number = MAX_OWNED_ORGS_PER_USER,
): boolean {
  return max > 0 && ownedCount >= max;
}
