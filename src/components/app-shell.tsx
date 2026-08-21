"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { Channel } from "@/data/channels";
import type { PlayerStatus } from "@/lib/types";
import { getProxyPort, proxyUrl } from "@/lib/proxy";
import { useChannels } from "@/lib/channels-store";
import { Sidebar } from "@/components/sidebar";
import { VideoPlayer } from "@/components/video-player";
import { ChannelList } from "@/components/channel-list";
import { CommandPalette } from "@/components/command-palette";
import { SourceManager } from "@/components/source-manager";

const ALL = "全部";

export function AppShell() {
  const { channels, categories } = useChannels();
  const [activeCategory, setActiveCategory] = React.useState<string>(ALL);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Channel | null>(null);
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const [status, setStatus] = React.useState<PlayerStatus>("idle");
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(true);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [proxyPort, setProxyPort] = React.useState<number | null>(null);

  // 在 Tauri 环境获取本地代理端口（用于把直播地址改写为同源代理地址）
  React.useEffect(() => {
    let alive = true;
    getProxyPort().then((p) => {
      if (alive) setProxyPort(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 用 ref 解决事件回调中的闭包陈旧问题
  const selectedRef = React.useRef<Channel | null>(null);
  const sourceIndexRef = React.useRef(0);
  const listOpenRef = React.useRef(listOpen);
  listOpenRef.current = listOpen;

  const setSource = React.useCallback((i: number) => {
    sourceIndexRef.current = i;
    setSourceIndex(i);
  }, []);

  const selectChannel = React.useCallback((ch: Channel) => {
    selectedRef.current = ch;
    setSelected(ch);
    setSource(0);
    setStatus("loading");
  }, [setSource]);

  // 把真实直播地址改写成可播放地址（Tauri 走本地代理，浏览器直连）
  const resolveUrl = React.useCallback(
    (raw: string) => proxyUrl(proxyPort, raw),
    [proxyPort]
  );

  const handleFatal = React.useCallback(() => {
    const ch = selectedRef.current;
    if (!ch) return;
    const i = sourceIndexRef.current;
    if (i < ch.urls.length - 1) setSource(i + 1);
    else setStatus("error");
  }, [setSource]);

  const handleManualNext = React.useCallback(() => {
    const ch = selectedRef.current;
    if (!ch) return;
    setSource((sourceIndexRef.current + 1) % ch.urls.length);
  }, [setSource]);

  // 分类计数
  const counts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of channels) m[c.category] = (m[c.category] ?? 0) + 1;
    return m;
  }, [channels]);

  const filtered = React.useMemo(() => {
    let list = channels;
    if (activeCategory !== ALL) {
      list = list.filter((c) => c.category === activeCategory);
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    return list;
  }, [channels, activeCategory, query]);

  // 全局快捷键
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || paletteOpen) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list2 = filtered;
        if (list2.length === 0) return;
        const idx = list2.findIndex((c) => c.id === selectedRef.current?.id);
        let next: number;
        if (idx === -1) next = e.key === "ArrowDown" ? 0 : list2.length - 1;
        else
          next =
            e.key === "ArrowDown"
              ? Math.min(idx + 1, list2.length - 1)
              : Math.max(idx - 1, 0);
        selectChannel(list2[next]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, paletteOpen, selectChannel]);

  // 频道数据变更（添加/编辑/删除源或频道）后同步：
  // 1) 正在播放的频道有更新时立即反映新源列表；
  // 2) 当前选中频道已被删除时清空选中与播放状态。
  React.useEffect(() => {
    if (!selectedRef.current) return;
    const upd = channels.find((c) => c.id === selectedRef.current!.id);
    if (upd) {
      if (upd !== selectedRef.current) {
        selectedRef.current = upd;
        setSelected(upd);
      }
    } else {
      selectedRef.current = null;
      setSelected(null);
      setStatus("idle");
    }
  }, [channels]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 左侧分类导航 */}
      <aside className="w-56 shrink-0 border-r border-border">
        <Sidebar
          categories={categories}
          counts={counts}
          total={channels.length}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          query={query}
          onQueryChange={setQuery}
          onOpenPalette={() => setPaletteOpen(true)}
          onManageSources={() => setManagerOpen(true)}
          listOpen={listOpen}
          onToggleList={() => setListOpen((o) => !o)}
        />
      </aside>

      {/* 中央播放区 */}
      <main className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="min-h-0 flex-1">
          <VideoPlayer
            channel={selected}
            sourceIndex={sourceIndex}
            status={status}
            onStatusChange={setStatus}
            onFatalError={handleFatal}
            onNextSource={handleManualNext}
            resolveUrl={resolveUrl}
          />
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4 px-1 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded bg-secondary px-1.5 py-0.5">空格</kbd> 播放/暂停
          </span>
          <span>
            <kbd className="rounded bg-secondary px-1.5 py-0.5">F</kbd> 全屏
          </span>
          <span>
            <kbd className="rounded bg-secondary px-1.5 py-0.5">↑ ↓</kbd> 切换频道
          </span>
          <span>
            <kbd className="rounded bg-secondary px-1.5 py-0.5">Ctrl K</kbd> 搜索
          </span>
        </div>
      </main>

      {/* 右侧频道列表（可折叠） */}
      <AnimatePresence initial={false}>
        {listOpen && (
          <motion.aside
            key="channel-list"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="shrink-0 overflow-hidden border-l border-border"
          >
            <div className="h-full w-[360px]">
              <ChannelList
                channels={filtered}
                selectedId={selected?.id ?? null}
                onSelect={selectChannel}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        channels={channels}
        onSelect={selectChannel}
      />

      <SourceManager open={managerOpen} onOpenChange={setManagerOpen} />
    </div>
  );
}
