"use client";

import { Plus, UserRound } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceUser = {
  id: number;
  name: string;
  slackUserId: string | null;
  profileImageFileId: number | null;
  profileImageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type UploadedFile = {
  id: number;
  originalName: string;
  publicUrl: string;
};

const usersUrl = "/api/workspace-users";
const filesUrl = "/api/files";
const maxProfileImageBytes = 10_000_000;

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [slackUserIdDraft, setSlackUserIdDraft] = useState("");
  const [profileImageFileIdDraft, setProfileImageFileIdDraft] = useState<number | null>(null);
  const [profileImageUrlDraft, setProfileImageUrlDraft] = useState<string | null>(null);
  const [profileImageFileName, setProfileImageFileName] = useState("");
  const [profileImageInputKey, setProfileImageInputKey] = useState(0);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceUser | null>(null);
  const [userMenu, setUserMenu] = useState<{ x: number; y: number; userId: number } | null>(null);
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
          profileImageFileId: profileImageFileIdDraft,
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
    setUserMenu(null);
    setEditingUserId(user.id);
    setNameDraft(user.name);
    setSlackUserIdDraft(user.slackUserId ?? "");
    setProfileImageFileIdDraft(user.profileImageFileId);
    setProfileImageUrlDraft(user.profileImageUrl);
    setProfileImageFileName(user.profileImageUrl ? "현재 프로필 사진" : "");
    setProfileImageInputKey((value) => value + 1);
    setMessage(null);
    setIsUserFormOpen(true);
  };

  const resetForm = () => {
    setEditingUserId(null);
    setNameDraft("");
    setSlackUserIdDraft("");
    setProfileImageFileIdDraft(null);
    setProfileImageUrlDraft(null);
    setProfileImageFileName("");
    setProfileImageInputKey((value) => value + 1);
  };

  const closeUserForm = () => {
    setIsUserFormOpen(false);
  };

  const cleanupClosedUserForm = (open: boolean) => {
    if (!open) {
      resetForm();
    }
  };

  const readProfileImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("이미지 파일만 등록할 수 있습니다.");
      event.target.value = "";
      setProfileImageInputKey((value) => value + 1);
      return;
    }

    if (file.size > maxProfileImageBytes) {
      setMessage("프로필 사진은 10MB 이하로 등록하세요.");
      event.target.value = "";
      setProfileImageInputKey((value) => value + 1);
      return;
    }

    try {
      const uploaded = await uploadFile(file);

      setProfileImageFileIdDraft(uploaded.id);
      setProfileImageUrlDraft(uploaded.publicUrl);
      setProfileImageFileName(uploaded.originalName);
      setMessage(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
      event.target.value = "";
      setProfileImageInputKey((value) => value + 1);
    }
  };

  return (
    <div className="settings-layout settings-list-layout" onClick={() => setUserMenu(null)}>
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
            <article
              className="settings-site-item project-list-item"
              key={user.id}
              onContextMenu={(event) => {
                event.preventDefault();
                setUserMenu({ x: event.clientX, y: event.clientY, userId: user.id });
              }}
            >
              <span className={user.profileImageUrl ? "health-logo profile-image" : "health-logo"} aria-hidden="true">
                {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : <UserRound size={18} />}
              </span>
              <div className="project-list-main">
                <strong>{user.name}</strong>
              </div>
              <div className="health-site-meta">
                <small>Updated {formatDateTime(user.updatedAt)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      {userMenu ? (
        <div
          className="tree-context-menu"
          style={{ left: userMenu.x, top: userMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const user = users.find((item) => item.id === userMenu.userId);

            if (!user) {
              return null;
            }

            return (
              <>
                <button type="button" onClick={() => editUser(user)}>
                  수정
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => {
                    setUserMenu(null);
                    setDeleteTarget(user);
                  }}
                >
                  삭제
                </button>
              </>
            );
          })()}
        </div>
      ) : null}

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
              <p className="modal-meta">관리 대상 직원의 프로필 사진과 Slack User ID를 관리합니다.</p>
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
            <Label className="field">
              <span>프로필 사진</span>
              <div className="file-upload-control">
                <label className="secondary-button compact-button file-picker-button">
                  파일 선택
                  <input key={profileImageInputKey} hidden type="file" accept="image/*" onChange={readProfileImageFile} />
                </label>
                <span className="file-picker-name">{profileImageFileName || "선택된 파일 없음"}</span>
              </div>
            </Label>
            {profileImageUrlDraft ? (
              <div className="logo-upload-preview">
                <span className="health-logo profile-image">
                  <img src={profileImageUrlDraft} alt="" />
                </span>
                <p>{profileImageFileName || "선택된 프로필 사진"}</p>
                <Button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => {
                    setProfileImageFileIdDraft(null);
                    setProfileImageUrlDraft(null);
                    setProfileImageFileName("");
                    setProfileImageInputKey((value) => value + 1);
                  }}
                >
                  제거
                </Button>
              </div>
            ) : null}
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
