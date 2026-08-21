"use client";

import * as React from "react";
import { ListVideo, Search, Tv, PanelRightClose, PanelRightOpen, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface SidebarProps {
  categories: readonly string[];
  counts: Record<string, number>;
  total: number;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenPalette: () => void;
  onManageSources: () => void;
  listOpen: boolean;
  onToggleList: () => void;
}

export function Sidebar({
  categories,
  counts,
  total,
  activeCategory,
  onCategoryChange,
  query,
  onQueryChange,
  onOpenPalette,
  onManageSources,
  listOpen,
  onToggleList,
}: SidebarProps) {
  const items = React.useMemo(
    () => [{ name: "全部" as string, count: total }, ...categories.map((c) => ({ name: c, count: counts[c] ?? 0 }))],
    [categories, counts, total]
  );

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* 品牌区 */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Tv className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">电视直播</span>
          <span className="text-[10px] text-muted-foreground">
            Windows 桌面版
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onManageSources}
          title="直播源配置"
          aria-label="直播源配置"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <Separator />

      {/* 搜索 */}
      <div className="space-y-2 px-3 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="筛选当前列表…"
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          className="w-full justify-between text-muted-foreground"
          onClick={onOpenPalette}
        >
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            全局搜索频道
          </span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline-flex">
            Ctrl K
          </kbd>
        </Button>
      </div>
      <Separator />

      {/* 分类导航 */}
      <ScrollArea className="flex-1">
        <nav className="space-y-0.5 p-2">
          {items.map((item) => {
            const active = item.name === activeCategory;
            return (
              <button
                key={item.name}
                onClick={() => onCategoryChange(item.name)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="truncate">{item.name}</span>
                <span
                  className={cn(
                    "ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                    active
                      ? "bg-primary/20 text-foreground"
                      : "bg-secondary text-secondary-foreground"
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />

      {/* 列表显隐开关 */}
      <div className="px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={onToggleList}
        >
          {listOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          {listOpen ? "隐藏频道列表" : "显示频道列表"}
        </Button>
      </div>
    </div>
  );
}
