"use client";

import { Popover } from "@base-ui/react/popover";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance, TooltipItem } from "chart.js";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  GripVertical,
  Plus,
  StickyNote,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import { absoluteStrategy } from "react-grid-layout/core";
import type { Layout, LayoutItem } from "react-grid-layout";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconActionButton } from "@/components/ui/icon-action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { RichTextEditor } from "./rich-text-editor";
import {
  dashboardWidgetLayoutStorageKey,
  dashboardWidgetMaxRows,
  defaultDashboardWidgetLayout,
  dashboardGridStorageKey,
  defaultDashboardGridLayout,
  isDashboardWidgetId,
  normalizeDashboardWidgetLayout,
  parseDashboardGridLayout,
  parseDashboardWidgetLayout,
  serializeDashboardGridLayout,
  serializeDashboardWidgetLayout,
} from "./dashboard-grid-settings";
import type { DashboardGridLayout, DashboardWidgetId, DashboardWidgetLayout } from "./dashboard-grid-settings";
import {
  findNewActiveReviewPullRequests,
  findNewlyUnhealthySites,
  toActiveReviewPullRequestIds,
  toHealthSiteStatusMap,
} from "./dashboard-notifications";
import { newInboxNoteContent } from "./note-defaults";
import { TopNav } from "./top-nav";
import { shouldSubmitTodoComment } from "./todo-comment-shortcuts";

type ReviewPullRequest = {
  githubIssueId: number;
  repo: string;
  number: number;
  title: string;
  url: string;
  branchName: string | null;
  author: string;
  status: string;
  isDraft: boolean;
  isActive: boolean;
  githubUpdatedAt: string;
};

type TodoComment = {
  id: number;
  todoMemoId: number;
  body: string;
  createdAt: string;
};

type TodoMemo = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  color: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  comments: TodoComment[];
};

type Note = {
  id: number;
  kind: "inbox" | "daily";
  title: string | null;
  content: string;
  color: string;
  noteDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProjectHealth = {
  status: "healthy" | "unhealthy";
  checkedAt: string;
  responseTimeMs: number | null;
  history: {
    checkedAt: string;
    status: "healthy" | "unhealthy";
    responseTimeMs: number | null;
  }[];
};

type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoVariant: "black" | "white";
  healthApiUrl: string | null;
  health: ProjectHealth | null;
  createdAt: string;
  updatedAt: string;
};

type SlackMappedField = {
  label: string;
  value: unknown;
  type: string;
  display: boolean;
  writable: boolean;
  columnId: string | null;
  role?: "assignee" | "status" | "title" | "done" | "none";
  userIds?: string[];
};

type WorkspaceUser = {
  id: number;
  name: string;
  slackUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SlackListItem = {
  id: number;
  sourceId: number;
  sourceName: string | null;
  slackItemId: string;
  title: string;
  mappedFields: Record<string, SlackMappedField>;
  assignedUsers?: WorkspaceUser[];
  fieldRoles?: { assignee?: string; status?: string; title?: string; done?: string };
  rawItem: Record<string, unknown>;
  isActive: boolean;
  slackCreatedAt: string | null;
  slackUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type WorkspaceUserCurrentTask = {
  id: number;
  sourceId: number;
  sourceName: string;
  slackItemId: string;
  title: string;
  status: string | null;
  lastSeenAt: string;
};

type WorkspaceUserStatus = {
  user: WorkspaceUser;
  status: "working" | "idle";
  currentTasks: WorkspaceUserCurrentTask[];
};

type ProjectContextMenu = {
  x: number;
  y: number;
  projectId: number;
};

type TodoContextMenu = {
  x: number;
  y: number;
  todoId: number;
};

type TodoCommentContextMenu = {
  x: number;
  y: number;
  commentId: number;
};

type ReviewPrContextMenu = {
  x: number;
  y: number;
  githubIssueId: number;
};

const todoColorPresets = ["#1c69d4", "#8b5cf6", "#e22718", "#f4b400", "#0fa336", "#7e7e7e"];

export default function Home() {
  const [reviewPullRequests, setReviewPullRequests] = useState<ReviewPullRequest[]>([]);
  const [reviewPrsStatus, setReviewPrsStatus] = useState("Loading");
  const [todoMemos, setTodoMemos] = useState<TodoMemo[]>([]);
  const [todoStatus, setTodoStatus] = useState("Loading");
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesStatus, setNotesStatus] = useState("Loading");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitleDraft, setNoteTitleDraft] = useState("");
  const [noteContentDraft, setNoteContentDraft] = useState("");
  const [noteContentTextDraft, setNoteContentTextDraft] = useState("");
  const [projectsStatus, setProjectsStatus] = useState("Loading");
  const [projects, setProjects] = useState<Project[]>([]);
  const [slackListItems, setSlackListItems] = useState<SlackListItem[]>([]);
  const [slackListsStatus, setSlackListsStatus] = useState("Loading");
  const [workspaceUserStatuses, setWorkspaceUserStatuses] = useState<WorkspaceUserStatus[]>([]);
  const [workspaceUsersStatus, setWorkspaceUsersStatus] = useState("Loading");
  const [selectedSlackListItemId, setSelectedSlackListItemId] = useState<number | null>(null);
  const [slackCellDrafts, setSlackCellDrafts] = useState<Record<string, string>>({});
  const [slackItemMessage, setSlackItemMessage] = useState<string | null>(null);
  const [isUpdatingSlackItem, setIsUpdatingSlackItem] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState<number | null>(null);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [todoTitleDraft, setTodoTitleDraft] = useState("");
  const [todoProjectIdDraft, setTodoProjectIdDraft] = useState("");
  const [todoContentDraft, setTodoContentDraft] = useState("");
  const [todoContentTextDraft, setTodoContentTextDraft] = useState("");
  const [todoColorDraft, setTodoColorDraft] = useState("#1c69d4");
  const [todoDueDateDraft, setTodoDueDateDraft] = useState("");
  const [isDueDatePickerOpen, setIsDueDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [todoCommentDraft, setTodoCommentDraft] = useState("");
  const [editingTodoCommentId, setEditingTodoCommentId] = useState<number | null>(null);
  const [todoContextMenu, setTodoContextMenu] = useState<TodoContextMenu | null>(null);
  const [todoCommentContextMenu, setTodoCommentContextMenu] = useState<TodoCommentContextMenu | null>(null);
  const [reviewPrContextMenu, setReviewPrContextMenu] = useState<ReviewPrContextMenu | null>(null);
  const [selectedProjectStatusId, setSelectedProjectStatusId] = useState<number | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenu | null>(null);
  const [dashboardGridLayoutSetting, setDashboardGridLayoutSetting] = useState<DashboardGridLayout>(defaultDashboardGridLayout);
  const [dashboardWidgetLayout, setDashboardWidgetLayout] = useState<DashboardWidgetLayout[]>(defaultDashboardWidgetLayout);
  const [isDashboardEditing, setIsDashboardEditing] = useState(false);
  const [isDashboardLayoutReady, setIsDashboardLayoutReady] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const { containerRef: dashboardGridRef, mounted: isDashboardGridMeasured, width: dashboardGridWidth } = useContainerWidth();
  const healthChartRef = useRef<HTMLCanvasElement | null>(null);
  const alertEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const reviewPullRequestBaselineRef = useRef<Set<number> | null>(null);
  const projectStatusBaselineRef = useRef<Map<number, ProjectHealth["status"]> | null>(null);

  const selectedTodo = todoMemos.find((memo) => memo.id === selectedTodoId);
  const todoContextTarget = todoMemos.find((memo) => memo.id === todoContextMenu?.todoId) ?? null;
  const todoCommentContextTarget =
    selectedTodo?.comments.find((comment) => comment.id === todoCommentContextMenu?.commentId) ?? null;
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const reviewPrContextTarget =
    reviewPullRequests.find((pullRequest) => pullRequest.githubIssueId === reviewPrContextMenu?.githubIssueId) ?? null;
  const selectedProjectStatus = projects.find((project) => project.id === selectedProjectStatusId && project.health) ?? null;
  const selectedSlackListItem = slackListItems.find((item) => item.id === selectedSlackListItemId) ?? null;
  const selectedSlackDisplayFields = selectedSlackListItem
    ? Object.entries(selectedSlackListItem.mappedFields).filter(([, field]) => field.display)
    : [];
  const selectedSlackWritableFields = selectedSlackListItem
    ? Object.entries(selectedSlackListItem.mappedFields).filter(([, field]) => field.writable)
    : [];
  const todoGroups = projects
    .map((project) => ({
      project,
      memos: todoMemos.filter((memo) => memo.projectId === project.id),
    }))
    .filter((group) => group.memos.length > 0);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:13001";
  const alertsStorageKey = "suhan-dashboard-alerts-enabled";
  const isReviewPrsLive = reviewPrsStatus === "Live";
  const isTodoLive = todoStatus === "Live";
  const isNotesLive = notesStatus === "Live";
  const isProjectsLive = projectsStatus === "Live";
  const isSlackListsLive = slackListsStatus === "Live";
  const isWorkspaceUsersLive = workspaceUsersStatus === "Live";
  const liveServiceCount = [isReviewPrsLive, isTodoLive, isNotesLive, isProjectsLive, isSlackListsLive, isWorkspaceUsersLive].filter(Boolean).length;
  const liveSummaryLabel = liveServiceCount === 6 ? "Live" : liveServiceCount > 0 ? "Partial" : "Offline";
  const effectiveDashboardGridSize = isDashboardGridMeasured && dashboardGridWidth < 860 ? 1 : dashboardGridLayoutSetting.cols;
  const isDashboardGridReady = isDashboardLayoutReady && isDashboardGridMeasured && dashboardGridWidth > 0;
  const dashboardGridRowHeight = effectiveDashboardGridSize === 1 ? 260 : 220;
  const dashboardGridEditMinHeight =
    dashboardGridLayoutSetting.rows * dashboardGridRowHeight + Math.max(0, dashboardGridLayoutSetting.rows - 1) * 16;
  const dashboardGridLayout: Layout = [
    ...dashboardWidgetLayout.map((widget) => {
      const width = Math.min(widget.w, effectiveDashboardGridSize);

      return {
        i: widget.id,
        x: Math.min(widget.x, effectiveDashboardGridSize - width),
        y: widget.y,
        w: width,
        h: Math.min(widget.h, effectiveDashboardGridSize),
        minW: 1,
        minH: 1,
        maxW: effectiveDashboardGridSize,
        maxH: dashboardWidgetMaxRows,
        isDraggable: isDashboardEditing,
        isResizable: isDashboardEditing,
      };
    }),
  ];
  const selectedDueDate = parseDateInput(todoDueDateDraft);
  const calendarDays = getCalendarDays(calendarMonth);
  const inboxNotes = notes.filter((note) => note.kind === "inbox");
  const formatDate = (date: string | null) => {
    if (!date) {
      return "-";
    }

    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);

    return parsedDate.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const getDueLabel = (memo: TodoMemo) => {
    if (memo.completedAt || !memo.dueDate) {
      return null;
    }

    const dueAt = new Date(`${memo.dueDate}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((dueAt.getTime() - today.getTime()) / 86_400_000);

    if (diffDays < 0) {
      return "기한 지남";
    }

    if (diffDays === 0) {
      return "오늘 마감";
    }

    if (diffDays === 1) {
      return "내일 마감";
    }

    return null;
  };

  const openNewTodo = () => {
    const defaultProject = projects[0];

    if (!defaultProject) {
      return;
    }

    setSelectedTodoId(null);
    setTodoProjectIdDraft(String(defaultProject.id));
    setTodoTitleDraft("");
    setTodoContentDraft("");
    setTodoContentTextDraft("");
    setTodoColorDraft("#1c69d4");
    setTodoDueDateDraft("");
    setCalendarMonth(new Date());
    setTodoCommentDraft("");
    setIsTodoModalOpen(true);
  };

  const openTodo = (memo: TodoMemo) => {
    setSelectedTodoId(memo.id);
    setTodoProjectIdDraft(String(memo.projectId));
    setTodoTitleDraft(memo.title);
    setTodoContentDraft(memo.content);
    setTodoContentTextDraft(getContentText(memo.content));
    setTodoColorDraft(memo.color);
    setTodoDueDateDraft(memo.dueDate ?? "");
    setCalendarMonth(parseDateInput(memo.dueDate ?? "") ?? new Date());
    setTodoCommentDraft("");
    setEditingTodoCommentId(null);
    setIsTodoModalOpen(true);
  };

  const persistTodo = async () => {
    const title = todoTitleDraft.trim();
    const projectId = Number(todoProjectIdDraft);
    const content = todoContentDraft.trim();

    if (!Number.isInteger(projectId) || projectId <= 0 || !title || !todoContentTextDraft.trim()) {
      return;
    }

    await requestTodo(selectedTodoId === null ? "/todos" : `/todos/${selectedTodoId}`, {
      method: selectedTodoId === null ? "POST" : "PATCH",
      body: JSON.stringify({ projectId, title, content, color: todoColorDraft, dueDate: todoDueDateDraft || null }),
    });
  };

  const closeTodoModal = async () => {
    await persistTodo();
    setIsTodoModalOpen(false);
  };

  const cleanupClosedTodoModal = (open: boolean) => {
    if (!open) {
      setSelectedTodoId(null);
      setIsDueDatePickerOpen(false);
    }
  };

  const toggleTodoDone = async (memo: TodoMemo) => {
    setTodoContextMenu(null);
    await requestTodo(`/todos/${memo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isCompleted: !memo.completedAt }),
    });
  };

  const addTodoComment = async () => {
    const body = todoCommentDraft.trim();

    if (!body || selectedTodoId === null) {
      return;
    }

    await requestTodo(editingTodoCommentId === null ? `/todos/${selectedTodoId}/comments` : `/todos/${selectedTodoId}/comments/${editingTodoCommentId}`, {
      method: editingTodoCommentId === null ? "POST" : "PATCH",
      body: JSON.stringify({ body }),
    });
    setTodoCommentDraft("");
    setEditingTodoCommentId(null);
  };

  const editTodoComment = (comment: TodoComment) => {
    setTodoCommentContextMenu(null);
    setEditingTodoCommentId(comment.id);
    setTodoCommentDraft(comment.body);
  };

  const deleteTodoComment = async (commentId: number) => {
    if (selectedTodoId === null) {
      return;
    }

    setTodoCommentContextMenu(null);
    await requestTodo(`/todos/${selectedTodoId}/comments/${commentId}`, { method: "DELETE" });

    if (editingTodoCommentId === commentId) {
      setEditingTodoCommentId(null);
      setTodoCommentDraft("");
    }
  };

  const deleteTodoMemo = async (memo: TodoMemo) => {
    setTodoContextMenu(null);
    await requestTodo(`/todos/${memo.id}`, { method: "DELETE" });

    if (selectedTodoId === memo.id) {
      setSelectedTodoId(null);
    }

    setIsTodoModalOpen(false);
  };

  const deleteTodo = async () => {
    if (!selectedTodo) {
      return;
    }

    await deleteTodoMemo(selectedTodo);
  };

  const requestTodo = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });

    if (!response.ok) {
      throw new Error(`Todo request failed: ${response.status}`);
    }

    return response.json();
  };

  const openNote = (note: Note) => {
    setSelectedNoteId(note.id);
    setNoteTitleDraft(note.title ?? "");
    setNoteContentDraft(note.content);
    setNoteContentTextDraft(getContentText(note.content));
    setIsNoteModalOpen(true);
  };

  const openNewInboxNote = async () => {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "inbox", title: null, content: newInboxNoteContent, color: "#f4b400" }),
    });

    if (!response.ok) {
      throw new Error(`Note request failed: ${response.status}`);
    }

    const note = (await response.json()) as Note;
    setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)]);
    openNote(note);
  };

  const persistNote = async () => {
    if (!selectedNote || !noteContentTextDraft.trim()) {
      return;
    }

    const response = await fetch(`/api/notes/${selectedNote.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: noteTitleDraft.trim() || null, content: noteContentDraft.trim() }),
    });

    if (!response.ok) {
      throw new Error(`Note request failed: ${response.status}`);
    }

    const note = (await response.json()) as Note;
    setNotes((items) => items.map((item) => (item.id === note.id ? note : item)));
  };

  const closeNoteModal = async () => {
    await persistNote();
    setIsNoteModalOpen(false);
  };

  const cleanupClosedNoteModal = (open: boolean) => {
    if (!open) {
      setSelectedNoteId(null);
    }
  };

  const deleteNote = async () => {
    if (!selectedNote) {
      return;
    }

    const response = await fetch(`/api/notes/${selectedNote.id}`, { method: "DELETE" });

    if (!response.ok) {
      throw new Error(`Note request failed: ${response.status}`);
    }

    setNotes((items) => items.filter((item) => item.id !== selectedNote.id));
    setIsNoteModalOpen(false);
    setSelectedNoteId(null);
  };

  const openReviewPr = (pullRequest: ReviewPullRequest) => {
    setReviewPrContextMenu(null);
    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
  };

  const openSlackListItem = (item: SlackListItem) => {
    setSelectedSlackListItemId(item.id);
    setSlackCellDrafts(
      Object.fromEntries(
        Object.entries(item.mappedFields)
          .filter(([, field]) => field.writable)
          .map(([key, field]) => [key, formatSlackFieldValue(field.value)]),
      ),
    );
    setSlackItemMessage(null);
  };

  const updateSlackListItemCells = async () => {
    if (!selectedSlackListItem || selectedSlackWritableFields.length === 0) {
      return;
    }

    setIsUpdatingSlackItem(true);
    setSlackItemMessage(null);

    try {
      const values = Object.fromEntries(
        selectedSlackWritableFields.map(([key, field]) => [
          key,
          parseSlackFieldDraft(slackCellDrafts[key] ?? "", field.type),
        ]),
      );
      const response = await fetch(`/api/slack/lists/items/${selectedSlackListItem.id}/cells`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const result = (await response.json().catch(() => null)) as SlackListItem | { error?: string } | null;

      if (!response.ok || !isSlackListItem(result)) {
        throw new Error(result && "error" in result ? result.error : `Slack item update failed: ${response.status}`);
      }

      const updatedItem = result;
      setSlackListItems((items) => items.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      setSlackCellDrafts(
        Object.fromEntries(
          Object.entries(updatedItem.mappedFields)
            .filter(([, field]) => field.writable)
            .map(([key, field]) => [key, formatSlackFieldValue(field.value)]),
        ),
      );
      setSlackItemMessage("Slack List에 저장했습니다.");
    } catch (error) {
      setSlackItemMessage(error instanceof Error ? error.message : "Slack List 저장에 실패했습니다.");
    } finally {
      setIsUpdatingSlackItem(false);
    }
  };

  const copyReviewPrBranchName = async (pullRequest: ReviewPullRequest) => {
    if (!pullRequest.branchName) {
      return;
    }

    setReviewPrContextMenu(null);
    await navigator.clipboard.writeText(pullRequest.branchName);
  };

  const playAlertSound = async () => {
    try {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextConstructor) {
        return;
      }

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startedAt = audioContext.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.24);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 0.25);
    } catch {
      // Browser autoplay/audio restrictions should not block visual notifications.
    }
  };

  const notifyUser = (title: string, body: string) => {
    if (!alertEnabledRef.current) {
      return;
    }

    void playAlertSound();

    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    new Notification(title, { body });
  };

  const saveDashboardWidgetLayout = (layout: DashboardWidgetLayout[]) => {
    setDashboardWidgetLayout(layout);
    getBrowserStorage()?.setItem(dashboardWidgetLayoutStorageKey, serializeDashboardWidgetLayout(layout));
  };

  const updateDashboardLayout = (layout: Layout, changedItem?: LayoutItem | null) => {
    if (effectiveDashboardGridSize !== dashboardGridLayoutSetting.cols) {
      return;
    }

    const nextLayout =
      changedItem && isDashboardWidgetId(changedItem.i)
        ? dashboardWidgetLayout.map((widget) =>
            widget.id === changedItem.i
              ? { i: widget.id, x: changedItem.x, y: changedItem.y, w: changedItem.w, h: changedItem.h }
              : { i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h },
          )
        : layout;

    saveDashboardWidgetLayout(normalizeDashboardWidgetLayout(nextLayout, dashboardGridLayoutSetting.cols));
  };

  const updateDashboardLayoutAfterItemChange = (layout: Layout, _oldItem: LayoutItem | null, newItem: LayoutItem | null) => {
    updateDashboardLayout(layout, newItem);
  };

  const getDashboardWidgetEditControls = (_widgetId: DashboardWidgetId) => {
    if (!isDashboardEditing) {
      return null;
    }

    return (
      <div className="dashboard-widget-edit-controls">
        <span
          className="dashboard-drag-handle"
          aria-label="드래그 핸들"
          title="드래그해서 이동"
        >
          <GripVertical size={16} />
        </span>
      </div>
    );
  };

  const loadWorkspaceUserStatuses = async () => {
    try {
      const response = await fetch("/api/workspace-users/status");

      if (!response.ok) {
        throw new Error(`Workspace users failed: ${response.status}`);
      }

      setWorkspaceUserStatuses((await response.json()) as WorkspaceUserStatus[]);
      setWorkspaceUsersStatus("Live");
    } catch {
      setWorkspaceUserStatuses([]);
      setWorkspaceUsersStatus("Offline");
    }
  };

  useEffect(() => {
    const isEnabled = window.localStorage.getItem(alertsStorageKey) === "true";

    alertEnabledRef.current = isEnabled;
  }, [alertsStorageKey]);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:13001";
    const reviewPrsUrl = `${backendUrl}/github/review-prs`;
    const events = new EventSource(`${reviewPrsUrl}/events`);

    fetch(reviewPrsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Review PRs failed: ${response.status}`);
        }

        return response.json() as Promise<ReviewPullRequest[]>;
      })
      .then((pullRequests) => {
        setReviewPullRequests(pullRequests);
        reviewPullRequestBaselineRef.current = toActiveReviewPullRequestIds(pullRequests);
        setReviewPrsStatus("Live");
      })
      .catch(() => {
        setReviewPrsStatus("Offline");
      });

    events.onmessage = (event) => {
      const pullRequests = JSON.parse(event.data) as ReviewPullRequest[];
      const previousActiveIds = reviewPullRequestBaselineRef.current;

      if (previousActiveIds) {
        for (const pullRequest of findNewActiveReviewPullRequests(previousActiveIds, pullRequests)) {
          notifyUser("새 리뷰 PR", `${pullRequest.repo}#${pullRequest.number} · ${pullRequest.title}`);
        }
      }

      reviewPullRequestBaselineRef.current = toActiveReviewPullRequestIds(pullRequests);
      setReviewPullRequests(pullRequests);
      setReviewPrsStatus("Live");
    };
    events.onerror = () => {
      setReviewPrsStatus("Offline");
    };

    return () => {
      events.close();
    };
  }, []);

  useEffect(() => {
    const todosUrl = `${backendUrl}/todos`;
    const events = new EventSource(`${todosUrl}/events`);

    fetch(todosUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Todos failed: ${response.status}`);
        }

        return response.json() as Promise<TodoMemo[]>;
      })
      .then((memos) => {
        setTodoMemos(memos);
        setTodoStatus("Live");
      })
      .catch(() => {
        setTodoStatus("Offline");
      });

    events.onmessage = (event) => {
      setTodoMemos(JSON.parse(event.data) as TodoMemo[]);
      setTodoStatus("Live");
    };
    events.onerror = () => {
      setTodoStatus("Offline");
    };

    return () => {
      events.close();
    };
  }, [backendUrl]);

  useEffect(() => {
    const notesUrl = "/api/notes";
    const events = new EventSource(`${notesUrl}/events`);

    fetch(notesUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Notes failed: ${response.status}`);
        }

        return response.json() as Promise<Note[]>;
      })
      .then((items) => {
        setNotes(items);
        setNotesStatus("Live");
      })
      .catch(() => {
        setNotesStatus("Offline");
      });

    events.onmessage = (event) => {
      setNotes(JSON.parse(event.data) as Note[]);
      setNotesStatus("Live");
    };
    events.onerror = () => {
      setNotesStatus("Offline");
    };

    return () => {
      events.close();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const storage = getBrowserStorage();
    const savedGridLayout = storage?.getItem(dashboardGridStorageKey) ?? null;
    const parsedGridLayout = parseDashboardGridLayout(savedGridLayout);
    const savedWidgetLayout = storage?.getItem(dashboardWidgetLayoutStorageKey) ?? null;
    const parsedWidgetLayout = parseDashboardWidgetLayout(savedWidgetLayout);
    setDashboardGridLayoutSetting(parsedGridLayout);
    setDashboardWidgetLayout(parsedWidgetLayout);

    if (storage && savedGridLayout !== serializeDashboardGridLayout(parsedGridLayout)) {
      storage.setItem(dashboardGridStorageKey, serializeDashboardGridLayout(parsedGridLayout));
    }

    if (storage && savedWidgetLayout !== serializeDashboardWidgetLayout(parsedWidgetLayout)) {
      storage.setItem(dashboardWidgetLayoutStorageKey, serializeDashboardWidgetLayout(parsedWidgetLayout));
    }

    setIsDashboardLayoutReady(true);
  }, []);

  useEffect(() => {
    const projectsUrl = "/api/projects";
    const events = new EventSource(`${projectsUrl}/events`);

    fetch(projectsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Projects failed: ${response.status}`);
        }

        return response.json() as Promise<Project[]>;
      })
      .then((items) => {
        setProjects(items);
        projectStatusBaselineRef.current = toHealthSiteStatusMap(toProjectStatusInputs(items));
        setProjectsStatus("Live");
      })
      .catch(() => {
        setProjects([]);
        setProjectsStatus("Offline");
      });

    events.onmessage = (event) => {
      const items = JSON.parse(event.data) as Project[];
      const statusInputs = toProjectStatusInputs(items);
      const previousStatuses = projectStatusBaselineRef.current;

      if (previousStatuses) {
        for (const project of findNewlyUnhealthySites(previousStatuses, statusInputs)) {
          notifyUser("Project Status 실패", `${project.name} · Unhealthy`);
        }
      }

      projectStatusBaselineRef.current = toHealthSiteStatusMap(statusInputs);
      setProjects(items);
      setProjectsStatus("Live");
    };
    events.onerror = () => {
      setProjectsStatus("Offline");
    };

    return () => {
      events.close();
    };
  }, []);

  useEffect(() => {
    const slackListsUrl = "/api/slack/lists/items";
    const events = new EventSource(`${slackListsUrl}/events`);

    fetch(slackListsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Slack Lists failed: ${response.status}`);
        }

        return response.json() as Promise<SlackListItem[]>;
      })
      .then((items) => {
        setSlackListItems(items);
        setSlackListsStatus("Live");
        void loadWorkspaceUserStatuses();
      })
      .catch(() => {
        setSlackListsStatus("Offline");
      });

    events.onmessage = (event) => {
      setSlackListItems(JSON.parse(event.data) as SlackListItem[]);
      setSlackListsStatus("Live");
      void loadWorkspaceUserStatuses();
    };
    events.onerror = () => {
      setSlackListsStatus("Offline");
    };

    return () => {
      events.close();
    };
  }, []);

  useEffect(() => {
    void loadWorkspaceUserStatuses();
  }, []);

  useEffect(() => {
    if (!selectedProjectStatus?.health || !healthChartRef.current) {
      return;
    }

    const history = selectedProjectStatus.health.history;
    const timelinePlugin = {
      id: "healthTimeline",
      afterDraw(chart: ChartInstance<"bar">) {
        const { ctx, chartArea } = chart;
        const gap = 6;
        const blockWidth = (chartArea.width - gap * (history.length - 1)) / history.length;
        const blockHeight = chartArea.height - 42;

        ctx.save();
        history.forEach((item, index) => {
          const x = chartArea.left + index * (blockWidth + gap);
          const y = chartArea.top + 8;

          ctx.fillStyle = item.status === "healthy" ? "#0fa336" : "#e22718";
          ctx.fillRect(x, y, blockWidth, blockHeight);
        });

        ctx.fillStyle = "#7e7e7e";
        ctx.font = "700 12px sans-serif";
        ctx.textBaseline = "top";
        history.forEach((item, index) => {
          if (index % 3 !== 0 && index !== history.length - 1) {
            return;
          }

          const x = chartArea.left + index * (blockWidth + gap);
          ctx.fillText(formatTime(item.checkedAt), x, chartArea.bottom - 22);
        });
        ctx.restore();
      },
    };

    const chart = new Chart(healthChartRef.current, {
      type: "bar",
      plugins: [timelinePlugin],
      data: {
        labels: history.map((item) => formatTime(item.checkedAt)),
        datasets: [
          {
            label: "Availability",
            data: history.map(() => 0),
            backgroundColor: "transparent",
            borderWidth: 0,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: 0,
        },
        scales: {
          x: {
            display: false,
            grid: { display: false },
          },
          y: {
            display: false,
            min: 0,
            max: 1,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: TooltipItem<"bar">[]) => formatDateTime(history[items[0].dataIndex].checkedAt),
              label: (item: TooltipItem<"bar">) => {
                const record = history[item.dataIndex];
                return `${getHealthStatusLabel(record.status)} · ${formatLatency(record.responseTimeMs)}`;
              },
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [selectedProjectStatus]);

  return (
    <main
      className="home"
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        setProjectContextMenu(null);
        setTodoContextMenu(null);
        setTodoCommentContextMenu(null);
        setReviewPrContextMenu(null);
      }}
    >
      <TopNav
        actions={
          <div className={`live-summary ${liveSummaryLabel.toLowerCase()}`} tabIndex={0}>
            <Badge className="status-badge summary-status" variant="outline">
              {liveSummaryLabel}
            </Badge>
            <div className="live-popover" role="status">
              <span>
                <i className={isReviewPrsLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                GitHub {isReviewPrsLive ? "Online" : "Offline"}
              </span>
              <span>
                <i className={isTodoLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Todoist {isTodoLive ? "Online" : "Offline"}
              </span>
              <span>
                <i className={isNotesLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Note {isNotesLive ? "Online" : "Offline"}
              </span>
              <span>
                <i className={isProjectsLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Project Status {isProjectsLive ? "Online" : "Offline"}
              </span>
              <span>
                <i className={isSlackListsLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Slack Lists {isSlackListsLive ? "Online" : "Offline"}
              </span>
              <span>
                <i className={isWorkspaceUsersLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Users {isWorkspaceUsersLive ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        }
      />

      <section className="dashboard" id="dashboard" aria-labelledby="dashboard-title">
          <div className="dashboard-heading">
            <div>
              <div className="m-stripe" aria-hidden="true" />
              <p className="eyebrow">Company workspace</p>
              <h1 id="dashboard-title">Work Dashboard</h1>
            </div>
            <div className="dashboard-heading-actions">
              <Button
                className={isDashboardEditing ? "dashboard-command-button active" : "dashboard-command-button"}
                onClick={() => setIsDashboardEditing((value) => !value)}
                type="button"
              >
                {isDashboardEditing ? "완료" : "편집"}
              </Button>
            </div>
          </div>

          <div className="dashboard-grid-shell" ref={dashboardGridRef}>
            {isDashboardGridReady ? (
              <GridLayout
                autoSize
                className={isDashboardEditing ? "dashboard-grid editing" : "dashboard-grid"}
                dragConfig={{
                  enabled: isDashboardEditing,
                  handle: ".dashboard-drag-handle",
                  cancel: ".dashboard-grid-no-drag",
                  threshold: 6,
                }}
                gridConfig={{
                  cols: effectiveDashboardGridSize,
                  rowHeight: dashboardGridRowHeight,
                  margin: [16, 16],
                  containerPadding: [0, 0],
                  maxRows: Infinity,
                }}
                layout={dashboardGridLayout}
                onDragStop={updateDashboardLayoutAfterItemChange}
                onResizeStop={updateDashboardLayoutAfterItemChange}
                positionStrategy={absoluteStrategy}
                resizeConfig={{ enabled: isDashboardEditing, handles: ["se"] }}
                style={isDashboardEditing ? { minHeight: dashboardGridEditMinHeight } : undefined}
                width={dashboardGridWidth}
              >
            <section
              className="dashboard-card pr-card"
              id="github"
              key="review-prs"
              aria-labelledby="github-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Github</p>
                  <h2 id="github-title">Review PRs</h2>
                </div>
                {getDashboardWidgetEditControls("review-prs")}
              </div>
              <div className="pr-list">
                {reviewPullRequests.length === 0 ? (
                  <p className="card-copy">리뷰 요청된 PR이 아직 없습니다.</p>
                ) : (
                  reviewPullRequests.map((pullRequest) => (
                    <article
                      className={pullRequest.isActive ? "pr-item" : "pr-item pr-item-handled"}
                      key={pullRequest.githubIssueId}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setTodoContextMenu(null);
                        setProjectContextMenu(null);
                        setReviewPrContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          githubIssueId: pullRequest.githubIssueId,
                        });
                      }}
                    >
                      <div className="pr-item-main">
                        <p className="repo">{pullRequest.repo}</p>
                        <h3>{pullRequest.title}</h3>
                        <p className="meta">
                          #{pullRequest.number} · {pullRequest.author} · updated{" "}
                          {new Date(pullRequest.githubUpdatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className="status-badge" variant="outline">
                        {pullRequest.isActive ? pullRequest.status : "Handled"}
                      </Badge>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section
              className="dashboard-card"
              key="todo"
              aria-labelledby="flow-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Projects</p>
                  <h2 id="flow-title">TODOIST</h2>
                </div>
                <div className="card-actions">
                  {projects.length > 0 ? (
                    <Button className="dashboard-card-action" type="button" onClick={openNewTodo}>
                      <Plus size={15} strokeWidth={1.8} />
                      <span>추가</span>
                    </Button>
                  ) : null}
                  {getDashboardWidgetEditControls("todo")}
                </div>
              </div>
              <div className="todo-list">
                {todoGroups.length === 0 ? (
                  <>
                    <p className="card-copy">{todoMemos.length === 0 ? "등록된 메모가 없습니다." : "프로젝트 정보를 불러오는 중입니다."}</p>
                    {projects.length === 0 ? (
                      <Link className="dashboard-card-footer-link" href="/settings/projects">
                        프로젝트 설정
                        <ArrowUpRight size={18} strokeWidth={1.7} />
                      </Link>
                    ) : null}
                  </>
                ) : (
                  todoGroups.map(({ project, memos }) => (
                    <section className="todo-project-group" key={project.id} aria-label={`${project.name} 할일`}>
                      <div className="todo-project-heading">
                        <span
                          className={project.logoUrl ? `todo-project-logo image ${project.logoVariant === "black" ? "black-logo" : "white-logo"}` : "todo-project-logo"}
                          aria-hidden="true"
                        >
                          {project.logoUrl ? <img src={project.logoUrl} alt="" /> : <FolderOpen size={14} />}
                        </span>
                        <h3>{project.name}</h3>
                      </div>
                      <div className="todo-project-items">
                        {memos.map((memo) => {
                          const dueLabel = getDueLabel(memo);

                          return (
                            <article
                              className={memo.completedAt ? "todo-item todo-item-done" : "todo-item"}
                              key={memo.id}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setReviewPrContextMenu(null);
                                setProjectContextMenu(null);
                                setTodoContextMenu({ x: event.clientX, y: event.clientY, todoId: memo.id });
                              }}
                            >
                              <span className="todo-color-bar" style={{ backgroundColor: memo.color }} aria-hidden="true" />
                              <button className="todo-open-button" type="button" onClick={() => openTodo(memo)}>
                                <span>
                                  <strong>{memo.title}</strong>
                                  <small>
                                    {memo.dueDate ? `마감 ${formatDate(memo.dueDate)} · ` : ""}
                                    작성 {formatDate(memo.createdAt)}
                                  </small>
                                </span>
                              </button>
                              {dueLabel ? (
                                <div className="todo-row-actions">
                                  <span className="due-alert">{dueLabel}</span>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </section>

            <section
              className="dashboard-card"
              key="projects"
              aria-labelledby="projects-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Projects</p>
                  <h2 id="projects-title">Info</h2>
                </div>
                <div className="card-actions">
                  {getDashboardWidgetEditControls("projects")}
                </div>
              </div>
              <div className="pr-list">
                {projects.length === 0 ? (
                  <p className="card-copy">등록된 프로젝트가 없습니다.</p>
                ) : (
                  projects.map((project) => (
                    <article
                      className="pr-item project-dashboard-item"
                      key={project.id}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setReviewPrContextMenu(null);
                        setTodoContextMenu(null);
                        setProjectContextMenu({ x: event.clientX, y: event.clientY, projectId: project.id });
                      }}
                    >
                      <span
                        className={project.logoUrl ? `health-logo image ${project.logoVariant === "black" ? "black-logo" : "white-logo"}` : "health-logo"}
                        aria-hidden="true"
                      >
                        {project.logoUrl ? <img src={project.logoUrl} alt="" /> : <FolderOpen size={18} />}
                      </span>
                      <Link className="project-list-main" href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                        <small>{project.healthApiUrl || project.description || `작성 ${formatDate(project.createdAt)}`}</small>
                      </Link>
                      <div className="health-site-meta">
                        {project.health ? (
                          <>
                            <span className={`health-status ${project.health.status}`}>{getHealthStatusLabel(project.health.status)}</span>
                            <small>{formatLatency(project.health.responseTimeMs)}</small>
                          </>
                        ) : (
                          <span className="health-status">No status</span>
                        )}
                      </div>
                    </article>
                  ))
                )}
                <Link className="dashboard-card-footer-link" href="/settings/projects">
                  설정 바로가기
                  <ArrowUpRight size={18} strokeWidth={1.7} />
                </Link>
              </div>
            </section>

            <section
              className="dashboard-card"
              key="slack-lists"
              aria-labelledby="slack-lists-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Slack</p>
                  <h2 id="slack-lists-title">Lists</h2>
                </div>
                <div className="card-actions">
                  <Badge className="status-badge" variant="outline">
                    {slackListItems.length}
                  </Badge>
                  {getDashboardWidgetEditControls("slack-lists")}
                </div>
              </div>
              <div className="pr-list">
                {slackListItems.length === 0 ? (
                  <>
                    <p className="card-copy">
                      {slackListsStatus === "Offline" ? "Slack Lists 연결을 확인하세요." : "동기화된 Slack List item이 없습니다."}
                    </p>
                    <Link className="dashboard-card-footer-link" href="/settings/slack">
                      Slack 설정
                      <ArrowUpRight size={18} strokeWidth={1.7} />
                    </Link>
                  </>
                ) : (
                  slackListItems.map((item) => (
                    <button
                      className="pr-item slack-list-open-button"
                      key={item.id}
                      type="button"
                      onClick={() => openSlackListItem(item)}
                    >
                      <div className="pr-item-main">
                        <p className="repo">{getSlackSourceLabel(item)}</p>
                        <h3>{item.title}</h3>
                        <p className="meta">{getSlackItemSummary(item)}</p>
                      </div>
                      <Badge className="status-badge" variant="outline">
                        {getSlackStatusLabel(item)}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section
              className="dashboard-card workspace-users-card"
              key="workspace-users"
              aria-labelledby="workspace-users-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Workspace</p>
                  <h2 id="workspace-users-title">Users</h2>
                </div>
                <div className="card-actions">
                  <Badge className="status-badge" variant="outline">
                    {workspaceUserStatuses.filter((item) => item.status === "working").length}/{workspaceUserStatuses.length}
                  </Badge>
                  {getDashboardWidgetEditControls("workspace-users")}
                </div>
              </div>
              <div className="workspace-user-status-list">
                {workspaceUserStatuses.length === 0 ? (
                  <>
                    <p className="card-copy">
                      {workspaceUsersStatus === "Offline" ? "사용자 상태를 불러오지 못했습니다." : "등록된 사용자가 없습니다."}
                    </p>
                    <Link className="dashboard-card-footer-link" href="/settings/users">
                      사용자 설정
                      <ArrowUpRight size={18} strokeWidth={1.7} />
                    </Link>
                  </>
                ) : (
                  workspaceUserStatuses.map((item) => (
                    <article className={`workspace-user-status-item ${item.status}`} key={item.user.id}>
                      <span className="health-logo" aria-hidden="true">
                        <UserRound size={17} />
                      </span>
                      <div className="workspace-user-status-main">
                        <div className="workspace-user-status-title">
                          <strong>{item.user.name}</strong>
                          <Badge className="status-badge" variant="outline">
                            {item.status === "working" ? "일하는 중" : "놀고 있음"}
                          </Badge>
                        </div>
                        {item.currentTasks.length > 0 ? (
                          <div className="workspace-user-task-list">
                            {item.currentTasks.slice(0, 2).map((task) => (
                              <p key={`${item.user.id}-${task.id}`}>
                                <span>{task.title}</span>
                                <small>
                                  {task.sourceName}
                                  {task.status ? ` · ${task.status}` : ""}
                                </small>
                              </p>
                            ))}
                            {item.currentTasks.length > 2 ? <small>+{item.currentTasks.length - 2} more</small> : null}
                          </div>
                        ) : (
                          <small className="workspace-user-idle-text">진행 중인 Slack 업무 없음</small>
                        )}
                      </div>
                    </article>
                  ))
                )}
                {workspaceUserStatuses.length > 0 ? (
                  <Link className="dashboard-card-footer-link" href="/settings/users">
                    사용자 설정
                    <ArrowUpRight size={18} strokeWidth={1.7} />
                  </Link>
                ) : null}
              </div>
            </section>

            <section
              className="dashboard-card"
              key="inbox"
              aria-labelledby="inbox-title"
            >
              <div className="card-header">
                <div>
                  <p className="eyebrow">Note</p>
                  <h2 id="inbox-title">Inbox</h2>
                </div>
                <div className="card-actions">
                  <Button className="dashboard-card-action" type="button" onClick={() => void openNewInboxNote()}>
                    <Plus size={15} strokeWidth={1.8} />
                    <span>추가</span>
                  </Button>
                  {getDashboardWidgetEditControls("inbox")}
                </div>
              </div>
              <div className="inbox-note-list">
                {inboxNotes.length === 0 ? (
                  <p className="card-copy">휘갈겨 둔 메모가 없습니다.</p>
                ) : (
                  inboxNotes.map((note) => (
                    <button className="inbox-note-item" type="button" key={note.id} onClick={() => openNote(note)}>
                      <StickyNote size={16} />
                      <span>{note.title || getContentText(note.content) || "Untitled"}</span>
                    </button>
                  ))
                )}
                <Link className="dashboard-card-footer-link" href="/notes">
                  전체 보기
                  <ArrowUpRight size={18} strokeWidth={1.7} />
                </Link>
              </div>
            </section>
              </GridLayout>
            ) : null}
          </div>
      </section>

      {todoContextMenu && todoContextTarget ? (
        <div
          className="tree-context-menu"
          style={{ left: todoContextMenu.x, top: todoContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void toggleTodoDone(todoContextTarget)}>
            {todoContextTarget.completedAt ? "완료 취소" : "완료 처리"}
          </button>
          <button className="danger" type="button" onClick={() => void deleteTodoMemo(todoContextTarget)}>
            삭제
          </button>
        </div>
      ) : null}

      {reviewPrContextMenu && reviewPrContextTarget ? (
        <div
          className="tree-context-menu"
          style={{ left: reviewPrContextMenu.x, top: reviewPrContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => openReviewPr(reviewPrContextTarget)}>
            바로가기
          </button>
          <button
            type="button"
            disabled={!reviewPrContextTarget.branchName}
            onClick={() => void copyReviewPrBranchName(reviewPrContextTarget)}
          >
            브랜치명 복사
          </button>
        </div>
      ) : null}

      {todoCommentContextMenu && todoCommentContextTarget ? (
        <div
          className="tree-context-menu"
          style={{ left: todoCommentContextMenu.x, top: todoCommentContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => editTodoComment(todoCommentContextTarget)}>
            수정
          </button>
          <button className="danger" type="button" onClick={() => void deleteTodoComment(todoCommentContextTarget.id)}>
            삭제
          </button>
        </div>
      ) : null}

      {projectContextMenu ? (
        <div
          className="tree-context-menu"
          style={{ left: projectContextMenu.x, top: projectContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {projects.find((project) => project.id === projectContextMenu.projectId)?.health ? (
            <button
              type="button"
              onClick={() => {
                setSelectedProjectStatusId(projectContextMenu.projectId);
                setProjectContextMenu(null);
              }}
            >
              상태보기
            </button>
          ) : (
            <button disabled type="button">
              상태 없음
            </button>
          )}
        </div>
      ) : null}

      <Dialog
        open={isTodoModalOpen}
        onOpenChange={(open) => (open ? setIsTodoModalOpen(true) : void closeTodoModal())}
        onOpenChangeComplete={cleanupClosedTodoModal}
      >
        <DialogContent className="todo-modal" showCloseButton={false}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Todo memo</p>
                <DialogTitle id="todo-modal-title">{selectedTodo ? "메모 상세" : "새 메모"}</DialogTitle>
                {selectedTodo ? (
                  <p className="modal-meta">
                    작성 {formatDate(selectedTodo.createdAt)}
                    {selectedTodo.completedAt ? ` · 완료 ${formatDate(selectedTodo.completedAt)}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="modal-header-actions">
                {selectedTodo ? (
                  <>
                    <Button
                      className="icon-button"
                      type="button"
                      aria-label={selectedTodo.completedAt ? "완료 취소" : "완료 처리"}
                      title={selectedTodo.completedAt ? "완료 취소" : "완료 처리"}
                      onClick={() => toggleTodoDone(selectedTodo)}
                    >
                      {selectedTodo.completedAt ? <RotateCcw size={18} /> : <Check size={18} />}
                    </Button>
                    <IconActionButton action="delete" type="button" onClick={deleteTodo} />
                  </>
                ) : null}
                <Button
                  className="icon-button"
                  type="button"
                  aria-label="닫기"
                  title="닫기"
                  onClick={() => void closeTodoModal()}
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            <Label className="field">
              <span>프로젝트</span>
              <select value={todoProjectIdDraft} onChange={(event) => setTodoProjectIdDraft(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Label>

            <Label className="field">
              <span>제목</span>
              <Input
                value={todoTitleDraft}
                onChange={(event) => setTodoTitleDraft(event.target.value)}
                placeholder="제목을 입력하세요"
              />
            </Label>

            <div className="field">
              <span>내용</span>
              <RichTextEditor
                key={selectedTodoId ?? "new"}
                variant="compact"
                value={todoContentDraft}
                onChange={(html, text) => {
                  setTodoContentDraft(html);
                  setTodoContentTextDraft(text);
                }}
              />
            </div>

            <div className="field">
              <span>마감기한</span>
              <Popover.Root
                open={isDueDatePickerOpen}
                onOpenChange={(open) => {
                  setIsDueDatePickerOpen(open);

                  if (open) {
                    setCalendarMonth(selectedDueDate ?? new Date());
                  }
                }}
              >
                <Popover.Trigger className="date-picker-trigger" type="button">
                  {selectedDueDate ? formatDate(todoDueDateDraft) : "마감일 선택"}
                  <Calendar size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner align="start" className="date-picker-positioner" sideOffset={8}>
                    <Popover.Popup className="date-picker-popover">
                      <div className="date-picker-header">
                        <button
                          type="button"
                          aria-label="이전 달"
                          onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <strong>
                          {calendarMonth.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                        </strong>
                        <button
                          type="button"
                          aria-label="다음 달"
                          onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="date-picker-weekdays">
                        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      <div className="date-picker-days">
                        {calendarDays.map((day) => (
                          <button
                            className={[
                              day.isCurrentMonth ? "" : "muted",
                              day.value === todoDueDateDraft ? "selected" : "",
                              day.value === toDateInput(new Date()) ? "today" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setTodoDueDateDraft(day.value);
                              setIsDueDatePickerOpen(false);
                            }}
                          >
                            {day.date.getDate()}
                          </button>
                        ))}
                      </div>
                      {todoDueDateDraft ? (
                        <button className="date-clear-button" type="button" onClick={() => setTodoDueDateDraft("")}>
                          마감일 지우기
                        </button>
                      ) : null}
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </div>

            <div className="field color-field">
              <span>색상</span>
              <div className="color-picker-row">
                <Input
                  type="color"
                  value={todoColorDraft}
                  onChange={(event) => setTodoColorDraft(event.target.value)}
                />
                <div className="color-presets" aria-label="색상 프리셋">
                  {todoColorPresets.map((color) => (
                    <Button
                      className={todoColorDraft === color ? "active" : ""}
                      key={color}
                      type="button"
                      aria-label={`${color} 색상 선택`}
                      style={{ backgroundColor: color }}
                      onClick={() => setTodoColorDraft(color)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {selectedTodo ? (
              <div className="comment-box">
                <div className="comment-input">
                  <Input
                    value={todoCommentDraft}
                    onChange={(event) => setTodoCommentDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (shouldSubmitTodoComment(event)) {
                        event.preventDefault();
                        void addTodoComment();
                      }
                    }}
                    placeholder="코멘트를 입력하세요"
                  />
                  <Button type="button" onClick={addTodoComment} disabled={!todoCommentDraft.trim()}>
                    {editingTodoCommentId === null ? "등록" : "수정"}
                  </Button>
                </div>
                <div className="comment-list">
                  {selectedTodo.comments.map((comment) => (
                    <article
                      className="comment-item"
                      key={comment.id}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setTodoCommentContextMenu({ x: event.clientX, y: event.clientY, commentId: comment.id });
                      }}
                    >
                      <div>
                        <p>{comment.body}</p>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </DialogContent>
      </Dialog>

      <Dialog
        open={isNoteModalOpen}
        onOpenChange={(open) => (open ? setIsNoteModalOpen(true) : void closeNoteModal())}
        onOpenChangeComplete={cleanupClosedNoteModal}
      >
        <DialogContent className="todo-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <DialogTitle>{selectedNote ? "메모 상세" : "새 메모"}</DialogTitle>
            </div>
            <div className="modal-header-actions">
              {selectedNote ? <IconActionButton action="delete" type="button" onClick={() => void deleteNote()} /> : null}
              <Button
                className="icon-button"
                type="button"
                aria-label="닫기"
                title="닫기"
                onClick={() => void closeNoteModal()}
              >
                <X size={18} />
              </Button>
            </div>
          </div>

          <Label className="field">
            <span>제목</span>
            <Input value={noteTitleDraft} onChange={(event) => setNoteTitleDraft(event.target.value)} placeholder="제목 없음" />
          </Label>

          <div className="field">
            <span>내용</span>
            <RichTextEditor
              key={selectedNoteId ?? "new-note"}
              variant="compact"
              value={noteContentDraft}
              onChange={(html, text) => {
                setNoteContentDraft(html);
                setNoteContentTextDraft(text);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedSlackListItem !== null} onOpenChange={(open) => !open && setSelectedSlackListItemId(null)}>
        <DialogContent className="todo-modal slack-list-modal" showCloseButton={false}>
          {selectedSlackListItem ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Slack List</p>
                  <DialogTitle>{selectedSlackListItem.title}</DialogTitle>
                  <p className="modal-meta">
                    {getSlackSourceLabel(selectedSlackListItem)} · {selectedSlackListItem.slackItemId}
                  </p>
                </div>
                <Button
                  className="icon-button"
                  type="button"
                  aria-label="닫기"
                  title="닫기"
                  onClick={() => setSelectedSlackListItemId(null)}
                >
                  <X size={18} />
                </Button>
              </div>

              <div className="slack-field-grid">
                {selectedSlackDisplayFields.map(([key, field]) => (
                  <article className="slack-field-item" key={key}>
                    <span>{field.label}</span>
                    <strong>{formatSlackFieldValue(field.value) || "-"}</strong>
                  </article>
                ))}
              </div>

              {selectedSlackWritableFields.length > 0 ? (
                <div className="slack-write-panel">
                  <h3>Writable fields</h3>
                  {selectedSlackWritableFields.map(([key, field]) => (
                    <Label className="field" key={key}>
                      <span>{field.label}</span>
                      <Input
                        value={slackCellDrafts[key] ?? ""}
                        onChange={(event) => setSlackCellDrafts((drafts) => ({ ...drafts, [key]: event.target.value }))}
                        placeholder={field.type}
                      />
                    </Label>
                  ))}
                  <div className="settings-form-footer">
                    <Button
                      className="primary-button"
                      type="button"
                      disabled={isUpdatingSlackItem}
                      onClick={() => void updateSlackListItemCells()}
                    >
                      {isUpdatingSlackItem ? "저장 중" : "Slack에 저장"}
                    </Button>
                    {slackItemMessage ? <p className={slackItemMessage.includes("저장했습니다") ? "success-text" : "danger-text"}>{slackItemMessage}</p> : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={selectedProjectStatus !== null} onOpenChange={(open) => !open && setSelectedProjectStatusId(null)}>
        <DialogContent className="health-modal" showCloseButton={false}>
          {selectedProjectStatus?.health ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Project Status</p>
                  <DialogTitle>{selectedProjectStatus.name}</DialogTitle>
                  <p className="modal-meta">{selectedProjectStatus.healthApiUrl}</p>
                </div>
                <Button
                  className="icon-button"
                  type="button"
                  aria-label="닫기"
                  title="닫기"
                  onClick={() => setSelectedProjectStatusId(null)}
                >
                  <X size={18} />
                </Button>
              </div>

              <div className="health-modal-summary">
                <span>
                  <strong>{getHealthRate(selectedProjectStatus.health)}%</strong>
                  healthy
                </span>
                <span>
                  <strong className={selectedProjectStatus.health.status}>{getHealthStatusLabel(selectedProjectStatus.health.status)}</strong>
                  current
                </span>
                <span>
                  <strong>{formatLatency(selectedProjectStatus.health.responseTimeMs)}</strong>
                  latest
                </span>
              </div>

              <div
                className="health-chart-panel"
                aria-label="최근 헬스체크 상태 기록"
                style={{ height: 260, border: "1px solid #262626", background: "#050505", padding: 16 }}
              >
                <canvas ref={healthChartRef} aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0 }} />
                <div
                  className="health-timeline-chart"
                  style={{
                    height: "100%",
                    display: "grid",
                    gridTemplateColumns: `repeat(${selectedProjectStatus.health.history.length}, minmax(0, 1fr))`,
                    gap: 6,
                    alignItems: "stretch",
                  }}
                >
                  {selectedProjectStatus.health.history.map((item, index) => (
                    <div
                      className="health-timeline-column"
                      key={item.checkedAt}
                      title={`${formatDateTime(item.checkedAt)} · ${getHealthStatusLabel(item.status)} · ${formatLatency(item.responseTimeMs)}`}
                      style={{
                        minWidth: 0,
                        display: "grid",
                        gridTemplateRows: "minmax(0, 1fr) auto",
                        gap: 10,
                      }}
                    >
                      <span
                        className={item.status}
                        style={{
                          display: "block",
                          background: item.status === "healthy" ? "#0fa336" : "#e22718",
                        }}
                      />
                      <small
                        className={shouldShowHealthTimelineLabel(index, selectedProjectStatus.health?.history.length ?? 0) ? undefined : "empty"}
                        style={{
                          overflow: "hidden",
                          color: "#7e7e7e",
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1,
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {shouldShowHealthTimelineLabel(index, selectedProjectStatus.health?.history.length ?? 0)
                          ? formatTime(item.checkedAt)
                          : ""}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="health-chart-legend" aria-hidden="true">
                <span><i className="healthy" />Healthy</span>
                <span><i className="unhealthy" />Unhealthy</span>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function getContentText(content: string): string {
  return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getHealthStatusLabel(status: ProjectHealth["status"]): string {
  return status === "healthy" ? "Healthy" : "Unhealthy";
}

function formatLatency(responseTimeMs: number | null): string {
  return responseTimeMs === null ? "timeout" : `${responseTimeMs}ms`;
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSlackFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(formatSlackFieldValue).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function parseSlackFieldDraft(value: string, type: string): unknown {
  const draft = value.trim();

  if (type === "user") {
    return draft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (type === "checkbox" || type === "completed") {
    return draft === "true" || draft === "1" || draft === "yes" || draft === "완료";
  }

  return draft;
}

function getSlackSourceLabel(item: SlackListItem): string {
  if (item.sourceName) {
    return item.sourceName;
  }

  return typeof item.rawItem.list_id === "string" && item.rawItem.list_id.trim()
    ? item.rawItem.list_id
    : `Source #${item.sourceId}`;
}

function getSlackItemSummary(item: SlackListItem): string {
  const summary = Object.entries(item.mappedFields)
    .filter(([key, field]) => key !== item.fieldRoles?.title && key !== "title" && field.display && formatSlackFieldValue(field.value))
    .slice(0, 3)
    .map(([, field]) => `${field.label} ${formatSlackFieldValue(field.value)}`)
    .join(" · ");

  return summary || `동기화 ${formatDateTime(item.lastSeenAt)}`;
}

function getSlackStatusLabel(item: SlackListItem): string {
  const statusKey = item.fieldRoles?.status ?? "status";
  const status = item.mappedFields[statusKey]?.value;
  return formatSlackFieldValue(status) || "Synced";
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSlackListItem(value: SlackListItem | { error?: string } | null): value is SlackListItem {
  return !!value && typeof value === "object" && "id" in value && "mappedFields" in value;
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shouldShowHealthTimelineLabel(index: number, total: number): boolean {
  if (total <= 12) {
    return true;
  }

  return index === 0 || index === total - 1 || index % Math.ceil(total / 6) === 0;
}

function getHealthRate(health: ProjectHealth): number {
  if (health.history.length === 0) {
    return 0;
  }

  const healthyCount = health.history.filter((item) => item.status === "healthy").length;
  return Math.round((healthyCount / health.history.length) * 100);
}

function toProjectStatusInputs(projects: Project[]): { id: number; name: string; status: ProjectHealth["status"] }[] {
  return projects.flatMap((project) => (project.health ? [{ id: project.id, name: project.name, status: project.health.status }] : []));
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      value: toDateInput(date),
    };
  });
}
