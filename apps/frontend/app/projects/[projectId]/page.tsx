"use client";

import { ChevronRight, FileText, Folder, FolderOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { RichTextEditor } from "../../rich-text-editor";
import { TopNav } from "../../top-nav";

type Project = {
  id: number;
  name: string;
  description: string | null;
};

type ProjectNode = {
  id: number;
  projectId: number;
  parentId: number | null;
  type: "folder" | "document";
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: ProjectNode[];
};

type TreeMenu = {
  x: number;
  y: number;
  parentId: number | null;
  nodeId: number | null;
};

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [tree, setTree] = useState<ProjectNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [treeMenu, setTreeMenu] = useState<TreeMenu | null>(null);
  const [createDraftType, setCreateDraftType] = useState<ProjectNode["type"] | null>(null);
  const [createTitleDraft, setCreateTitleDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("대기");
  const [message, setMessage] = useState<string | null>(null);

  const nodes = useMemo(() => flattenProjectNodes(tree), [tree]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedDocument = selectedNode?.type === "document" ? selectedNode : null;

  useEffect(() => {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      setMessage("프로젝트 ID가 올바르지 않습니다.");
      return;
    }

    void loadProject();
    void loadTree();
  }, [projectId]);

  useEffect(() => {
    if (!selectedDocument) {
      setTitleDraft("");
      setContentDraft("");
      setIsDirty(false);
      setSaveStatus("대기");
      return;
    }

    setTitleDraft(selectedDocument.title);
    setContentDraft(selectedDocument.content);
    setIsDirty(false);
    setSaveStatus("저장됨");
  }, [selectedDocument?.id]);

  useEffect(() => {
    if (!selectedDocument || !isDirty) {
      return;
    }

    const title = titleDraft.trim();

    if (!title) {
      setSaveStatus("제목 필요");
      return;
    }

    setSaveStatus("저장 대기");
    const timeout = window.setTimeout(() => {
      setSaveStatus("저장 중");
      requestProject(`/api/projects/${projectId}/nodes/${selectedDocument.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, content: contentDraft }),
      })
        .then(() => {
          setIsDirty(false);
          setSaveStatus("저장됨");
          return loadTree();
        })
        .catch((error: unknown) => {
          setSaveStatus("저장 실패");
          setMessage(getErrorMessage(error));
        });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [contentDraft, isDirty, projectId, selectedDocument, titleDraft]);

  const loadProject = async () => {
    const response = await fetch("/api/projects");
    const result = (await response.json().catch(() => null)) as Project[] | null;

    if (response.ok && Array.isArray(result)) {
      setProject(result.find((item) => item.id === projectId) ?? null);
    }
  };

  const loadTree = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tree`);
      const result = (await response.json().catch(() => null)) as ProjectNode[] | { error?: string } | null;

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Project tree failed: ${response.status}`);
      }

      setTree(result);
      setMessage(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const selectNode = (node: ProjectNode) => {
    setTreeMenu(null);

    if (node.type === "folder") {
      setExpandedIds((current) => toggleExpanded(current, node.id));
      return;
    }

    setSelectedNodeId(node.id);
  };

  const openTreeMenu = (event: MouseEvent, node: ProjectNode | null) => {
    event.preventDefault();
    event.stopPropagation();

    setTreeMenu({
      x: event.clientX,
      y: event.clientY,
      parentId: node?.type === "folder" ? node.id : node?.parentId ?? null,
      nodeId: node?.id ?? null,
    });
    setCreateDraftType(null);
    setCreateTitleDraft("");
  };

  const createNode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!treeMenu || !createDraftType) {
      return;
    }

    const title = createTitleDraft.trim();

    if (!title) {
      return;
    }

    try {
      const node = await requestProject<ProjectNode>(`/api/projects/${projectId}/nodes`, {
        method: "POST",
        body: JSON.stringify({ type: createDraftType, title, parentId: treeMenu.parentId, content: "" }),
      });

      if (treeMenu.parentId !== null) {
        setExpandedIds((current) => new Set(current).add(treeMenu.parentId as number));
      }

      if (node.type === "document") {
        setSelectedNodeId(node.id);
      }

      setTreeMenu(null);
      setCreateDraftType(null);
      setCreateTitleDraft("");
      await loadTree();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const deleteNode = async () => {
    if (!treeMenu?.nodeId) {
      return;
    }

    try {
      await requestProject(`/api/projects/${projectId}/nodes/${treeMenu.nodeId}`, { method: "DELETE" });

      if (selectedNodeId === treeMenu.nodeId) {
        setSelectedNodeId(null);
      }

      setTreeMenu(null);
      setCreateDraftType(null);
      setCreateTitleDraft("");
      await loadTree();
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const moveNode = async (target: ProjectNode | null) => {
    if (!draggedNodeId) {
      return;
    }

    const parentId = target?.type === "folder" ? target.id : target?.parentId ?? null;
    const sortOrder = target?.type === "folder" ? target.children.length : target ? target.sortOrder + 1 : tree.length;

    try {
      await requestProject(`/api/projects/${projectId}/nodes/${draggedNodeId}/move`, {
        method: "PATCH",
        body: JSON.stringify({ parentId, sortOrder }),
      });

      if (target?.type === "folder") {
        setExpandedIds((current) => new Set(current).add(target.id));
      }

      await loadTree();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setDraggedNodeId(null);
    }
  };

  return (
    <main className="home" onClick={() => setTreeMenu(null)}>
      <TopNav />

      <section className="project-workspace" aria-labelledby="project-title">
        <aside
          className="project-tree-pane"
          onContextMenu={(event) => openTreeMenu(event, null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => void moveNode(null)}
        >
          <div className="project-pane-header">
            <div>
              <p className="eyebrow">Project</p>
              <h1 id="project-title">{project?.name ?? "Project"}</h1>
            </div>
            <Link className="secondary-button project-back-link" href="/projects">
              목록
            </Link>
          </div>

          <div className="project-tree">
            {tree.length === 0 ? <p className="card-copy">등록된 문서가 없습니다.</p> : null}
            {tree.map((node) => (
              <ProjectTreeNode
                expandedIds={expandedIds}
                key={node.id}
                node={node}
                onContextMenu={openTreeMenu}
                onDragStart={setDraggedNodeId}
                onDrop={moveNode}
                onSelect={selectNode}
                selectedNodeId={selectedNodeId}
              />
            ))}
          </div>
        </aside>

        <section className="project-editor-pane">
          {selectedDocument ? (
            <>
              <div className="project-editor-header">
                <div>
                  <p className="eyebrow">Document</p>
                  <Input
                    className="project-title-input"
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>
                <span className="save-status">{saveStatus}</span>
              </div>

              <div className="field project-editor-body">
                <span>본문</span>
                <RichTextEditor
                  key={selectedDocument.id}
                  value={contentDraft}
                  onChange={(html) => {
                    setContentDraft(html);
                    setIsDirty(true);
                  }}
                />
              </div>
            </>
          ) : (
            <div className="project-empty-editor">
              <FileText size={34} />
              <p>{message ?? "문서를 선택하세요."}</p>
            </div>
          )}
        </section>

        {treeMenu ? (
          <div className="tree-context-menu" style={{ left: treeMenu.x, top: treeMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setCreateDraftType("folder")}>
              <Folder size={14} /> 폴더 추가
            </button>
            <button type="button" onClick={() => setCreateDraftType("document")}>
              <FileText size={14} /> 문서 추가
            </button>
            {createDraftType ? (
              <form className="tree-create-form" onSubmit={createNode}>
                <input
                  autoFocus
                  value={createTitleDraft}
                  onChange={(event) => setCreateTitleDraft(event.target.value)}
                  placeholder={createDraftType === "folder" ? "폴더 이름" : "문서 이름"}
                />
                <Button className="primary-button compact-button" type="submit" disabled={!createTitleDraft.trim()}>
                  추가
                </Button>
              </form>
            ) : null}
            {treeMenu.nodeId ? (
              <button className="danger" type="button" onClick={() => void deleteNode()}>
                <Trash2 size={14} /> 삭제
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ProjectTreeNode({
  expandedIds,
  node,
  onContextMenu,
  onDragStart,
  onDrop,
  onSelect,
  selectedNodeId,
}: {
  expandedIds: Set<number>;
  node: ProjectNode;
  onContextMenu: (event: MouseEvent, node: ProjectNode | null) => void;
  onDragStart: (nodeId: number) => void;
  onDrop: (node: ProjectNode) => void;
  onSelect: (node: ProjectNode) => void;
  selectedNodeId: number | null;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isFolder = node.type === "folder";

  return (
    <div className="project-tree-node">
      <button
        className={selectedNodeId === node.id ? "project-tree-row selected" : "project-tree-row"}
        draggable
        type="button"
        onClick={() => onSelect(node)}
        onContextMenu={(event) => onContextMenu(event, node)}
        onDragStart={() => onDragStart(node.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDrop(node);
        }}
      >
        {isFolder ? <ChevronRight className={isExpanded ? "expanded" : ""} size={14} /> : <span className="tree-spacer" />}
        {isFolder ? (isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />) : <FileText size={16} />}
        <span>{node.title}</span>
      </button>

      {isFolder && isExpanded ? (
        <div className="project-tree-children">
          {node.children.map((child) => (
            <ProjectTreeNode
              expandedIds={expandedIds}
              key={child.id}
              node={child}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onSelect={onSelect}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function flattenProjectNodes(nodes: ProjectNode[]): ProjectNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectNodes(node.children)]);
}

function toggleExpanded(current: Set<number>, id: number): Set<number> {
  const next = new Set(current);

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  return next;
}

async function requestProject<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const result = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok || (result && typeof result === "object" && "error" in result)) {
    throw new Error(result && typeof result === "object" && "error" in result ? result.error : `Project request failed: ${response.status}`);
  }

  return result as T;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
