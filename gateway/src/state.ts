import type { Activity, ManageMeCommand, ManageMeState, Project, Task } from "./types";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 64).toLowerCase();
}

export function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function createEmptyState(now = new Date()): ManageMeState {
  return {
    schemaVersion: 1,
    revision: 0,
    profile: { id: "kornel", displayName: "Kornel", timezone: "Europe/Budapest", locale: "en-HU" },
    areas: [
      { id: "home", name: "Home", status: "active", color: "#2f6b5f", sortOrder: 0 },
      { id: "phd", name: "PhD research", status: "active", color: "#4059ad", sortOrder: 1 },
      { id: "career", name: "Career", status: "active", color: "#a44a3f", sortOrder: 2 },
      { id: "anime-studio", name: "Anime Studio", status: "active", color: "#7b4ea3", sortOrder: 3 },
      { id: "finance", name: "Finance", status: "active", color: "#b7791f", sortOrder: 4 },
    ],
    projects: [],
    tasks: [],
    routines: [],
    dailyFocus: [],
    activity: [],
    updatedAt: now.toISOString(),
  };
}

export function isManageMeState(value: unknown): value is ManageMeState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ManageMeState>;
  return state.schemaVersion === 1 && state.profile?.id === "kornel" && Array.isArray(state.areas) && Array.isArray(state.projects) && Array.isArray(state.tasks) && Array.isArray(state.dailyFocus) && Array.isArray(state.activity);
}

export function isCommand(value: unknown): value is ManageMeCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<ManageMeCommand>;
  return command.profileId === "kornel" && typeof command.requestId === "string" && command.requestId.length >= 3 && command.requestId.length <= 64 && typeof command.actor === "string" && typeof command.type === "string" && Boolean(command.payload) && typeof command.payload === "object";
}

function makeActivity(command: ManageMeCommand, type: Activity["type"], summary: string, entityId?: string): Activity {
  return { id: id("activity"), at: new Date().toISOString(), actor: command.actor, type, entityId, summary, requestId: command.requestId };
}

export function applyCommand(current: ManageMeState, command: ManageMeCommand): { state: ManageMeState; summary: string; changed: boolean } {
  if (command.profileId !== "kornel") throw new Error("This ManageMe installation belongs to Kornel.");
  if (current.activity.some((item) => item.requestId === command.requestId)) {
    return { state: current, summary: "Command already applied", changed: false };
  }

  const next = structuredClone(current);
  const now = new Date().toISOString();
  let summary = "ManageMe update";

  switch (command.type) {
    case "capture_task": {
      const title = String(command.payload.title || "").trim();
      if (!title) throw new Error("Task title is required.");
      const task: Task = {
        id: String(command.payload.id || id("task")),
        title: title.slice(0, 240),
        notes: typeof command.payload.notes === "string" ? command.payload.notes.slice(0, 4000) : undefined,
        areaId: typeof command.payload.areaId === "string" ? command.payload.areaId : undefined,
        projectId: typeof command.payload.projectId === "string" ? command.payload.projectId : undefined,
        status: "inbox",
        importance: ["low", "normal", "high", "critical"].includes(String(command.payload.importance)) ? taskImportance(command.payload.importance) : "normal",
        energy: ["low", "medium", "high"].includes(String(command.payload.energy)) ? taskEnergy(command.payload.energy) : "medium",
        estimateMinutes: positiveInteger(command.payload.estimateMinutes, 1440),
        dueAt: optionalString(command.payload.dueAt),
        createdAt: now,
        updatedAt: now,
      };
      next.tasks.unshift(task);
      summary = `Capture ${task.title}`;
      next.activity.unshift(makeActivity(command, "task_captured", `Captured: ${task.title}`, task.id));
      break;
    }
    case "update_task": {
      const task = next.tasks.find((item) => item.id === String(command.payload.id || ""));
      if (!task) throw new Error("Task not found.");
      const allowed = ["title", "notes", "status", "importance", "energy", "estimateMinutes", "dueAt", "scheduledFor", "areaId", "projectId", "waitingFor"] as const;
      for (const key of allowed) {
        if (key in command.payload) Object.assign(task, { [key]: command.payload[key] || undefined });
      }
      task.updatedAt = now;
      summary = `Update ${task.title}`;
      next.activity.unshift(makeActivity(command, "task_updated", `Updated: ${task.title}`, task.id));
      break;
    }
    case "complete_task": {
      const task = next.tasks.find((item) => item.id === String(command.payload.id || ""));
      if (!task) throw new Error("Task not found.");
      task.status = "done";
      task.completedAt = now;
      task.updatedAt = now;
      for (const focus of next.dailyFocus) focus.taskIds = focus.taskIds.filter((taskId) => taskId !== task.id);
      summary = `Complete ${task.title}`;
      next.activity.unshift(makeActivity(command, "task_completed", `Completed: ${task.title}`, task.id));
      break;
    }
    case "select_focus": {
      const requestedIds = Array.isArray(command.payload.taskIds) ? command.payload.taskIds.map(String) : [];
      const taskIds = [...new Set(requestedIds)].filter((taskId) => next.tasks.some((task) => task.id === taskId && !["done", "cancelled"].includes(task.status))).slice(0, 3);
      const date = optionalString(command.payload.date) || localDate();
      next.dailyFocus = next.dailyFocus.filter((focus) => focus.date !== date);
      next.dailyFocus.unshift({
        date,
        taskIds,
        selectedAt: now,
        selectedBy: command.actor === "assistant" ? "assistant" : "kornel",
        reason: optionalString(command.payload.reason)?.slice(0, 500),
      });
      summary = `Select ${taskIds.length} focus items`;
      next.activity.unshift(makeActivity(command, "focus_selected", summary));
      break;
    }
    case "create_project": {
      const title = String(command.payload.title || "").trim();
      const areaId = String(command.payload.areaId || "");
      if (!title || !next.areas.some((area) => area.id === areaId)) throw new Error("A valid area and project title are required.");
      const project: Project = {
        id: String(command.payload.id || id("project")),
        areaId,
        title: title.slice(0, 160),
        desiredOutcome: String(command.payload.desiredOutcome || "").trim().slice(0, 500),
        status: "active",
        dueDate: optionalString(command.payload.dueDate),
        reviewDate: optionalString(command.payload.reviewDate),
        createdAt: now,
        updatedAt: now,
      };
      next.projects.unshift(project);
      summary = `Create project ${project.title}`;
      next.activity.unshift(makeActivity(command, "project_created", `Created project: ${project.title}`, project.id));
      break;
    }
    case "update_project": {
      const project = next.projects.find((item) => item.id === String(command.payload.id || ""));
      if (!project) throw new Error("Project not found.");
      for (const key of ["title", "desiredOutcome", "status", "dueDate", "reviewDate", "areaId"] as const) {
        if (key in command.payload) Object.assign(project, { [key]: command.payload[key] || undefined });
      }
      project.updatedAt = now;
      summary = `Update project ${project.title}`;
      next.activity.unshift(makeActivity(command, "project_updated", `Updated project: ${project.title}`, project.id));
      break;
    }
    default:
      throw new Error("Unsupported command.");
  }

  next.revision += 1;
  next.updatedAt = now;
  next.activity = next.activity.slice(0, 250);
  return { state: next, summary, changed: true };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown, max: number): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : undefined;
}

function taskImportance(value: unknown): Task["importance"] {
  return value as Task["importance"];
}

function taskEnergy(value: unknown): Task["energy"] {
  return value as Task["energy"];
}
