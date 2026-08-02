import { applyFinanceCommand, createEmptyFinanceLedger, isFinanceLedger, mergeFinanceSnapshot } from "./finance";
import { GitHubConflictError, readJsonDocument, writeJsonDocument } from "./github-store";
import type { FinanceCommand, FinanceLedger, FinanceSnapshot } from "./finance";
import type { Env } from "./types";

interface FinanceFile {
  ledger: FinanceLedger;
  sha?: string;
}

function financePath(env: Env): string {
  return env.GITHUB_FINANCE_PATH || "finance.json";
}

export async function readFinanceLedger(env: Env): Promise<FinanceFile> {
  const result = await readJsonDocument(env, financePath(env), isFinanceLedger, createEmptyFinanceLedger);
  return { ledger: result.value, sha: result.sha };
}

async function writeFinanceLedger(env: Env, ledger: FinanceLedger, summary: string, sha?: string): Promise<void> {
  return writeJsonDocument(env, financePath(env), ledger, summary, sha);
}

export async function syncFinanceToGitHub(env: Env, snapshot: FinanceSnapshot): Promise<FinanceLedger> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readFinanceLedger(env);
    const result = mergeFinanceSnapshot(current.ledger, snapshot);
    if (!result.changed) return result.ledger;
    try {
      await writeFinanceLedger(env, result.ledger, `sync finance from ${snapshot.deviceId || "Android"}`, current.sha);
      return result.ledger;
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Finance data changed repeatedly; retry synchronization.");
}

export async function applyFinanceCommandToGitHub(
  env: Env,
  command: FinanceCommand,
): Promise<{ ledger: FinanceLedger; entityId?: string; affectedCount?: number }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readFinanceLedger(env);
    const result = applyFinanceCommand(current.ledger, command);
    if (!result.changed) return { ledger: result.ledger, entityId: result.entityId, affectedCount: result.affectedCount };
    try {
      await writeFinanceLedger(env, result.ledger, `${command.type.replaceAll("_", " ")} ${result.entityId || "finance"}`, current.sha);
      return { ledger: result.ledger, entityId: result.entityId, affectedCount: result.affectedCount };
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Finance data changed repeatedly; retry the command.");
}
