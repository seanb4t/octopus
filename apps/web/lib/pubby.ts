import { PubbyServer } from "@getpubby/sdk/server";

/**
 * Whether Pubby is configured. The browser switches to polling when
 * NEXT_PUBLIC_PUBBY_KEY is absent, and the server client below sends nothing
 * when these three are absent.
 */
export const PUBBY_ENABLED = !!(
  process.env.PUBBY_APP_ID &&
  process.env.PUBBY_APP_KEY &&
  process.env.PUBBY_APP_SECRET
);

const PUBBY_API_HOST = "https://api.pubby.dev";

/**
 * The client of an install with no Pubby credentials. A trigger resolves at
 * once and sends no request, so a call site needs no guard and the log holds
 * no failure. The channel authentication methods stay as inherited: the
 * browser reaches them only when NEXT_PUBLIC_PUBBY_KEY is set.
 */
class DisabledPubbyServer extends PubbyServer {
  constructor() {
    super({ appId: "", key: "", secret: "", apiHost: PUBBY_API_HOST });
  }

  override async trigger(channel: string | string[]): Promise<{ success: boolean; channels: string[] }> {
    return { success: false, channels: Array.isArray(channel) ? channel : [channel] };
  }
}

export const pubby: PubbyServer = PUBBY_ENABLED
  ? new PubbyServer({
      appId: process.env.PUBBY_APP_ID!,
      key: process.env.PUBBY_APP_KEY!,
      secret: process.env.PUBBY_APP_SECRET!,
      apiHost: PUBBY_API_HOST,
    })
  : new DisabledPubbyServer();
