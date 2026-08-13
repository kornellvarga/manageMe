import { applyHealthCommand, createEmptyHealthLedger, isHealthLedger, mergeHealthConnectSnapshot } from "./health";
import { GitHubConflictError, readJsonDocument, writeJsonDocument } from "./github-store";
import type { HealthCommand, HealthConnectSnapshot, HealthLedger } from "./health";
import type { Env } from "./types";

interface HealthFile { ledger: HealthLedger; sha?: string }

function healthPath(env: Env): string {
  return env.GITHUB_HEALTH_PATH || "health.json";
}

export async function readHealthLedger(env: Env): Promise<HealthFile> {
  const result = await readJsonDocument(env, healthPath(env), isHealthLedger, createEmptyHealthLedger);
  return { ledger: result.value, sha: result.sha };
}

async function writeHealthLedger(env: Env, ledger: HealthLedger, summary: string, sha?: string): Promise<void> {
  return writeJsonDocument(env, healthPath(env), ledger, summary, sha);
}

export async function applyHealthCommandToGitHub(env: Env, command: HealthCommand): Promise<{ ledger: HealthLedger; entityId?: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readHealthLedger(env);
    const applied = applyHealthCommand(current.ledger, command);
    if (!applied.changed) return { ledger: applied.ledger, entityId: applied.entityId };
    try {
      await writeHealthLedger(env, applied.ledger, `${command.type.replaceAll("_", " ")} ${applied.entityId || "health"}`, current.sha);
      return { ledger: applied.ledger, entityId: applied.entityId };
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Health data changed repeatedly; retry the command.");
}

export async function syncHealthConnectToGitHub(env: Env, snapshot: HealthConnectSnapshot): Promise<{ ledger: HealthLedger; affectedCount: number }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readHealthLedger(env);
    const merged = mergeHealthConnectSnapshot(current.ledger, snapshot);
    if (!merged.changed) return { ledger: merged.ledger, affectedCount: merged.affectedCount };
    try {
      await writeHealthLedger(env, merged.ledger, `sync health data from ${snapshot.deviceId || "Android"}`, current.sha);
      return { ledger: merged.ledger, affectedCount: merged.affectedCount };
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Health data changed repeatedly; retry synchronization.");
}
