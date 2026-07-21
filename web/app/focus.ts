import type { ManageMeState, Task } from "./domain";
import { localDate } from "./domain";

function taskScore(task: Task, now: Date, today: string): number {
  if (["done", "cancelled", "waiting", "someday"].includes(task.status)) return -Infinity;

  let score = 0;
  if (task.status === "ready") score += 20;
  if (task.status === "scheduled") score += 24;
  if (task.status === "inbox") score += 4;
  if (task.scheduledFor === today) score += 70;

  const importance = { low: 0, normal: 14, high: 38, critical: 72 };
  score += importance[task.importance];

  if (task.dueAt) {
    const hours = (new Date(task.dueAt).getTime() - now.getTime()) / 3_600_000;
    if (hours < 0) score += 120;
    else if (hours <= 24) score += 90;
    else if (hours <= 72) score += 55;
    else if (hours <= 168) score += 25;
  }

  if (task.estimateMinutes && task.estimateMinutes <= 20) score += 8;
  const ageDays = Math.max(0, (now.getTime() - new Date(task.createdAt).getTime()) / 86_400_000);
  score += Math.min(24, ageDays * 1.5);
  return score;
}

export function suggestFocus(state: ManageMeState, now = new Date()): Task[] {
  const today = localDate(state.profile.timezone, now);
  return state.tasks
    .map((task) => ({ task, score: taskScore(task, now, today) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score || a.task.createdAt.localeCompare(b.task.createdAt))
    .slice(0, 3)
    .map(({ task }) => task);
}

export function focusReason(tasks: Task[], now = new Date()): string {
  if (tasks.length === 0) return "Capture one concrete next action and I’ll help you choose.";
  const overdue = tasks.filter((task) => task.dueAt && new Date(task.dueAt) < now).length;
  if (overdue > 0) return "This set clears urgent work first, then keeps one useful next step moving.";
  if (tasks.some((task) => task.importance === "critical" || task.importance === "high")) {
    return "This set favors important work without filling the whole day.";
  }
  return "Three manageable next actions, chosen from what is ready now.";
}

