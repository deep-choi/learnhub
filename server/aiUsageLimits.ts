/** Explicit operator switch for solo testing; unset deployments retain their quotas. */
export const aiUsageLimitsEnabled = (): boolean => process.env.AI_USAGE_LIMITS_ENABLED?.trim().toLowerCase() !== "false";
