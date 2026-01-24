"use client";

import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

export function TilesRow<T extends { id: string; name: string }>({
  title,
  items,
  activeId,
  onSelect,
  className,
}: {
  title?: string;
  items: T[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {title ? <div className="text-xs text-zinc-500">{title}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Chip active={activeId === null} onClick={() => onSelect(null)}>
          All
        </Chip>
        {items.map((it) => (
          <Chip key={it.id} active={activeId === it.id} onClick={() => onSelect(it.id)}>
            {it.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
