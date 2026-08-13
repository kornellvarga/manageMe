export type HealthLedger = {
  schemaVersion: 1;
  revision: number;
  profileId: "kornel";
  foods: Array<Record<string, unknown>>;
  consumptions: Array<Record<string, unknown>>;
  fastingSessions: Array<Record<string, unknown>>;
  weights: Array<Record<string, unknown>>;
  metrics: Array<Record<string, unknown>>;
  appliedRequestIds: string[];
  updatedAt: string;
};

export type HealthCommand = {
  requestId: string;
  profileId: "kornel";
  actor: "web" | "android" | "assistant" | "kornel";
  type: string;
  payload: Record<string, unknown>;
};

export function healthRequestId(): string {
  const token = crypto.randomUUID().replaceAll("-", "");
  return `health_web_${token}`.slice(0, 96).toLowerCase();
}
