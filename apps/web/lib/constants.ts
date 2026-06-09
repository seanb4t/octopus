export const DISCORD_INVITE_URL = "https://discord.gg/qyuWTXghbS";
// Max organizations a single user can own. Server-runtime configurable via
// MAX_OWNED_ORGS_PER_USER (default 3). A value <= 0 disables the limit
// (unlimited). Read server-side in canUserCreateOrg; the client import is
// cosmetic copy only (shown via the server-provided canCreateOrg prop).
export const MAX_OWNED_ORGS_PER_USER = Number(process.env.MAX_OWNED_ORGS_PER_USER ?? 3);
