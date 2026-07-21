export type Actor = "kornel" | "assistant" | "web" | "android" | "system";
export type TaskStatus = "inbox" | "ready" | "scheduled" | "waiting" | "someday" | "done" | "cancelled";

export interface Env {
  PUBLIC_ORIGIN: string;
  WEB_ORIGIN: string;
  AUTH_SIGNING_SECRET: string;
  MANAGEME_MCP_TOKEN?: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  ALLOWED_GITHUB_USER_ID?: string;
  ALLOWED_GITHUB_LOGIN?: string;
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_DATA_REPOSITORY: string;
  GITHUB_DATA_BRANCH?: string;
  GITHUB_DATA_PATH?: string;
}

export interface Area {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
  color: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  areaId: string;
  title: string;
  desiredOutcome: string;
  status: "active" | "waiting" | "paused" | "done" | "archived";
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
  importance: "low" | "normal" | "high" | "critical";
  energy: "low" | "medium" | "high";
  estimateMinutes?: number;
  dueAt?: string;
  scheduledFor?: string;
  waitingFor?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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
  type: "task_captured" | "task_updated" | "task_completed" | "focus_selected" | "project_created" | "project_updated" | "sync";
  entityId?: string;
  summary: string;
  requestId?: string;
}

export interface ManageMeState {
  schemaVersion: 1;
  revision: number;
  profile: {
    id: "kornel";
    displayName: "Kornel";
    timezone: "Europe/Budapest";
    locale: string;
  };
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  routines: Array<{
    id: string;
    title: string;
    areaId: string;
    cadence: string;
    active: boolean;
    lastCompletedAt?: string;
  }>;
  dailyFocus: DailyFocus[];
  activity: Activity[];
  updatedAt: string;
}

export interface ManageMeCommand {
  requestId: string;
  profileId: "kornel";
  actor: "kornel" | "assistant" | "web" | "android";
  expectedRevision?: number;
  type: "capture_task" | "update_task" | "complete_task" | "select_focus" | "create_project" | "update_project";
  payload: Record<string, unknown>;
}

export interface AuthContext {
  profileId: "kornel";
  scopes: string[];
  source: "oauth" | "static_mcp_token";
}
