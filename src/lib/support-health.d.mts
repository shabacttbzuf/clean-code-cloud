export type HealthState = "checking" | "healthy" | "degraded" | "down" | "unknown";
export function classifyHttpStatus(status: number): HealthState;
export function classifyProbeFailure(): HealthState;
export function aggregateHealth(checks: Array<{ state: HealthState }>): HealthState;
export function canViewTechnicalDetails(isSuperOwner: boolean, permissions?: string[]): boolean;
export function safeDiagnosticSummary(checks: Array<{ id: string; label: string; state: HealthState; checkedAt?: string }>): Array<{ id: string; label: string; state: HealthState; checkedAt: string | null }>;
