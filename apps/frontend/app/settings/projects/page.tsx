"use client";

import { FolderOpen, Plus } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoFileId: number | null;
  logoVariant: "black" | "white";
  healthApiUrl: string | null;
  health: {
    status: "healthy" | "unhealthy";
    checkedAt: string;
    responseTimeMs: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const projectsUrl = "/api/projects";
const projectStatusTestUrl = "/api/projects/health/test";
const filesUrl = "/api/files";
const maxLogoFileBytes = 10_000_000;

type ProjectStatusTestResult = {
  status: "healthy" | "unhealthy";
  responseTimeMs: number | null;
  statusCode: number | null;
  error: string | null;
};

type UploadedFile = {
  id: number;
  originalName: string;
  publicUrl: string;
};

type ProjectMenu = {
  x: number;
  y: number;
  projectId: number;
};

export default function SettingsProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [healthApiUrlDraft, setHealthApiUrlDraft] = useState("");
  const [logoDataUrlDraft, setLogoDataUrlDraft] = useState<string | null>(null);
  const [logoFileIdDraft, setLogoFileIdDraft] = useState<number | null>(null);
  const [logoVariantDraft, setLogoVariantDraft] = useState<"black" | "white">("black");
  const [logoFileName, setLogoFileName] = useState("");
  const [logoInputKey, setLogoInputKey] = useState(0);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState<ProjectMenu | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusTestMessage, setStatusTestMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusTesting, setIsStatusTesting] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(projectsUrl);
      const result = (await response.json().catch(() => null)) as Project[] | { error?: string } | null;

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Projects request failed: ${response.status}`);
      }

      setProjects(result);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = nameDraft.trim();

    if (!name) {
      setMessage("프로젝트 이름을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(editingProjectId === null ? projectsUrl : `${projectsUrl}/${editingProjectId}`, {
        method: editingProjectId === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description: descriptionDraft.trim() || null,
          healthApiUrl: healthApiUrlDraft.trim() || null,
          logoFileId: logoFileIdDraft,
          logoUrl: logoFileIdDraft === null ? logoDataUrlDraft : null,
          logoVariant: logoVariantDraft,
        }),
      });
      const result = (await response.json().catch(() => null)) as Project | { error?: string } | null;

      if (!response.ok || !result || "error" in result) {
        throw new Error(result && "error" in result ? result.error : `Project save failed: ${response.status}`);
      }

      await loadProjects();
      closeProjectForm();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const editProject = (project: Project) => {
    setProjectMenu(null);
    setEditingProjectId(project.id);
    setNameDraft(project.name);
    setDescriptionDraft(project.description ?? "");
    setHealthApiUrlDraft(project.healthApiUrl ?? "");
    setLogoDataUrlDraft(project.logoUrl);
    setLogoFileIdDraft(project.logoFileId);
    setLogoVariantDraft(project.logoVariant);
    setLogoFileName(project.logoUrl ? "현재 로고" : "");
    setLogoInputKey((value) => value + 1);
    setMessage(null);
    setStatusTestMessage(null);
    setIsProjectFormOpen(true);
  };

  const testProjectStatus = async () => {
    const healthApiUrl = healthApiUrlDraft.trim();

    if (!healthApiUrl) {
      setStatusTestMessage("Status API URL을 입력하세요.");
      return;
    }

    setIsStatusTesting(true);
    setStatusTestMessage(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(projectStatusTestUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ healthApiUrl }),
      });
      const result = (await response.json().catch(() => null)) as ProjectStatusTestResult | { error?: string } | null;

      if (!response.ok || !result || !("status" in result)) {
        throw new Error(result && "error" in result ? result.error ?? `Status test failed: ${response.status}` : `Status test failed: ${response.status}`);
      }

      const status = result.status === "healthy" ? "Healthy" : "Unhealthy";
      const latency = result.responseTimeMs === null ? "timeout" : `${result.responseTimeMs}ms`;
      const reason = result.error ? ` · ${result.error}` : result.statusCode ? ` · HTTP ${result.statusCode}` : "";
      setStatusTestMessage(`${status} · ${latency}${reason}`);
    } catch (error) {
      setStatusTestMessage(getErrorMessage(error));
    } finally {
      window.clearTimeout(timeout);
      setIsStatusTesting(false);
    }
  };

  const readLogoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("이미지 파일만 등록할 수 있습니다.");
      event.target.value = "";
      setLogoInputKey((value) => value + 1);
      return;
    }

    if (file.size > maxLogoFileBytes) {
      setMessage("로고 이미지는 10MB 이하로 등록하세요.");
      event.target.value = "";
      setLogoInputKey((value) => value + 1);
      return;
    }

    try {
      const uploaded = await uploadFile(file);

      setLogoDataUrlDraft(uploaded.publicUrl);
      setLogoFileIdDraft(uploaded.id);
      setLogoFileName(uploaded.originalName);
      setMessage(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
      event.target.value = "";
      setLogoInputKey((value) => value + 1);
    }
  };

  const deleteProject = async (project: Project) => {
    setProjectMenu(null);
    setDeletingProjectId(project.id);
    setMessage(null);

    try {
      const response = await fetch(`${projectsUrl}/${project.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok || result?.error) {
        throw new Error(result?.error ?? `Project delete failed: ${response.status}`);
      }

      if (editingProjectId === project.id) {
        resetForm();
      }

      await loadProjects();
      setDeleteProjectTarget(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setDeletingProjectId(null);
    }
  };

  const resetForm = () => {
    setEditingProjectId(null);
    setNameDraft("");
    setDescriptionDraft("");
    setHealthApiUrlDraft("");
    setLogoDataUrlDraft(null);
    setLogoFileIdDraft(null);
    setLogoVariantDraft("black");
    setLogoFileName("");
    setLogoInputKey((value) => value + 1);
    setStatusTestMessage(null);
  };

  const openNewProject = () => {
    resetForm();
    setMessage(null);
    setIsProjectFormOpen(true);
  };

  const closeProjectForm = () => {
    setIsProjectFormOpen(false);
  };

  const cleanupClosedProjectForm = (open: boolean) => {
    if (!open) {
      resetForm();
    }
  };

  return (
    <div className="settings-layout settings-list-layout" onClick={() => setProjectMenu(null)}>
      <section className="dashboard-card settings-card" aria-labelledby="project-list-title">
        <div className="card-header">
          <div>
            <p className="eyebrow">Registered</p>
            <h2 id="project-list-title">Projects</h2>
          </div>
          <Button className="endpoint-add-button" type="button" onClick={openNewProject}>
            <Plus size={15} strokeWidth={1.8} />
            <span>추가</span>
          </Button>
        </div>

        <div className="settings-site-list">
          {isLoading ? <p className="card-copy">프로젝트를 불러오는 중입니다.</p> : null}
          {!isLoading && message ? <p className="card-copy">{message}</p> : null}
          {!isLoading && !message && projects.length === 0 ? <p className="card-copy">등록된 프로젝트가 없습니다.</p> : null}
          {projects.map((project) => (
            <article
              className="settings-site-item project-list-item"
              key={project.id}
              onContextMenu={(event) => {
                event.preventDefault();
                setProjectMenu({ x: event.clientX, y: event.clientY, projectId: project.id });
              }}
            >
              <span
                className={project.logoUrl ? `health-logo image ${project.logoVariant === "black" ? "black-logo" : "white-logo"}` : "health-logo"}
                aria-hidden="true"
              >
                {project.logoUrl ? <img src={project.logoUrl} alt="" /> : <FolderOpen size={18} />}
              </span>
              <div className="project-list-main">
                <strong>{project.name}</strong>
                <small>{project.healthApiUrl || project.description || "문서와 폴더를 관리합니다."}</small>
              </div>
              <div className="health-site-meta">
                {project.health ? (
                  <>
                    <span className={`health-status ${project.health.status}`}>{getStatusLabel(project.health.status)}</span>
                    <small>{formatLatency(project.health.responseTimeMs)}</small>
                  </>
                ) : (
                  <small>No status</small>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {projectMenu ? (
        <div
          className="tree-context-menu"
          style={{ left: projectMenu.x, top: projectMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const project = projects.find((item) => item.id === projectMenu.projectId);

            if (!project) {
              return null;
            }

            return (
              <>
                <button type="button" onClick={() => editProject(project)}>
                  수정
                </button>
                <button className="danger" type="button" onClick={() => setDeleteProjectTarget(project)}>
                  삭제
                </button>
              </>
            );
          })()}
        </div>
      ) : null}

      <Dialog
        open={isProjectFormOpen}
        onOpenChange={(open) => (open ? setIsProjectFormOpen(true) : closeProjectForm())}
        onOpenChangeComplete={cleanupClosedProjectForm}
      >
        <DialogContent className="settings-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Project</p>
              <DialogTitle>{editingProjectId === null ? "Project 추가" : "Project 수정"}</DialogTitle>
              <p className="modal-meta">프로젝트 이름과 설명을 관리합니다.</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={saveProject}>
            <Label className="field">
              <span>이름</span>
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="프로젝트 이름" />
            </Label>

            <Label className="field">
              <span>설명</span>
              <Textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="짧은 설명"
              />
            </Label>
            <Label className="field">
              <span>Status API URL</span>
              <div className="settings-url-row">
                <Input
                  value={healthApiUrlDraft}
                  onChange={(event) => setHealthApiUrlDraft(event.target.value)}
                  placeholder="https://admin.suhan.dev/health"
                />
                <Button
                  className="secondary-button test-button"
                  type="button"
                  disabled={isStatusTesting || !healthApiUrlDraft.trim()}
                  onClick={testProjectStatus}
                >
                  {isStatusTesting ? "Testing" : "Test"}
                </Button>
              </div>
            </Label>
            {statusTestMessage ? <p className="settings-inline-message">{statusTestMessage}</p> : null}
            <Label className="field">
              <span>Logo File</span>
              <div className="file-upload-control">
                <label className="secondary-button compact-button file-picker-button">
                  파일 선택
                  <input key={logoInputKey} hidden type="file" accept="image/*" onChange={readLogoFile} />
                </label>
                <span className="file-picker-name">{logoFileName || "선택된 파일 없음"}</span>
              </div>
            </Label>
            {logoDataUrlDraft ? (
              <div className="logo-upload-preview">
                <span className={`health-logo image ${logoVariantDraft === "black" ? "black-logo" : "white-logo"}`}>
                  <img src={logoDataUrlDraft} alt="" />
                </span>
                <p>{logoFileName || "선택된 로고"}</p>
                <Button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => {
                    setLogoDataUrlDraft(null);
                    setLogoFileIdDraft(null);
                    setLogoFileName("");
                    setLogoInputKey((value) => value + 1);
                  }}
                >
                  제거
                </Button>
              </div>
            ) : null}
            <label className="switch-field">
              <span>
                <strong>화이트 로고</strong>
                <small>켜면 어두운 배경, 끄면 블랙 로고용 흰 배경을 사용합니다.</small>
              </span>
              <input
                type="checkbox"
                checked={logoVariantDraft === "white"}
                onChange={(event) => setLogoVariantDraft(event.target.checked ? "white" : "black")}
              />
              <i aria-hidden="true" />
            </label>

            <div className="settings-form-footer">
              <Button className="primary-button" type="submit" disabled={isSaving || !nameDraft.trim()}>
                {isSaving ? "저장 중" : editingProjectId === null ? "등록" : "수정"}
              </Button>
              <Button className="secondary-button" type="button" onClick={closeProjectForm}>
                취소
              </Button>
              {message ? <p>{message}</p> : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteProjectTarget !== null} onOpenChange={(open) => !open && setDeleteProjectTarget(null)}>
        <DialogContent className="settings-confirm-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Delete</p>
              <DialogTitle>Project 삭제</DialogTitle>
              <p className="modal-meta">{deleteProjectTarget ? `${deleteProjectTarget.name} 프로젝트를 삭제할까요?` : ""}</p>
            </div>
          </div>
          <div className="settings-form-footer">
            <Button
              className="danger-button"
              type="button"
              disabled={!deleteProjectTarget || deletingProjectId === deleteProjectTarget.id}
              onClick={() => deleteProjectTarget && void deleteProject(deleteProjectTarget)}
            >
              {deleteProjectTarget && deletingProjectId === deleteProjectTarget.id ? "삭제 중" : "삭제"}
            </Button>
            <Button className="secondary-button" type="button" onClick={() => setDeleteProjectTarget(null)}>
              취소
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "요청 시간이 초과되었습니다.";
  }

  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function getStatusLabel(status: "healthy" | "unhealthy"): string {
  return status === "healthy" ? "Healthy" : "Unhealthy";
}

function formatLatency(responseTimeMs: number | null): string {
  return responseTimeMs === null ? "timeout" : `${responseTimeMs}ms`;
}

async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(filesUrl, {
    method: "POST",
    body: formData,
  });
  const result = (await response.json().catch(() => null)) as UploadedFile | { error?: string } | null;

  if (!response.ok || !result || "error" in result) {
    throw new Error(result && "error" in result ? result.error : `File upload failed: ${response.status}`);
  }

  return result as UploadedFile;
}
