"use client";

import { Popover } from "@base-ui/react/popover";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance, TooltipItem } from "chart.js";
import {
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  GripVertical,
  RotateCcw,
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

import { TodoContentEditor } from "./todo-content-editor";
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
import { TopNav } from "./top-nav";

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
  title: string;
  content: string;
  color: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  comments: TodoComment[];
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
  const [projectsStatus, setProjectsStatus] = useState("Loading");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTodoId, setSelectedTodoId] = useState<number | null>(null);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [todoTitleDraft, setTodoTitleDraft] = useState("");
  const [todoContentDraft, setTodoContentDraft] = useState("");
  const [todoContentTextDraft, setTodoContentTextDraft] = useState("");
  const [todoColorDraft, setTodoColorDraft] = useState("#1c69d4");
  const [todoDueDateDraft, setTodoDueDateDraft] = useState("");
  const [isDueDatePickerOpen, setIsDueDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [todoCommentDraft, setTodoCommentDraft] = useState("");
  const [todoContextMenu, setTodoContextMenu] = useState<TodoContextMenu | null>(null);
  const [reviewPrContextMenu, setReviewPrContextMenu] = useState<ReviewPrContextMenu | null>(null);
  const [selectedProjectStatusId, setSelectedProjectStatusId] = useState<number | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenu | null>(null);
  const [dashboardGridLayoutSetting, setDashboardGridLayoutSetting] = useState<DashboardGridLayout>(defaultDashboardGridLayout);
  const [dashboardWidgetLayout, setDashboardWidgetLayout] = useState<DashboardWidgetLayout[]>(defaultDashboardWidgetLayout);
  const [isDashboardEditing, setIsDashboardEditing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { containerRef: dashboardGridRef, mounted: isDashboardGridMeasured, width: dashboardGridWidth } = useContainerWidth();
  const healthChartRef = useRef<HTMLCanvasElement | null>(null);
  const alertEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const reviewPullRequestBaselineRef = useRef<Set<number> | null>(null);
  const projectStatusBaselineRef = useRef<Map<number, ProjectHealth["status"]> | null>(null);

  const selectedTodo = todoMemos.find((memo) => memo.id === selectedTodoId);
  const todoContextTarget = todoMemos.find((memo) => memo.id === todoContextMenu?.todoId) ?? null;
  const reviewPrContextTarget =
    reviewPullRequests.find((pullRequest) => pullRequest.githubIssueId === reviewPrContextMenu?.githubIssueId) ?? null;
  const selectedProjectStatus = projects.find((project) => project.id === selectedProjectStatusId && project.health) ?? null;
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:13001";
  const alertsStorageKey = "suhan-dashboard-alerts-enabled";
  const isReviewPrsLive = reviewPrsStatus === "Live";
  const isTodoLive = todoStatus === "Live";
  const isProjectsLive = projectsStatus === "Live";
  const liveServiceCount = [isReviewPrsLive, isTodoLive, isProjectsLive].filter(Boolean).length;
  const liveSummaryLabel = liveServiceCount === 3 ? "Live" : liveServiceCount > 0 ? "Partial" : "Offline";
  const effectiveDashboardGridSize = isDashboardGridMeasured && dashboardGridWidth < 860 ? 1 : dashboardGridLayoutSetting.cols;
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
    setSelectedTodoId(null);
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
    setTodoTitleDraft(memo.title);
    setTodoContentDraft(memo.content);
    setTodoContentTextDraft(getContentText(memo.content));
    setTodoColorDraft(memo.color);
    setTodoDueDateDraft(memo.dueDate ?? "");
    setCalendarMonth(parseDateInput(memo.dueDate ?? "") ?? new Date());
    setTodoCommentDraft("");
    setIsTodoModalOpen(true);
  };

  const persistTodo = async () => {
    const title = todoTitleDraft.trim();
    const content = todoContentDraft.trim();

    if (!title || !todoContentTextDraft.trim()) {
      return;
    }

    await requestTodo(selectedTodoId === null ? "/todos" : `/todos/${selectedTodoId}`, {
      method: selectedTodoId === null ? "POST" : "PATCH",
      body: JSON.stringify({ title, content, color: todoColorDraft, dueDate: todoDueDateDraft || null }),
    });
  };

  const closeTodoModal = async () => {
    await persistTodo();
    setIsTodoModalOpen(false);
    setSelectedTodoId(null);
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

    await requestTodo(`/todos/${selectedTodoId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    setTodoCommentDraft("");
  };

  const deleteTodoComment = async (commentId: number) => {
    if (selectedTodoId === null) {
      return;
    }

    await requestTodo(`/todos/${selectedTodoId}/comments/${commentId}`, { method: "DELETE" });
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

  const openReviewPr = (pullRequest: ReviewPullRequest) => {
    setReviewPrContextMenu(null);
    window.open(pullRequest.url, "_blank", "noopener,noreferrer");
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
    window.localStorage.setItem(dashboardWidgetLayoutStorageKey, serializeDashboardWidgetLayout(layout));
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
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedGridLayout = window.localStorage.getItem(dashboardGridStorageKey);
    const parsedGridLayout = parseDashboardGridLayout(savedGridLayout);
    const savedWidgetLayout = window.localStorage.getItem(dashboardWidgetLayoutStorageKey);
    const parsedWidgetLayout = parseDashboardWidgetLayout(savedWidgetLayout);
    setDashboardGridLayoutSetting(parsedGridLayout);
    setDashboardWidgetLayout(parsedWidgetLayout);

    if (savedGridLayout !== serializeDashboardGridLayout(parsedGridLayout)) {
      window.localStorage.setItem(dashboardGridStorageKey, serializeDashboardGridLayout(parsedGridLayout));
    }

    if (savedWidgetLayout !== serializeDashboardWidgetLayout(parsedWidgetLayout)) {
      window.localStorage.setItem(dashboardWidgetLayoutStorageKey, serializeDashboardWidgetLayout(parsedWidgetLayout));
    }
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
                <i className={isProjectsLive ? "status-dot live" : "status-dot offline"} aria-hidden="true" />
                Project Status {isProjectsLive ? "Online" : "Offline"}
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
                className={isDashboardEditing ? "quick-add-button active" : "quick-add-button"}
                onClick={() => setIsDashboardEditing((value) => !value)}
                type="button"
              >
                {isDashboardEditing ? "Done" : "Edit"}
              </Button>
            </div>
          </div>

          <div className="dashboard-grid-shell" ref={dashboardGridRef}>
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
                  <p className="eyebrow">Memo</p>
                  <h2 id="flow-title">TODOIST</h2>
                </div>
                <div className="card-actions">
                  <Button className="quick-add-button" type="button" onClick={openNewTodo}>
                    추가
                  </Button>
                  {getDashboardWidgetEditControls("todo")}
                </div>
              </div>
              <div className="todo-list">
                {todoMemos.length === 0 ? (
                  <p className="card-copy">등록된 메모가 없습니다.</p>
                ) : (
                  todoMemos.map((memo) => {
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
                  })
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
                  <p className="eyebrow">Overview</p>
                  <h2 id="projects-title">Projects</h2>
                </div>
                <div className="card-actions">
                  <a className="settings-shortcut-link" href="/settings/projects">
                    설정 바로가기
                    <ArrowUpRight size={18} strokeWidth={1.7} />
                  </a>
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
                      <a className="project-list-main" href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                        <small>{project.healthApiUrl || project.description || `작성 ${formatDate(project.createdAt)}`}</small>
                      </a>
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
              </div>
            </section>
            </GridLayout>
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
              <span>제목</span>
              <Input
                value={todoTitleDraft}
                onChange={(event) => setTodoTitleDraft(event.target.value)}
                placeholder="제목을 입력하세요"
              />
            </Label>

            <div className="field">
              <span>내용</span>
              <TodoContentEditor
                key={selectedTodoId ?? "new"}
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
                    placeholder="코멘트를 입력하세요"
                  />
                  <Button type="button" onClick={addTodoComment} disabled={!todoCommentDraft.trim()}>
                    등록
                  </Button>
                </div>
                <div className="comment-list">
                  {selectedTodo.comments.map((comment) => (
                    <article className="comment-item" key={comment.id}>
                      <div>
                        <p>{comment.body}</p>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                      <IconActionButton
                        action="delete"
                        compact
                        type="button"
                        label="코멘트 삭제"
                        onClick={() => deleteTodoComment(comment.id)}
                      />
                    </article>
                  ))}
                </div>
              </div>
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
