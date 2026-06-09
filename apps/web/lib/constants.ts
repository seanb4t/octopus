export const DISCORD_INVITE_URL = "https://discord.gg/qyuWTXghbS";
// Max organizations a single user can own. Server-runtime configurable via
// MAX_OWNED_ORGS_PER_USER (default 3). A value <= 0 disables the limit
// (unlimited). Read server-side in canUserCreateOrg; the client import is
// cosmetic copy only (shown via the server-provided canCreateOrg prop).
export const MAX_OWNED_ORGS_PER_USER = Number(process.env.MAX_OWNED_ORGS_PER_USER ?? 3);
// Review output budget configuration is documented in the root .env.example.
const configuredReviewMaxTokens = Number(process.env.OCTOPUS_REVIEW_MAX_TOKENS);
export const REVIEW_MAX_TOKENS = Number.isSafeInteger(configuredReviewMaxTokens)
  && configuredReviewMaxTokens >= 1 && configuredReviewMaxTokens <= 131_072
  ? configuredReviewMaxTokens : 8192;
// Welcome credits granted once, on a user's first organization (USD).
export const WELCOME_FREE_CREDITS = 150;

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
