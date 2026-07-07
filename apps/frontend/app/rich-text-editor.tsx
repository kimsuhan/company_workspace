"use client";

import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ChangeEvent } from "react";
import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string, text: string) => void;
  variant?: "compact" | "document";
};

type UploadedFile = {
  id: number;
  originalName: string;
  publicUrl: string;
};

export function RichTextEditor({ value, onChange, variant = "document" }: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const isDocumentVariant = variant === "document";
  const editor = useEditor({
    extensions: [
      StarterKit,
      ...(isDocumentVariant
        ? [
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            Image,
            TaskList,
            TaskItem.configure({ nested: true }),
          ]
        : []),
    ],
    content: value || undefined,
    editorProps: {
      handleKeyDown(_view, event) {
        if (event.key !== "Tab") {
          return false;
        }

        event.preventDefault();
        if (event.shiftKey) {
          editor?.chain().focus().liftListItem("listItem").run();
          return true;
        }

        editor?.chain().focus().sinkListItem("listItem").run();
        return true;
      },
    },
    immediatelyRender: false,
    onCreate({ editor }) {
      editor.commands.unsetAllMarks();
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  useEffect(() => {
    if (!editor || !value || editor.getHTML() === value) {
      return;
    }

    editor.commands.setContent(value, { emitUpdate: false });
    editor.commands.unsetAllMarks();
  }, [editor, value]);

  const uploadEditorFile = async (file: File): Promise<UploadedFile> => {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/files", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json().catch(() => null)) as UploadedFile | { error?: string } | null;

    if (!response.ok || !result || "error" in result) {
      throw new Error(result && "error" in result ? result.error : `File upload failed: ${response.status}`);
    }

    return result as UploadedFile;
  };

  const insertImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const uploaded = await uploadEditorFile(file);

      editor?.chain().focus().setImage({ src: uploaded.publicUrl, alt: uploaded.originalName }).run();
    } finally {
      event.target.value = "";
    }
  };

  const insertAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const uploaded = await uploadEditorFile(file);

      editor
        ?.chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [
            {
              type: "text",
              text: uploaded.originalName,
              marks: [{ type: "link", attrs: { href: `/api/files/${uploaded.id}/download` } }],
            },
          ],
        })
        .run();
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="tiptap-editor">
      <div className="tiptap-toolbar" aria-label="편집 도구">
        {isDocumentVariant ? (
          <>
            <button
              className={editor?.isActive("heading", { level: 2 }) ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleHeading({ level: 2 }).run();
              }}
            >
              H2
            </button>
            <button
              className={editor?.isActive("heading", { level: 3 }) ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleHeading({ level: 3 }).run();
              }}
            >
              H3
            </button>
          </>
        ) : null}
        <button
          className={editor?.isActive("bold") ? "active" : ""}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleBold().run();
          }}
        >
          B
        </button>
        <button
          className={editor?.isActive("italic") ? "active" : ""}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleItalic().run();
          }}
        >
          I
        </button>
        {isDocumentVariant ? (
          <>
            <button
              className={editor?.isActive("strike") ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleStrike().run();
              }}
            >
              Strike
            </button>
            <button
              className={editor?.isActive("code") ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleCode().run();
              }}
            >
              Code
            </button>
          </>
        ) : null}
        <button
          className={editor?.isActive("bulletList") ? "active" : ""}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleBulletList().run();
          }}
        >
          Bullets
        </button>
        <button
          className={editor?.isActive("orderedList") ? "active" : ""}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().toggleOrderedList().run();
          }}
        >
          1.
        </button>
        {isDocumentVariant ? (
          <>
            <button
              className={editor?.isActive("taskList") ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleTaskList().run();
              }}
            >
              Tasks
            </button>
            <button
              className={editor?.isActive("blockquote") ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleBlockquote().run();
              }}
            >
              Quote
            </button>
            <button
              className={editor?.isActive("codeBlock") ? "active" : ""}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleCodeBlock().run();
              }}
            >
              Block
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().setHorizontalRule().run();
              }}
            >
              HR
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              }}
            >
              Table
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().addRowAfter().run();
              }}
            >
              Row+
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().addColumnAfter().run();
              }}
            >
              Col+
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().deleteRow().run();
              }}
            >
              Row-
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().deleteColumn().run();
              }}
            >
              Col-
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().deleteTable().run();
              }}
            >
              Table-
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                imageInputRef.current?.click();
              }}
            >
              Image
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                attachmentInputRef.current?.click();
              }}
            >
              Attach
            </button>
          </>
        ) : null}
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().undo().run();
          }}
        >
          Undo
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            editor?.chain().focus().redo().run();
          }}
        >
          Redo
        </button>
        {isDocumentVariant ? (
          <>
            <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => void insertImage(event)} />
            <input ref={attachmentInputRef} hidden type="file" onChange={(event) => void insertAttachment(event)} />
          </>
        ) : null}
      </div>
      <EditorContent className="tiptap-content" editor={editor} />
    </div>
  );
}
