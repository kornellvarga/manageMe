"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_TASK_STATUSES,
  createEmptyState,
  localDate,
  requestId,
  type ManageMeCommand,
  type ManageMeState,
  type Task,
} from "./domain";
import { focusReason, suggestFocus } from "./focus";
import { applyCommand } from "./local-command";
import {
  AuthRequiredError,
  beginLogin,
  fetchState,
  finishLoginIfPresent,
  hasRemoteApi,
  isConnected,
  sendCommand,
} from "./sync-client";

type View = "today" | "inbox" | "areas" | "review";
type SyncState = "connecting" | "disconnected" | "synced" | "offline" | "saving" | "error";

const CACHE_KEY = "manageme-state-cache-v1";
const QUEUE_KEY = "manageme-command-queue-v1";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function loadCachedState(): ManageMeState | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as ManageMeState) : null;
  } catch {
    return null;
  }
}

function loadQueue(): ManageMeCommand[] {
  try {
    const value = localStorage.getItem(QUEUE_KEY);
    return value ? (JSON.parse(value) as ManageMeCommand[]) : [];
  } catch {
    return [];
  }
}

function saveCache(state: ManageMeState, queue?: ManageMeCommand[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  if (queue) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function taskMeta(task: Task, state: ManageMeState): string {
  const area = state.areas.find((item) => item.id === task.areaId)?.name;
  const project = state.projects.find((item) => item.id === task.projectId)?.title;
  const pieces = [project || area, task.estimateMinutes ? `${task.estimateMinutes} min` : undefined];
  if (task.dueAt) {
    const overdue = new Date(task.dueAt) < new Date();
    pieces.push(`${overdue ? "Overdue" : "Due"} ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(task.dueAt))}`);
  }
  return pieces.filter(Boolean).join(" · ") || (task.status === "inbox" ? "Needs sorting" : "Ready when you are");
}

export function ManageMeApp() {
  const [state, setState] = useState<ManageMeState>(() => createEmptyState());
  const [view, setView] = useState<View>("today");
  const [sync, setSync] = useState<SyncState>(hasRemoteApi() ? "connecting" : "offline");
  const [message, setMessage] = useState(hasRemoteApi() ? "Connecting to your private data…" : "Local preview — changes are waiting for the gateway");
  const [connected, setConnected] = useState(false);
  const [capture, setCapture] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectOutcome, setProjectOutcome] = useState("");
  const [projectArea, setProjectArea] = useState("home");
  const [busy, setBusy] = useState(false);
  const [sessionStartedAt] = useState(() => Date.now());

  const today = localDate(state.profile.timezone);
  const todayFocus = state.dailyFocus.find((item) => item.date === today);
  const focusTasks = (todayFocus?.taskIds || [])
    .map((id) => state.tasks.find((task) => task.id === id))
    .filter((task): task is Task => Boolean(task && ACTIVE_TASK_STATUSES.includes(task.status)));
  const inboxTasks = state.tasks.filter((task) => task.status === "inbox");
  const openTasks = state.tasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status));
  const completedThisWeek = state.tasks.filter((task) => {
    if (!task.completedAt) return false;
    return sessionStartedAt - new Date(task.completedAt).getTime() <= 7 * 86_400_000;
  }).length;

  const nextSuggestion = useMemo(() => suggestFocus(state), [state]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${BASE_PATH}/sw.js`).catch(() => undefined);
    }

    let cancelled = false;
    const connect = async () => {
      await Promise.resolve();
      const cached = loadCachedState();
      if (cancelled) return;
      if (cached?.profile?.id === "kornel") setState(cached);
      if (!hasRemoteApi()) return;
      try {
        const authenticated = await finishLoginIfPresent();
        if (cancelled) return;
        setConnected(authenticated);
        if (!authenticated) {
          setSync("disconnected");
          setMessage("Connect once to use your private GitHub data everywhere.");
          return;
        }
        let remote = await fetchState();
        const queued = loadQueue();
        for (const command of queued) remote = await sendCommand({ ...command, expectedRevision: remote.revision });
        if (cancelled) return;
        setState(remote);
        saveCache(remote, []);
        setSync("synced");
        setMessage("Live with your private GitHub data");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AuthRequiredError) {
          setConnected(false);
          setSync("disconnected");
          setMessage(error.message);
        } else {
          setSync("offline");
          setMessage(error instanceof Error ? `${error.message} Changes stay safely on this device.` : "Offline — changes stay safely on this device.");
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connectWithGitHub() {
    setSync("connecting");
    setMessage("Opening secure GitHub sign-in…");
    try {
      await beginLogin();
    } catch (error) {
      setSync("error");
      setMessage(error instanceof Error ? error.message : "GitHub sign-in could not start.");
    }
  }

  async function runCommand(type: ManageMeCommand["type"], payload: Record<string, unknown>) {
    const command: ManageMeCommand = {
      requestId: requestId("web"),
      profileId: "kornel",
      actor: "web",
      expectedRevision: state.revision,
      type,
      payload,
    };
    const optimistic = applyCommand(state, command);
    setState(optimistic);
    setBusy(true);
    const canSync = hasRemoteApi() && (connected || isConnected());
    setSync(canSync ? "saving" : hasRemoteApi() ? "disconnected" : "offline");
    setMessage(canSync ? "Saving…" : "Saved on this device — connect to sync it everywhere");

    if (!canSync) {
      const queue = [...loadQueue(), command];
      saveCache(optimistic, queue);
      setBusy(false);
      return;
    }

    try {
      const remote = await sendCommand(command);
      setState(remote);
      saveCache(remote, []);
      setSync("synced");
      setMessage("Live with your private GitHub data");
    } catch (error) {
      const queue = [...loadQueue(), command];
      saveCache(optimistic, queue);
      if (error instanceof AuthRequiredError) setConnected(false);
      setSync(error instanceof AuthRequiredError ? "disconnected" : "error");
      setMessage(error instanceof Error ? `${error.message} Change queued on this device.` : "Sync failed. Change queued on this device.");
    } finally {
      setBusy(false);
    }
  }

  function captureTask(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title) return;
    setCapture("");
    void runCommand("capture_task", { title });
  }

  function chooseForMe() {
    const suggestions = suggestFocus(state);
    void runCommand("select_focus", {
      date: today,
      taskIds: suggestions.map((task) => task.id),
      reason: focusReason(suggestions),
    });
  }

  function toggleFocus(task: Task) {
    const current = focusTasks.map((item) => item.id);
    const taskIds = current.includes(task.id)
      ? current.filter((id) => id !== task.id)
      : [...current, task.id].slice(-3);
    void runCommand("select_focus", { date: today, taskIds, reason: "Chosen by Kornel." });
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectTitle.trim()) return;
    void runCommand("create_project", {
      areaId: projectArea,
      title: projectTitle.trim(),
      desiredOutcome: projectOutcome.trim(),
    });
    setProjectTitle("");
    setProjectOutcome("");
  }

  const navItems: Array<{ id: View; label: string; count?: number }> = [
    { id: "today", label: "Today", count: focusTasks.length },
    { id: "inbox", label: "Inbox", count: inboxTasks.length },
    { id: "areas", label: "Areas" },
    { id: "review", label: "Review" },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="ManageMe navigation">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">M</span>
          <div>
            <strong>ManageMe</strong>
            <span>Kornel&apos;s focus system</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button className={view === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setView(item.id)}>
              <span>{item.label}</span>
              {typeof item.count === "number" && item.count > 0 ? <small>{item.count}</small> : null}
            </button>
          ))}
        </nav>
        <a className="android-link" href={`${BASE_PATH}/ManageMe.apk`} download>
          <span>Android app</span><small>Download .apk</small>
        </a>
        <div className={`sync-card ${sync}`}>
          <span className="sync-dot" aria-hidden="true" />
          <div>
            <strong>{sync === "synced" ? "Synced" : sync === "saving" ? "Saving" : sync === "connecting" ? "Connecting" : sync === "disconnected" ? "Private sync is off" : "Local safety copy"}</strong>
            <p>{message}</p>
            {hasRemoteApi() && !connected && sync !== "connecting" ? <button className="sync-action" onClick={() => void connectWithGitHub()}>Connect with GitHub</button> : null}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: state.profile.timezone }).format(new Date())}</p>
            <h1>{greeting()}, Kornel.</h1>
          </div>
          <div className="day-stats" aria-label="Current progress">
            <span><strong>{openTasks.length}</strong> open</span>
            <span><strong>{completedThisWeek}</strong> finished this week</span>
          </div>
        </header>

        <form className="capture-bar" onSubmit={captureTask}>
          <span className="capture-plus" aria-hidden="true">+</span>
          <label className="sr-only" htmlFor="quick-capture">Capture something before it disappears</label>
          <input id="quick-capture" value={capture} onChange={(event) => setCapture(event.target.value)} placeholder="Capture something before it disappears…" autoComplete="off" />
          <button type="submit" disabled={!capture.trim() || busy}>Add to Inbox</button>
        </form>

        {view === "today" ? (
          <div className="content-grid">
            <section className="primary-column">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Keep the day small</p>
                  <h2>Today&apos;s three</h2>
                </div>
                <button className="quiet-button" onClick={chooseForMe} disabled={busy || nextSuggestion.length === 0}>Choose for me</button>
              </div>
              {focusTasks.length > 0 ? (
                <div className="focus-list">
                  {focusTasks.map((task, index) => (
                    <article className="focus-task" key={task.id}>
                      <span className="focus-number">{index + 1}</span>
                      <button className="complete-button" aria-label={`Complete ${task.title}`} onClick={() => void runCommand("complete_task", { id: task.id })} />
                      <div>
                        <h3>{task.title}</h3>
                        <p>{taskMeta(task, state)}</p>
                      </div>
                    </article>
                  ))}
                  <p className="focus-reason">{todayFocus?.reason || "These are the only things competing for your attention right now."}</p>
                </div>
              ) : (
                <div className="empty-focus">
                  <div className="empty-orbit" aria-hidden="true"><span /></div>
                  <h3>Nothing is demanding your attention yet.</h3>
                  <p>{nextSuggestion.length > 0 ? "Let ManageMe choose three useful next steps, or pick them yourself from the Inbox." : "Put one concrete next action in the Inbox. It does not need to be perfectly worded."}</p>
                  {nextSuggestion.length > 0 ? <button onClick={chooseForMe}>Choose my three</button> : <button onClick={() => document.getElementById("quick-capture")?.focus()}>Capture the first thing</button>}
                </div>
              )}
            </section>

            <aside className="secondary-column">
              <div className="section-heading compact"><div><p className="eyebrow">Needs a decision</p><h2>Inbox</h2></div><button className="text-button" onClick={() => setView("inbox")}>See all</button></div>
              <div className="mini-list">
                {inboxTasks.slice(0, 5).map((task) => (
                  <button className="mini-task" key={task.id} onClick={() => toggleFocus(task)}>
                    <span className={focusTasks.some((item) => item.id === task.id) ? "mini-check selected" : "mini-check"} />
                    <span><strong>{task.title}</strong><small>{taskMeta(task, state)}</small></span>
                  </button>
                ))}
                {inboxTasks.length === 0 ? <p className="empty-note">The Inbox is clear. New thoughts will land here.</p> : null}
              </div>
              <div className="area-strip">
                <p className="eyebrow">Life areas</p>
                {state.areas.filter((area) => area.status === "active").map((area) => {
                  const count = openTasks.filter((task) => task.areaId === area.id).length;
                  return <button key={area.id} onClick={() => setView("areas")}><span style={{ background: area.color }} /><strong>{area.name}</strong><small>{count || "—"}</small></button>;
                })}
              </div>
            </aside>
          </div>
        ) : null}

        {view === "inbox" ? (
          <section className="single-panel">
            <div className="section-heading"><div><p className="eyebrow">Clarify, do not perfect</p><h2>Inbox</h2></div><span className="count-label">{inboxTasks.length} unsorted</span></div>
            <div className="task-table">
              {inboxTasks.map((task) => (
                <article className="task-row" key={task.id}>
                  <button className="complete-button" aria-label={`Complete ${task.title}`} onClick={() => void runCommand("complete_task", { id: task.id })} />
                  <div><h3>{task.title}</h3><p>{taskMeta(task, state)}</p></div>
                  <button className={focusTasks.some((item) => item.id === task.id) ? "pill-button selected" : "pill-button"} onClick={() => toggleFocus(task)}>{focusTasks.some((item) => item.id === task.id) ? "Focused" : "Add to today"}</button>
                  <button className="pill-button" onClick={() => void runCommand("update_task", { id: task.id, status: "ready" })}>Ready</button>
                </article>
              ))}
              {inboxTasks.length === 0 ? <div className="empty-list"><h3>Inbox zero, without the ceremony.</h3><p>Capture the next thought when it appears.</p></div> : null}
            </div>
          </section>
        ) : null}

        {view === "areas" ? (
          <div className="content-grid areas-view">
            <section className="primary-column">
              <div className="section-heading"><div><p className="eyebrow">Ongoing responsibilities</p><h2>Areas</h2></div></div>
              <div className="area-cards">
                {state.areas.filter((area) => area.status !== "archived").map((area) => {
                  const projects = state.projects.filter((project) => project.areaId === area.id && project.status === "active");
                  const tasks = openTasks.filter((task) => task.areaId === area.id);
                  return (
                    <article className="area-card" key={area.id}>
                      <span className="area-color" style={{ background: area.color }} />
                      <div className="area-card-title"><h3>{area.name}</h3><small>{projects.length} projects · {tasks.length} tasks</small></div>
                      {projects.length > 0 ? <ul>{projects.slice(0, 3).map((project) => <li key={project.id}><strong>{project.title}</strong><span>{project.desiredOutcome || "Outcome not written yet"}</span></li>)}</ul> : <p>No active project. That is allowed.</p>}
                    </article>
                  );
                })}
              </div>
            </section>
            <aside className="secondary-column project-form-card">
              <p className="eyebrow">Finishable outcome</p>
              <h2>New project</h2>
              <p>A project ends. “PhD” is an area; “Submit the methods chapter” is a project.</p>
              <form onSubmit={createProject}>
                <label>Area<select value={projectArea} onChange={(event) => setProjectArea(event.target.value)}>{state.areas.filter((area) => area.status === "active").map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
                <label>Project<input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="What will be finished?" /></label>
                <label>Done looks like<textarea value={projectOutcome} onChange={(event) => setProjectOutcome(event.target.value)} placeholder="One clear sentence" rows={3} /></label>
                <button type="submit" disabled={!projectTitle.trim() || busy}>Create project</button>
              </form>
            </aside>
          </div>
        ) : null}

        {view === "review" ? (
          <section className="single-panel review-panel">
            <div className="section-heading"><div><p className="eyebrow">A short reset, not an audit</p><h2>Review</h2></div></div>
            <div className="review-grid">
              <article><strong>{inboxTasks.length}</strong><h3>Inbox decisions</h3><p>{inboxTasks.length ? "Turn vague thoughts into a next action, or leave them for later on purpose." : "Nothing is waiting to be clarified."}</p><button onClick={() => setView("inbox")}>Open Inbox</button></article>
              <article><strong>{state.projects.filter((project) => project.status === "active" && !openTasks.some((task) => task.projectId === project.id)).length}</strong><h3>Projects without a next action</h3><p>Every active outcome should have one visible next step.</p><button onClick={() => setView("areas")}>Open Areas</button></article>
              <article><strong>{state.tasks.filter((task) => task.status === "waiting").length}</strong><h3>Waiting for someone</h3><p>Check only what has become actionable; leave the rest alone.</p></article>
              <article><strong>{completedThisWeek}</strong><h3>Finished this week</h3><p>Progress counts even when the full list is still long.</p></article>
            </div>
          </section>
        ) : null}
      </section>

      <nav className="mobile-nav" aria-label="ManageMe mobile navigation">
        {navItems.map((item) => <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)}>{item.label}{item.count ? <small>{item.count}</small> : null}</button>)}
      </nav>
    </main>
  );
}
