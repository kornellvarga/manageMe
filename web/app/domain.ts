export type AreaStatus = "active" | "paused" | "archived";
export type ProjectStatus = "active" | "waiting" | "paused" | "done" | "archived";
export type TaskStatus = "inbox" | "ready" | "scheduled" | "waiting" | "someday" | "done" | "cancelled";
export type Importance = "low" | "normal" | "high" | "critical";
export type Energy = "low" | "medium" | "high";
export type Actor = "kornel" | "assistant" | "web" | "android" | "system";

export interface Profile {
  id: "kornel";
  displayName: "Kornel";
  timezone: "Europe/Budapest";
  locale: string;
}

export interface Area {
  id: string;
  name: string;
  status: AreaStatus;
  color: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  areaId: string;
  title: string;
  desiredOutcome: string;
  status: ProjectStatus;
  dueDate?: string;
  reviewDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  areaId?: string;
  projectId?: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  importance: Importance;
  energy: Energy;
  estimateMinutes?: number;
  dueAt?: string;
  scheduledFor?: string;
  waitingFor?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Routine {
  id: string;
  title: string;
  areaId: string;
  cadence: string;
  active: boolean;
  lastCompletedAt?: string;
}

export interface DailyFocus {
  date: string;
  taskIds: string[];
  selectedAt: string;
  selectedBy: "kornel" | "assistant";
  reason?: string;
}

export interface Activity {
  id: string;
  at: string;
  actor: Actor;
  type:
    | "task_captured"
    | "task_updated"
    | "task_completed"
    | "focus_selected"
    | "project_created"
    | "project_updated"
    | "sync";
  entityId?: string;
  summary: string;
  requestId?: string;
}

export interface ManageMeState {
  schemaVersion: 1;
  revision: number;
  profile: Profile;
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  routines: Routine[];
  dailyFocus: DailyFocus[];
  activity: Activity[];
  updatedAt: string;
}

export type CommandType =
  | "capture_task"
  | "update_task"
  | "complete_task"
  | "select_focus"
  | "create_project"
  | "update_project";

export interface ManageMeCommand {
  requestId: string;
  profileId: "kornel";
  actor: "kornel" | "assistant" | "web" | "android";
  expectedRevision?: number;
  type: CommandType;
  payload: Record<string, unknown>;
}

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["inbox", "ready", "scheduled", "waiting", "someday"];

export function localDate(timeZone = "Europe/Budapest", date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function createEmptyState(now = new Date()): ManageMeState {
  return {
    schemaVersion: 1,
    revision: 0,
    profile: {
      id: "kornel",
      displayName: "Kornel",
      timezone: "Europe/Budapest",
      locale: "en-HU",
    },
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

export function requestId(prefix = "web"): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${id}`.slice(0, 64).toLowerCase();
}

export function entityId(prefix: string): string {
  return requestId(prefix);
}

