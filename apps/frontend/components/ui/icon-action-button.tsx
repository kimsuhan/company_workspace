import type { ComponentProps } from "react";
import { Pencil, Save, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

const actionMeta = {
  delete: { icon: Trash2, label: "삭제", tone: "danger" },
  edit: { icon: Pencil, label: "편집", tone: "primary" },
  save: { icon: Save, label: "저장", tone: "primary" },
} as const;

type IconActionButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  action: keyof typeof actionMeta;
  compact?: boolean;
  label?: string;
};

function IconActionButton({ action, className, compact = false, label, title, ...props }: IconActionButtonProps) {
  const meta = actionMeta[action];
  const Icon = meta.icon;
  const accessibleLabel = label ?? meta.label;

  return (
    <Button
      className={cn("icon-button icon-action-button", meta.tone, compact && "compact", className)}
      title={typeof title === "string" ? title : accessibleLabel}
      aria-label={accessibleLabel}
      {...props}
    >
      <Icon size={compact ? 16 : 18} />
    </Button>
  );
}

export { IconActionButton };
