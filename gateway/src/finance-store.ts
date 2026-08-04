import {
  applyFinanceCommand,
  createEmptyFinanceLedger,
  dedupeFinanceLedger,
  isFinanceLedger,
  mergeFinanceSnapshot,
} from "./finance";
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
    const merged = mergeFinanceSnapshot(current.ledger, snapshot);
    const deduped = dedupeFinanceLedger(merged.ledger);
    if (!merged.changed && !deduped.changed) return deduped.ledger;
    try {
      const duplicateNote = deduped.affectedCount ? ` and remove ${deduped.affectedCount} duplicate(s)` : "";
      await writeFinanceLedger(
        env,
        deduped.ledger,
        `sync finance from ${snapshot.deviceId || "Android"}${duplicateNote}`,
        current.sha,
      );
      return deduped.ledger;
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
    const applied = applyFinanceCommand(current.ledger, command);
    const deduped = dedupeFinanceLedger(applied.ledger);
    if (!applied.changed && !deduped.changed) {
      return { ledger: deduped.ledger, entityId: applied.entityId, affectedCount: applied.affectedCount };
    }
    try {
      await writeFinanceLedger(
        env,
        deduped.ledger,
        `${command.type.replaceAll("_", " ")} ${applied.entityId || "finance"}`,
        current.sha,
      );
      return {
        ledger: deduped.ledger,
        entityId: applied.entityId,
        affectedCount: applied.affectedCount,
      };
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("Finance data changed repeatedly; retry the command.");
}
