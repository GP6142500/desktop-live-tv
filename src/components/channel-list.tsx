"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Channel } from "@/data/channels";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChannelListProps {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (channel: Channel) => void;
}

export function ChannelList({
  channels,
  selectedId,
  onSelect,
}: ChannelListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  // 选中项滚动到可视区域（配合 ↑↓ 键盘切换）
  React.useEffect(() => {
    if (!selectedId) return;
    const idx = channels.findIndex((c) => c.id === selectedId);
    if (idx !== -1) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedId, channels, virtualizer]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium">频道列表</span>
        <span className="text-xs text-muted-foreground">
          {channels.length} 个
        </span>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto">
        {channels.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            没有匹配的频道
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const channel = channels[item.index];
              const active = channel.id === selectedId;
              return (
                <button
                  key={channel.id}
                  onClick={() => onSelect(channel)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Radio
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground/50"
                    )}
                  />
                  <span className="flex-1 truncate">{channel.name}</span>
                  {channel.urls.length > 1 && (
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                      {channel.urls.length}源
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
