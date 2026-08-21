"use client";

import * as React from "react";

import { channels as seedChannels, categories as seedCategories } from "@/data/channels";
import type { Channel } from "@/data/channels";
import {
  computeMerge,
  parsePlaylistText,
  newChannelId,
  type MergeResult,
} from "@/lib/playlist-parse";

interface ChannelsContextValue {
  channels: Channel[];
  categories: string[];
  /** 是否已从磁盘/Tauri 完成初始化（避免首帧闪烁到种子数据后再跳变） */
  ready: boolean;
  /** 计算上传 txt 的合并预览（不提交） */
  previewMergeText: (text: string) => MergeResult;
  /** 提交上传 txt 的增量合并并持久化 */
  applyMerge: (text: string) => Promise<MergeResult["summary"]>;
  /** 给已有频道追加播放源（多行/分号分隔，自动去重） */
  addSourceToChannel: (channelId: string, raw: string) => Promise<number>;
  /** 新增频道（可带全新分类）并添加源 */
  createChannel: (input: {
    name: string;
    category: string;
    raw: string;
  }) => Promise<void>;
  /** 重命名频道 */
  renameChannel: (channelId: string, newName: string) => Promise<void>;
  /** 修改频道所属分类（可指定新分类名，自动加入分类表） */
  changeChannelCategory: (
    channelId: string,
    newCategory: string
  ) => Promise<void>;
  /** 删除频道中的某一条播放源 */
  deleteSource: (channelId: string, url: string) => Promise<void>;
  /** 删除整个频道 */
  deleteChannel: (channelId: string) => Promise<void>;
  /** 删除分类（连同其下所有频道） */
  deleteCategory: (category: string) => Promise<void>;
  /** 清空全部频道与分类 */
  clearAll: () => Promise<void>;
}

const ChannelsContext = React.createContext<ChannelsContextValue | null>(null);

export function useChannels(): ChannelsContextValue {
  const ctx = React.useContext(ChannelsContext);
  if (!ctx) throw new Error("useChannels 必须在 ChannelsProvider 内使用");
  return ctx;
}

function isTauri(): boolean {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return !!(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

function splitSources(raw: string): string[] {
  return raw
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

interface PersistShape {
  categories: string[];
  channels: Channel[];
}

export function ChannelsProvider({ children }: { children: React.ReactNode }) {
  const [channels, setChannels] = React.useState<Channel[]>(seedChannels);
  const [categories, setCategories] = React.useState<string[]>(seedCategories);
  const [ready, setReady] = React.useState(false);

  const channelsRef = React.useRef(channels);
  const categoriesRef = React.useRef(categories);
  channelsRef.current = channels;
  categoriesRef.current = categories;

  // 启动时尝试从磁盘加载用户工作区数据，失败则回退内置种子
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!isTauri()) {
        setReady(true);
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const text = await invoke<string | null>("load_channels");
        if (!alive) return;
        if (text) {
          const data = JSON.parse(text) as PersistShape;
          if (Array.isArray(data.channels) && Array.isArray(data.categories)) {
            channelsRef.current = data.channels;
            categoriesRef.current = data.categories;
            setChannels(data.channels);
            setCategories(data.categories);
          }
        }
      } catch {
        // 忽略：保持种子数据
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = React.useCallback(
    async (nextChannels: Channel[], nextCategories: string[]) => {
      if (!isTauri()) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const payload: PersistShape = {
          categories: nextCategories,
          channels: nextChannels,
        };
        await invoke("save_channels", { payload: JSON.stringify(payload) });
      } catch {
        // 持久化失败不应阻断 UI 操作
      }
    },
    []
  );

  const previewMergeText = React.useCallback((text: string): MergeResult => {
    const parsed = parsePlaylistText(text);
    return computeMerge(channelsRef.current, categoriesRef.current, parsed);
  }, []);

  const applyMerge = React.useCallback(
    async (text: string): Promise<MergeResult["summary"]> => {
      const parsed = parsePlaylistText(text);
      const result = computeMerge(
        channelsRef.current,
        categoriesRef.current,
        parsed
      );
      channelsRef.current = result.channels;
      categoriesRef.current = result.categories;
      setChannels(result.channels);
      setCategories(result.categories);
      await persist(result.channels, result.categories);
      return result.summary;
    },
    [persist]
  );

  const addSourceToChannel = React.useCallback(
    async (channelId: string, raw: string): Promise<number> => {
      const urls = splitSources(raw);
      if (urls.length === 0) return 0;
      let added = 0;
      const next = channelsRef.current.map((c) => {
        if (c.id !== channelId) return c;
        const merged = [...c.urls];
        for (const u of urls) {
          if (!merged.some((ex) => ex.trim() === u)) {
            merged.push(u);
            added += 1;
          }
        }
        return { ...c, urls: merged };
      });
      channelsRef.current = next;
      setChannels(next);
      await persist(next, categoriesRef.current);
      return added;
    },
    [persist]
  );

  const createChannel = React.useCallback(
    async (input: { name: string; category: string; raw: string }) => {
      const name = input.name.trim();
      const urls = splitSources(input.raw);
      if (!name) return;
      const category = input.category.trim() || "未分类";
      const catSet = new Set(categoriesRef.current);
      if (!catSet.has(category)) catSet.add(category);

      const nextChannels = [
        ...channelsRef.current,
        { id: newChannelId(), name, category, urls },
      ];
      const nextCategories = [...catSet];
      channelsRef.current = nextChannels;
      categoriesRef.current = nextCategories;
      setChannels(nextChannels);
      setCategories(nextCategories);
      await persist(nextChannels, nextCategories);
    },
    [persist]
  );

  const renameChannel = React.useCallback(
    async (channelId: string, newName: string) => {
      const name = newName.trim();
      if (!name) return;
      const next = channelsRef.current.map((c) =>
        c.id === channelId ? { ...c, name } : c
      );
      channelsRef.current = next;
      setChannels(next);
      await persist(next, categoriesRef.current);
    },
    [persist]
  );

  const changeChannelCategory = React.useCallback(
    async (channelId: string, newCategory: string) => {
      const category = newCategory.trim();
      if (!category) return;
      const catSet = new Set(categoriesRef.current);
      if (!catSet.has(category)) catSet.add(category);
      const next = channelsRef.current.map((c) =>
        c.id === channelId ? { ...c, category } : c
      );
      const nextCats = [...catSet];
      channelsRef.current = next;
      categoriesRef.current = nextCats;
      setChannels(next);
      setCategories(nextCats);
      await persist(next, nextCats);
    },
    [persist]
  );

  const deleteSource = React.useCallback(
    async (channelId: string, url: string) => {
      const next = channelsRef.current.map((c) => {
        if (c.id !== channelId) return c;
        return { ...c, urls: c.urls.filter((u) => u !== url) };
      });
      channelsRef.current = next;
      setChannels(next);
      await persist(next, categoriesRef.current);
    },
    [persist]
  );

  const deleteChannel = React.useCallback(
    async (channelId: string) => {
      const next = channelsRef.current.filter((c) => c.id !== channelId);
      channelsRef.current = next;
      setChannels(next);
      await persist(next, categoriesRef.current);
    },
    [persist]
  );

  const deleteCategory = React.useCallback(
    async (category: string) => {
      const nextChannels = channelsRef.current.filter(
        (c) => c.category !== category
      );
      const nextCats = categoriesRef.current.filter((c) => c !== category);
      channelsRef.current = nextChannels;
      categoriesRef.current = nextCats;
      setChannels(nextChannels);
      setCategories(nextCats);
      await persist(nextChannels, nextCats);
    },
    [persist]
  );

  const clearAll = React.useCallback(async () => {
    channelsRef.current = [];
    categoriesRef.current = [];
    setChannels([]);
    setCategories([]);
    await persist([], []);
  }, [persist]);

  const value: ChannelsContextValue = {
    channels,
    categories,
    ready,
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
  };

  return (
    <ChannelsContext.Provider value={value}>{children}</ChannelsContext.Provider>
  );
}
