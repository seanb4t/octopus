/**
 * The model for the small structured-output calls around a review: mechanical
 * diff routing, two-pass validation, feedback classification, repository
 * configuration extraction, the chat guard, and the chat, knowledge, ask-octopus,
 * blog and Slack routes. Each call site names its upstream default. When
 * OCTOPUS_UTILITY_MODEL is set, it replaces every one of them, so a deployment
 * without an Anthropic key routes these calls through its own provider.
 *
 * The configured model must be registered in `available_models` with the
 * provider that serves it, or the router falls back to the Anthropic client.
 */
export function utilityModel(upstreamDefault: string): string {
  const configured = process.env.OCTOPUS_UTILITY_MODEL?.trim();
  return configured ? configured : upstreamDefault;
}
