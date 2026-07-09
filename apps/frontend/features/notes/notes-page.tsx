"use client";

import { FileText, Inbox, Plus, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { RichTextEditor } from "@/components/rich-text-editor";
import { TopNav } from "@/components/top-nav";

import { newInboxNoteContent } from "./note-defaults";

type NoteKind = "inbox" | "daily";

type Note = {
  id: number;
  kind: NoteKind;
  title: string | null;
  content: string;
  color: string;
  noteDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const noteFilters = ["all", "inbox", "daily"] as const;
type NoteFilter = (typeof noteFilters)[number];

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("대기");
  const [message, setMessage] = useState<string | null>(null);

  const filteredNotes = notes.filter((note) => filter === "all" || note.kind === filter);
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  useEffect(() => {
    void loadNotes();
    const events = new EventSource("/api/notes/events");

    events.onmessage = (event) => {
      const nextNotes = JSON.parse(event.data) as Note[];
      setNotes(nextNotes);
      setMessage(null);
    };
    events.onerror = () => {
      setMessage("노트 연결이 끊겼습니다.");
    };

    return () => events.close();
  }, []);

  useEffect(() => {
    if (!selectedNote) {
      setTitleDraft("");
      setContentDraft("");
      setIsDirty(false);
      setSaveStatus("대기");
      return;
    }

    setTitleDraft(selectedNote.title ?? "");
    setContentDraft(selectedNote.content);
    setIsDirty(false);
    setSaveStatus("저장됨");
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!selectedNote || !isDirty) {
      return;
    }

    const title = titleDraft.trim();
    const content = contentDraft.trim();

    if (!content) {
      setSaveStatus("내용 필요");
      return;
    }

    if ((selectedNote.title ?? "") === title && selectedNote.content === contentDraft) {
      return;
    }

    setSaveStatus("저장 대기");
    const timeout = window.setTimeout(() => {
      setSaveStatus("저장 중");
      requestNote(`/api/notes/${selectedNote.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title || null, content }),
      })
        .then(() => {
          setIsDirty(false);
          setSaveStatus("저장됨");
        })
        .catch((error: unknown) => {
          setSaveStatus("저장 실패");
          setMessage(getErrorMessage(error));
        });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [contentDraft, isDirty, selectedNote, titleDraft]);

  const loadNotes = async () => {
    try {
      const response = await fetch("/api/notes");
      const result = (await response.json().catch(() => null)) as Note[] | { error?: string } | null;

      if (!response.ok || !Array.isArray(result)) {
        throw new Error(result && !Array.isArray(result) && result.error ? result.error : `Notes failed: ${response.status}`);
      }

      setNotes(result);
      setMessage(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const createInboxNote = async () => {
    try {
      const note = await requestNote<Note>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ kind: "inbox", title: null, content: newInboxNoteContent, color: "#f4b400" }),
      });
      setSelectedNoteId(note.id);
      setFilter("inbox");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const deleteSelectedNote = async () => {
    if (!selectedNote) {
      return;
    }

    try {
      await requestNote(`/api/notes/${selectedNote.id}`, { method: "DELETE" });
      setSelectedNoteId(null);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <main className="home">
      <TopNav />

      <section className="notes-workspace" aria-labelledby="notes-title">
        <aside className="notes-sidebar">
          <div className="project-pane-header">
            <div>
              <p className="eyebrow">Note</p>
              <h1 id="notes-title">Inbox</h1>
            </div>
            <Button className="quick-add-button" type="button" onClick={createInboxNote}>
              <Plus size={15} strokeWidth={1.8} />
              <span>추가</span>
            </Button>
          </div>

          <div className="note-filter-tabs" aria-label="노트 필터">
            {noteFilters.map((item) => (
              <button className={filter === item ? "active" : ""} key={item} type="button" onClick={() => setFilter(item)}>
                {item === "all" ? "All" : item === "inbox" ? "Inbox" : "Daily"}
              </button>
            ))}
          </div>

          <div className="note-list">
            {filteredNotes.length === 0 ? (
              <p className="card-copy">{filter === "daily" ? "데일리 노트 작성은 아직 열지 않았습니다." : "등록된 메모가 없습니다."}</p>
            ) : (
              filteredNotes.map((note) => (
                <button
                  className={selectedNoteId === note.id ? "note-list-item selected" : "note-list-item"}
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  {note.kind === "daily" ? <FileText size={16} /> : <StickyNote size={16} />}
                  <span>
                    <strong>{note.title || getContentText(note.content) || "Untitled"}</strong>
                    <small>{note.kind === "daily" ? note.noteDate ?? "Daily" : "Inbox"}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="note-editor-pane">
          {selectedNote ? (
            <>
              <div className="project-editor-header">
                <div>
                  <p className="eyebrow">{selectedNote.kind === "daily" ? "Daily" : "Inbox"}</p>
                  <Input
                    className="project-title-input"
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="제목 없음"
                  />
                </div>
                <div className="modal-header-actions">
                  <span className="save-status">{saveStatus}</span>
                  <Button className="icon-button danger" type="button" aria-label="삭제" title="삭제" onClick={deleteSelectedNote}>
                    <Trash2 size={18} />
                  </Button>
                </div>
              </div>

              <div className="field project-editor-body">
                <span>본문</span>
                <RichTextEditor
                  key={selectedNote.id}
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
              <Inbox size={34} />
              <p>{message ?? "메모를 선택하세요."}</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

async function requestNote<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const result = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    throw new Error(result && typeof result === "object" && "error" in result && result.error ? result.error : `Note request failed: ${response.status}`);
  }

  return result as T;
}

function getContentText(content: string): string {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청에 실패했습니다.";
}
