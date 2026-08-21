"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";

import type { Channel } from "@/data/channels";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  onSelect: (channel: Channel) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  channels,
  onSelect,
}: CommandPaletteProps) {
  // 按分类分组，便于快速定位
  const grouped = React.useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const ch of channels) {
      const list = map.get(ch.category) ?? [];
      list.push(ch);
      map.set(ch.category, list);
    }
    return [...map.entries()];
  }, [channels]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative mt-[12vh] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        <Command
          label="频道搜索"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="搜索频道名称或分类…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[50vh] overflow-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              未找到匹配的频道
            </Command.Empty>
            {grouped.map(([category, list]) => (
              <Command.Group key={category} heading={category}>
                {list.map((channel) => (
                  <Command.Item
                    key={channel.id}
                    value={`${channel.name} ${channel.category}`}
                    onSelect={() => {
                      onSelect(channel);
                      onOpenChange(false);
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <span>{channel.name}</span>
                    {channel.urls.length > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {channel.urls.length} 源
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
