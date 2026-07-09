type CommentShortcutEvent = {
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
};

export function shouldSubmitTodoComment(event: CommentShortcutEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}
