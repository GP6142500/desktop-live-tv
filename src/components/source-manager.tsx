"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Check, Search, X, FileUp, Pencil, Trash2, Tags } from "lucide-react";

import { useChannels } from "@/lib/channels-store";
import type { MergeResult } from "@/lib/playlist-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SourceManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceManager({ open, onOpenChange }: SourceManagerProps) {
  const {
    channels,
    categories,
    previewMergeText,
    applyMerge,
    addSourceToChannel,
    createChannel,
    renameChannel,
    changeChannelCategory,
    deleteSource,
    deleteChannel,
    deleteCategory,
    clearAll,
  } = useChannels();

  // ---- Tab1: 上传 txt ----
  const [fileText, setFileText] = React.useState("");
  const [preview, setPreview] = React.useState<MergeResult | null>(null);
  const [merging, setMerging] = React.useState(false);
  const [doneSummary, setDoneSummary] = React.useState<MergeResult["summary"] | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // ---- Tab2: 手动添加 ----
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [channelQuery, setChannelQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [catSelect, setCatSelect] = React.useState<string>("");
  const [newCatName, setNewCatName] = React.useState("");
  const [sourceRaw, setSourceRaw] = React.useState("");

  // ---- Tab3: 管理 ----
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [catEditId, setCatEditId] = React.useState<string | null>(null);
  const [catEditValue, setCatEditValue] = React.useState("");
  const [catEditNew, setCatEditNew] = React.useState("");

  // ---- 统一提示 ----
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const selectedChannel = React.useMemo(
    () => channels.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId]
  );

  const totalSources = React.useMemo(
    () => channels.reduce((n, c) => n + c.urls.length, 0),
    [channels]
  );

  const grouped = React.useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          channels: channels.filter((c) => c.category === category),
        }))
        .filter((g) => g.channels.length > 0),
    [categories, channels]
  );

  // 每次打开重置状态
  React.useEffect(() => {
    if (open) {
      setFileText("");
      setPreview(null);
      setDoneSummary(null);
      setMode("existing");
      setChannelQuery("");
      setSelectedId(null);
      setNewName("");
      setCatSelect(categories[0] ?? "");
      setNewCatName("");
      setSourceRaw("");
      setEditId(null);
      setEditName("");
      setCatEditId(null);
      setCatEditValue("");
      setCatEditNew("");
      setToast(null);
    }
  }, [open, categories]);

  // Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setFileText(text);
      setDoneSummary(null);
      try {
        setPreview(previewMergeText(text));
      } catch {
        setPreview(null);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const onConfirmMerge = async () => {
    if (!fileText) return;
    setMerging(true);
    try {
      const summary = await applyMerge(fileText);
      setDoneSummary(summary);
      setPreview(null);
      setFileText("");
    } finally {
      setMerging(false);
    }
  };

  // Tab2：已有频道搜索结果
  const channelResults = React.useMemo(() => {
    const q = channelQuery.trim().toLowerCase();
    const list = q
      ? channels.filter((c) => c.name.toLowerCase().includes(q))
      : channels;
    return list.slice(0, 50);
  }, [channelQuery, channels]);

  const resolvedCategory =
    mode === "new"
      ? catSelect === "__new__"
        ? newCatName.trim()
        : catSelect
      : "";

  const canSubmitManual =
    sourceRaw.trim().length > 0 &&
    (mode === "existing" ? !!selectedId : newName.trim().length > 0);

  const onSubmitManual = async () => {
    if (!canSubmitManual) return;
    if (mode === "existing" && selectedId) {
      const added = await addSourceToChannel(selectedId, sourceRaw);
      flashToast(`已为「${selectedChannel?.name}」添加 ${added} 个播放源`);
    } else {
      await createChannel({
        name: newName,
        category: resolvedCategory,
        raw: sourceRaw,
      });
      flashToast(`已新建频道「${newName.trim()}」`);
    }
    setSourceRaw("");
    setSelectedId(null);
    setChannelQuery("");
    setNewName("");
    setNewCatName("");
    setCatSelect(categories[0] ?? "");
  };

  // ===== Tab3 管理操作 =====
  const startRename = (id: string, name: string) => {
    setCatEditId(null);
    setEditId(id);
    setEditName(name);
  };
  const saveRename = async () => {
    if (!editId) return;
    const name = editName.trim();
    if (!name) {
      setEditId(null);
      return;
    }
    await renameChannel(editId, name);
    flashToast(`已重命名为「${name}」`);
    setEditId(null);
    setEditName("");
  };

  const startCatEdit = (id: string, category: string) => {
    setEditId(null);
    setCatEditId(id);
    setCatEditValue(category);
    setCatEditNew("");
  };
  const saveCatEdit = async () => {
    if (!catEditId) return;
    const finalCat =
      catEditValue === "__new__" ? catEditNew.trim() : catEditValue.trim();
    if (!finalCat) {
      setCatEditId(null);
      return;
    }
    await changeChannelCategory(catEditId, finalCat);
    flashToast(`已移动到「${finalCat}」`);
    setCatEditId(null);
    setCatEditValue("");
    setCatEditNew("");
  };

  const onDeleteSource = async (channelId: string, url: string) => {
    await deleteSource(channelId, url);
    flashToast("已删除 1 条播放源");
  };

  const onDeleteChannel = async (name: string, channelId: string) => {
    if (!window.confirm(`确定删除频道「${name}」？该操作不可撤销。`)) return;
    await deleteChannel(channelId);
    flashToast(`已删除频道「${name}」`);
  };

  const onDeleteCategory = async (category: string) => {
    if (
      !window.confirm(
        `确定删除分类「${category}」及其下全部频道？此操作不可撤销。`
      )
    )
      return;
    await deleteCategory(category);
    flashToast(`已删除分类「${category}」`);
  };

  const onClearAll = async () => {
    if (
      !window.confirm(
        "确定清空全部频道与分类？此操作不可撤销，且会覆盖已保存的数据。"
      )
    )
      return;
    await clearAll();
    flashToast("已清空全部直播源");
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative mt-[8vh] flex max-h-[84vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">直播源配置</span>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Tabs defaultValue="upload" className="flex min-h-0 flex-1 flex-col">
              <div className="px-4 pt-3">
                <TabsList className="w-full">
                  <TabsTrigger value="upload" className="flex-1">
                    上传文件
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex-1">
                    手动添加
                  </TabsTrigger>
                  <TabsTrigger value="manage" className="flex-1">
                    管理
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ===== Tab1 上传文件 ===== */}
              <TabsContent value="upload" className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <p className="mb-3 text-xs text-muted-foreground">
                  选择 iptv 格式文本（每行 <span className="font-mono">频道名,URL</span>，
                  分类用 <span className="font-mono">分类,#genre#</span>）。已存在的频道只追加不重复的源。
                </p>

                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                  <FileUp className="h-5 w-5" />
                  点击选择 .txt 文件
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={onFile}
                  />
                </label>

                {doneSummary && (
                  <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-1.5 font-medium text-emerald-400">
                      <Check className="h-4 w-4" /> 导入完成
                    </div>
                    <div className="text-muted-foreground">
                      新增频道 {doneSummary.newChannels} 个，新增播放源{" "}
                      {doneSummary.newSources} 条
                      {doneSummary.skippedDuplicates > 0 &&
                        `，跳过重复 ${doneSummary.skippedDuplicates} 条`}
                      {doneSummary.newCategories.length > 0 &&
                        `，新增分类 ${doneSummary.newCategories.join("、")}`}
                      。
                    </div>
                  </div>
                )}

                {preview && !doneSummary && (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-secondary px-2 py-1">
                        新增频道 {preview.summary.newChannels}
                      </span>
                      <span className="rounded bg-secondary px-2 py-1">
                        新增播放源 {preview.summary.newSources}
                      </span>
                      <span className="rounded bg-secondary px-2 py-1">
                        跳过重复 {preview.summary.skippedDuplicates}
                      </span>
                      {preview.summary.newCategories.length > 0 && (
                        <span className="rounded bg-secondary px-2 py-1">
                          新分类 {preview.summary.newCategories.join("、")}
                        </span>
                      )}
                    </div>
                    <ScrollArea className="h-40 rounded-lg border border-border p-2">
                      {preview.detail.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          没有可添加的频道或源
                        </div>
                      ) : (
                        preview.detail.map((d, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-1 text-xs"
                          >
                            <span className="truncate">{d.channel}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {d.action}
                            </span>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                    <Button
                      className="w-full"
                      onClick={onConfirmMerge}
                      disabled={merging || preview.detail.length === 0}
                    >
                      {merging ? "导入中…" : "确认导入"}
                    </Button>
                  </div>
                )}

                {!preview && !doneSummary && fileText && (
                  <div className="mt-4 text-xs text-muted-foreground">
                    未能解析出有效频道，请检查文件格式。
                  </div>
                )}
              </TabsContent>

              {/* ===== Tab2 手动添加 ===== */}
              <TabsContent value="manual" className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => setMode("existing")}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
                      mode === "existing"
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    已有频道
                  </button>
                  <button
                    onClick={() => setMode("new")}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
                      mode === "new"
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    新建频道
                  </button>
                </div>

                {mode === "existing" ? (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">选择频道</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={channelQuery}
                        onChange={(e) => setChannelQuery(e.target.value)}
                        placeholder="搜索频道名…"
                        className="pl-8"
                      />
                    </div>
                    {selectedChannel ? (
                      <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                        <span>
                          {selectedChannel.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {selectedChannel.urls.length} 源
                          </span>
                        </span>
                        <button
                          onClick={() => setSelectedId(null)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <ScrollArea className="h-36 rounded-md border border-border">
                        {channelResults.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground">
                            无匹配频道
                          </div>
                        ) : (
                          channelResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setSelectedId(c.id)}
                              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"
                            >
                              <span className="truncate">{c.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {c.category} · {c.urls.length}源
                              </span>
                            </button>
                          ))
                        )}
                      </ScrollArea>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">分类</label>
                      <select
                        value={catSelect}
                        onChange={(e) => setCatSelect(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c} className="bg-popover">
                            {c}
                          </option>
                        ))}
                        <option value="__new__" className="bg-popover">
                          ＋ 新建分类…
                        </option>
                      </select>
                    </div>
                    {catSelect === "__new__" && (
                      <Input
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="输入新分类名称"
                      />
                    )}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">频道名称</label>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="如 CCTV-测试"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-1">
                  <label className="text-xs text-muted-foreground">
                    播放源地址（每行一个，或分号分隔）
                  </label>
                  <textarea
                    value={sourceRaw}
                    onChange={(e) => setSourceRaw(e.target.value)}
                    rows={3}
                    placeholder="http://example.com/live/1.m3u8"
                    className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <Button
                  className="mt-3 w-full"
                  onClick={onSubmitManual}
                  disabled={!canSubmitManual}
                >
                  <Plus className="h-4 w-4" />
                  {mode === "existing" ? "添加到频道" : "新建频道"}
                </Button>
              </TabsContent>

              {/* ===== Tab3 管理 ===== */}
              <TabsContent
                value="manage"
                className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3"
              >
                <div className="flex items-center justify-between pb-3">
                  <span className="text-xs text-muted-foreground">
                    {channels.length} 频道 · {categories.length} 分类 · {totalSources} 源
                  </span>
                  <button
                    onClick={onClearAll}
                    className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    全部清空
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  {grouped.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      暂无直播源，去「上传文件」或「手动添加」添加吧
                    </div>
                  ) : (
                    <>
                      {grouped.map((g) => (
                        <section key={g.category}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {g.category}
                              </span>
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                                {g.channels.length}
                              </span>
                            </div>
                            <button
                              onClick={() => onDeleteCategory(g.category)}
                              className="text-xs text-muted-foreground hover:text-red-400"
                            >
                              删除分类
                            </button>
                          </div>

                          <div className="space-y-2">
                            {g.channels.map((ch) => (
                              <div
                                key={ch.id}
                                className="rounded-lg border border-border bg-secondary/30 p-2.5"
                              >
                                {/* 频道头行 */}
                                <div className="flex items-center justify-between gap-2">
                                  {editId === ch.id ? (
                                    <div className="flex flex-1 items-center gap-2">
                                      <Input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") saveRename();
                                          if (e.key === "Escape") setEditId(null);
                                        }}
                                        className="h-7 flex-1"
                                        autoFocus
                                      />
                                      <button
                                        onClick={saveRename}
                                        className="text-emerald-500 hover:text-emerald-400"
                                        title="保存"
                                      >
                                        <Check className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => setEditId(null)}
                                        className="text-muted-foreground hover:text-foreground"
                                        title="取消"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="truncate text-sm font-medium">
                                        {ch.name}
                                      </span>
                                      <div className="flex shrink-0 items-center gap-0.5">
                                        <button
                                          onClick={() => startRename(ch.id, ch.name)}
                                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                          title="重命名"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => startCatEdit(ch.id, ch.category)}
                                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                          title="修改分类"
                                        >
                                          <Tags className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => onDeleteChannel(ch.name, ch.id)}
                                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-400"
                                          title="删除频道"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* 改分类行 */}
                                {catEditId === ch.id && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <select
                                      value={catEditValue}
                                      onChange={(e) => setCatEditValue(e.target.value)}
                                      className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                      {categories.map((c) => (
                                        <option key={c} value={c} className="bg-popover">
                                          {c}
                                        </option>
                                      ))}
                                      <option value="__new__" className="bg-popover">
                                        ＋ 新建分类…
                                      </option>
                                    </select>
                                    {catEditValue === "__new__" && (
                                      <Input
                                        value={catEditNew}
                                        onChange={(e) => setCatEditNew(e.target.value)}
                                        placeholder="新分类名"
                                        className="h-7 flex-1"
                                      />
                                    )}
                                    <button
                                      onClick={saveCatEdit}
                                      className="text-emerald-500 hover:text-emerald-400"
                                      title="保存"
                                    >
                                      <Check className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => setCatEditId(null)}
                                      className="text-muted-foreground hover:text-foreground"
                                      title="取消"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}

                                {/* 播放源列表 */}
                                <div className="mt-2 space-y-1">
                                  {ch.urls.length === 0 ? (
                                    <div className="text-xs text-muted-foreground">
                                      （无播放源）
                                    </div>
                                  ) : (
                                    ch.urls.map((u) => (
                                      <div
                                        key={u}
                                        className="group flex items-center justify-between gap-2 rounded bg-background/60 px-2 py-1 text-xs"
                                      >
                                        <span className="truncate font-mono text-muted-foreground">
                                          {u}
                                        </span>
                                        <button
                                          onClick={() => onDeleteSource(ch.id, u)}
                                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                                          title="删除此源"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* 统一提示 */}
            {toast && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 shadow-lg">
                {toast}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
