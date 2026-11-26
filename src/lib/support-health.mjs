export const HEALTH_STATES = Object.freeze(["checking", "healthy", "degraded", "down", "unknown"]);

export function classifyHttpStatus(status) {
  if (Number.isFinite(status) && status >= 200 && status < 400) return "healthy";
  if (Number.isFinite(status) && status >= 500) return "down";
  return "degraded";
}

export function classifyProbeFailure() {
  // Network errors and timeouts are ambiguous; never label them as a confirmed outage.
  return "degraded";
}

export function aggregateHealth(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return "unknown";
  if (checks.some((check) => check.state === "down")) return "down";
  if (checks.every((check) => check.state === "healthy")) return "healthy";
  return "degraded";
}

export function canViewTechnicalDetails(isSuperOwner, permissions = []) {
  return isSuperOwner === true || permissions.includes("audit.view") || permissions.includes("settings.view");
}

export function safeDiagnosticSummary(checks) {
  return checks.map(({ id, label, state, checkedAt }) => ({
    id,
    label,
    state,
    checkedAt: checkedAt ?? null,
  }));
}
