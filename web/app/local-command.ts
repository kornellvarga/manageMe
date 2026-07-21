import {
  entityId,
  localDate,
  type Activity,
  type ManageMeCommand,
  type ManageMeState,
  type Project,
  type Task,
} from "./domain";

function activity(command: ManageMeCommand, type: Activity["type"], summary: string, entity?: string): Activity {
  return {
    id: entityId("activity"),
    at: new Date().toISOString(),
    actor: command.actor,
    type,
    entityId: entity,
    summary,
    requestId: command.requestId,
  };
}

export function applyCommand(current: ManageMeState, command: ManageMeCommand): ManageMeState {
  if (current.activity.some((item) => item.requestId === command.requestId)) return current;

  const now = new Date().toISOString();
  const next: ManageMeState = structuredClone(current);
  next.revision += 1;
  next.updatedAt = now;

  switch (command.type) {
    case "capture_task": {
      const title = String(command.payload.title || "").trim();
      if (!title) throw new Error("Write down what needs doing first.");
      const task: Task = {
        id: String(command.payload.id || entityId("task")),
        title,
        status: "inbox",
        importance: "normal",
        energy: "medium",
        createdAt: now,
        updatedAt: now,
      };
      next.tasks.unshift(task);
      next.activity.unshift(activity(command, "task_captured", `Captured: ${title}`, task.id));
      break;
    }
    case "update_task": {
      const id = String(command.payload.id || "");
      const task = next.tasks.find((item) => item.id === id);
      if (!task) throw new Error("That task no longer exists.");
      const allowed = ["title", "notes", "status", "importance", "energy", "estimateMinutes", "dueAt", "scheduledFor", "areaId", "projectId", "waitingFor"] as const;
      for (const key of allowed) {
        if (key in command.payload) Object.assign(task, { [key]: command.payload[key] || undefined });
      }
      task.updatedAt = now;
      next.activity.unshift(activity(command, "task_updated", `Updated: ${task.title}`, task.id));
      break;
    }
    case "complete_task": {
      const id = String(command.payload.id || "");
      const task = next.tasks.find((item) => item.id === id);
      if (!task) throw new Error("That task no longer exists.");
      task.status = "done";
      task.completedAt = now;
      task.updatedAt = now;
      next.activity.unshift(activity(command, "task_completed", `Completed: ${task.title}`, task.id));
      for (const focus of next.dailyFocus) focus.taskIds = focus.taskIds.filter((taskId) => taskId !== id);
      break;
    }
    case "select_focus": {
      const taskIds = Array.isArray(command.payload.taskIds)
        ? command.payload.taskIds.map(String).filter((id) => next.tasks.some((task) => task.id === id)).slice(0, 3)
        : [];
      const date = String(command.payload.date || localDate(next.profile.timezone));
      next.dailyFocus = next.dailyFocus.filter((focus) => focus.date !== date);
      next.dailyFocus.unshift({
        date,
        taskIds,
        selectedAt: now,
        selectedBy: command.actor === "assistant" ? "assistant" : "kornel",
        reason: typeof command.payload.reason === "string" ? command.payload.reason : undefined,
      });
      next.activity.unshift(activity(command, "focus_selected", `Selected ${taskIds.length} focus item${taskIds.length === 1 ? "" : "s"}.`));
      break;
    }
    case "create_project": {
      const title = String(command.payload.title || "").trim();
      const areaId = String(command.payload.areaId || "");
      if (!title || !next.areas.some((area) => area.id === areaId)) throw new Error("Choose an area and name the outcome.");
      const project: Project = {
        id: String(command.payload.id || entityId("project")),
        areaId,
        title,
        desiredOutcome: String(command.payload.desiredOutcome || "").trim(),
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      next.projects.unshift(project);
      next.activity.unshift(activity(command, "project_created", `Created project: ${title}`, project.id));
      break;
    }
    case "update_project": {
      const id = String(command.payload.id || "");
      const project = next.projects.find((item) => item.id === id);
      if (!project) throw new Error("That project no longer exists.");
      for (const key of ["title", "desiredOutcome", "status", "dueDate", "reviewDate", "areaId"] as const) {
        if (key in command.payload) Object.assign(project, { [key]: command.payload[key] || undefined });
      }
      project.updatedAt = now;
      next.activity.unshift(activity(command, "project_updated", `Updated project: ${project.title}`, project.id));
      break;
    }
  }

  next.activity = next.activity.slice(0, 250);
  return next;
}

