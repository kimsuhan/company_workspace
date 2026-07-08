"use client";

import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceUser = {
  id: number;
  name: string;
  slackUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const usersUrl = "/api/workspace-users";

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [slackUserIdDraft, setSlackUserIdDraft] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceUser | null>(null);
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(usersUrl);
      const result = (await response.json().catch(() => null)) as WorkspaceUser[] | { error?: string } | null;

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Users request failed: ${response.status}`);
      }

      setUsers(result);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = nameDraft.trim();

    if (!name) {
      setMessage("직원 이름을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(editingUserId === null ? usersUrl : `${usersUrl}/${editingUserId}`, {
        method: editingUserId === null ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slackUserId: slackUserIdDraft.trim() || null,
        }),
      });
      const result = (await response.json().catch(() => null)) as WorkspaceUser | { error?: string } | null;

      if (!response.ok || !result || "error" in result) {
        throw new Error(result && "error" in result ? result.error : `User save failed: ${response.status}`);
      }

      await loadUsers();
      closeUserForm();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteUser = async (user: WorkspaceUser) => {
    setDeletingUserId(user.id);
    setMessage(null);

    try {
      const response = await fetch(`${usersUrl}/${user.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok || result?.error) {
        throw new Error(result?.error ?? `User delete failed: ${response.status}`);
      }

      await loadUsers();
      setDeleteTarget(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setDeletingUserId(null);
    }
  };

  const openNewUser = () => {
    resetForm();
    setMessage(null);
    setIsUserFormOpen(true);
  };

  const editUser = (user: WorkspaceUser) => {
    setEditingUserId(user.id);
    setNameDraft(user.name);
    setSlackUserIdDraft(user.slackUserId ?? "");
    setMessage(null);
    setIsUserFormOpen(true);
  };

  const resetForm = () => {
    setEditingUserId(null);
    setNameDraft("");
    setSlackUserIdDraft("");
  };

  const closeUserForm = () => {
    setIsUserFormOpen(false);
  };

  const cleanupClosedUserForm = (open: boolean) => {
    if (!open) {
      resetForm();
    }
  };

  return (
    <div className="settings-layout settings-list-layout">
      <section className="dashboard-card settings-card" aria-labelledby="workspace-users-title">
        <div className="card-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 id="workspace-users-title">Users</h2>
          </div>
          <Button className="endpoint-add-button" type="button" onClick={openNewUser}>
            <Plus size={15} strokeWidth={1.8} />
            <span>추가</span>
          </Button>
        </div>

        <div className="settings-site-list">
          {isLoading ? <p className="card-copy">사용자를 불러오는 중입니다.</p> : null}
          {!isLoading && message ? <p className="card-copy">{message}</p> : null}
          {!isLoading && !message && users.length === 0 ? <p className="card-copy">등록된 사용자가 없습니다.</p> : null}
          {users.map((user) => (
            <article className="settings-site-item project-list-item" key={user.id}>
              <span className="health-logo" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <div className="project-list-main">
                <strong>{user.name}</strong>
                <small>{user.slackUserId ?? "Slack User ID 미매핑"}</small>
              </div>
              <div className="health-site-meta">
                <span className={user.slackUserId ? "health-status healthy" : "health-status"}>
                  {user.slackUserId ? "Mapped" : "Unmapped"}
                </span>
                <small>Updated {formatDateTime(user.updatedAt)}</small>
              </div>
              <div className="settings-site-actions">
                <Button className="secondary-button compact-button" type="button" onClick={() => editUser(user)}>
                  <Pencil size={14} />
                  <span>수정</span>
                </Button>
                <Button className="danger-button compact-button" type="button" onClick={() => setDeleteTarget(user)}>
                  <Trash2 size={14} />
                  <span>삭제</span>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Dialog
        open={isUserFormOpen}
        onOpenChange={(open) => (open ? setIsUserFormOpen(true) : closeUserForm())}
        onOpenChangeComplete={cleanupClosedUserForm}
      >
        <DialogContent className="settings-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Workspace User</p>
              <DialogTitle>{editingUserId === null ? "사용자 추가" : "사용자 수정"}</DialogTitle>
              <p className="modal-meta">관리 대상 직원과 Slack User ID를 1:1로 연결합니다.</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={saveUser}>
            <Label className="field">
              <span>이름</span>
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="직원 이름" />
            </Label>
            <Label className="field">
              <span>Slack User ID</span>
              <Input value={slackUserIdDraft} onChange={(event) => setSlackUserIdDraft(event.target.value)} placeholder="U08HELASRED" />
            </Label>
            <div className="settings-form-footer">
              <Button className="primary-button" type="submit" disabled={isSaving || !nameDraft.trim()}>
                {isSaving ? "저장 중" : editingUserId === null ? "등록" : "수정"}
              </Button>
              <Button className="secondary-button" type="button" onClick={closeUserForm}>
                취소
              </Button>
              {message ? <p>{message}</p> : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="settings-confirm-modal" showCloseButton={false}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Delete</p>
              <DialogTitle>사용자 삭제</DialogTitle>
              <p className="modal-meta">{deleteTarget ? `${deleteTarget.name} 사용자를 삭제할까요?` : ""}</p>
            </div>
          </div>
          <div className="settings-form-footer">
            <Button
              className="danger-button"
              type="button"
              disabled={!deleteTarget || deletingUserId === deleteTarget.id}
              onClick={() => deleteTarget && void deleteUser(deleteTarget)}
            >
              {deleteTarget && deletingUserId === deleteTarget.id ? "삭제 중" : "삭제"}
            </Button>
            <Button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
