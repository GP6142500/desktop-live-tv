// 前端版 IPTV 文本解析（与 scripts/gen-playlist.mjs 同逻辑，供「上传 txt 更新源」复用）。
// 格式：
//   频道名,URL
//   分类名,#genre#   (其后的频道归入该分类)
// 同名下可能出现多行不同 URL，合并为多个播放源。
import type { Channel } from "@/data/channels";

function cleanUrl(raw: string): string | null {
  let u = raw.trim();
  // 截断行内垃圾后缀（# 之后通常是重复地址或注释）
  const hash = u.indexOf("#");
  if (hash !== -1) u = u.slice(0, hash);
  u = u.trim();
  if (!/^https?:\/\//i.test(u)) return null; // 仅保留 http(s) 直链
  return u;
}

// 这些分类是 IPTV 列表的元数据段，不是真实频道分组
const META_CATEGORIES = new Set(["更新时间", "更新日期", "最近更新"]);

// 这些伪频道名是列表作者塞进来的宣传/水印/时间戳，不是可看直播
function isJunkName(name: string): boolean {
  if (!name) return true;
  if (/https?:\/\//i.test(name)) return true; // 名字本身就是 URL
  if (name.includes("支持作者") || name.includes("赞助") || name.includes("打赏"))
    return true;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(name)) return true; // 时间戳
  if (/^[\w.-]+\.[a-z]{2,}([/:]\S*)?$/i.test(name)) return true; // 纯域名/网址
  return false;
}

export function parsePlaylistText(text: string): {
  categories: string[];
  channels: Channel[];
} {
  const lines = text.split(/\r?\n/);
  const categories: string[] = [];
  const map = new Map<string, { name: string; category: string; urls: Set<string> }>();
  let currentCategory = "未分类";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.endsWith(",#genre#") || /,#genre#$/.test(trimmed)) {
      currentCategory = trimmed.replace(/,#genre#$/, "").trim() || "未分类";
      if (
        !META_CATEGORIES.has(currentCategory) &&
        !categories.includes(currentCategory)
      ) {
        categories.push(currentCategory);
      }
      continue;
    }

    // 元数据分类（更新时间等）下的条目一律跳过
    if (META_CATEGORIES.has(currentCategory)) continue;

    const comma = trimmed.indexOf(",");
    if (comma === -1) continue; // 无逗号，跳过无效行

    const name = trimmed.slice(0, comma).trim();
    if (!name || isJunkName(name)) continue;
    const rest = trimmed.slice(comma + 1);

    // 单行可能包含多个候选源（分号分隔）
    const candidates = rest
      .split(";")
      .map(cleanUrl)
      .filter(Boolean) as string[];
    if (candidates.length === 0) continue;

    const key = `${currentCategory}::${name}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { name, category: currentCategory, urls: new Set() };
      map.set(key, entry);
    }
    for (const c of candidates) entry.urls.add(c);
  }

  const channels: Channel[] = [];
  for (const entry of map.values()) {
    channels.push({
      id: "",
      name: entry.name,
      category: entry.category,
      urls: [...entry.urls],
    });
  }
  return { categories, channels };
}

export function newChannelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return "u-" + crypto.randomUUID();
  }
  return "u-" + Math.random().toString(36).slice(2);
}

export interface MergeSummary {
  newChannels: number;
  newSources: number;
  skippedDuplicates: number;
  newCategories: string[];
}

export interface MergeDetail {
  channel: string;
  action: string;
}

export interface MergeResult {
  channels: Channel[];
  categories: string[];
  summary: MergeSummary;
  detail: MergeDetail[];
}

/**
 * 把解析后的播放列表增量合并进现有频道。
 * - 按频道名（大小写不敏感）匹配已有频道；
 * - 已有频道：仅追加不重复的 URL（URL 级去重）；
 * - 全新频道：直接新增（分配新 id，必要时登记新分类）。
 */
export function computeMerge(
  existing: Channel[],
  existingCategories: string[],
  parsed: { categories: string[]; channels: Channel[] }
): MergeResult {
  const channels = existing.map((c) => ({ ...c, urls: [...c.urls] }));
  const catSet = new Set(existingCategories);
  const summary: MergeSummary = {
    newChannels: 0,
    newSources: 0,
    skippedDuplicates: 0,
    newCategories: [],
  };
  const detail: MergeDetail[] = [];

  for (const p of parsed.channels) {
    if (p.category && !catSet.has(p.category)) {
      catSet.add(p.category);
      summary.newCategories.push(p.category);
    }

    const idx = channels.findIndex(
      (c) => c.name.toLowerCase() === p.name.toLowerCase()
    );

    if (idx === -1) {
      channels.push({
        id: newChannelId(),
        name: p.name,
        category: p.category,
        urls: [...p.urls],
      });
      summary.newChannels += 1;
      detail.push({ channel: p.name, action: `新增频道（+${p.urls.length} 源）` });
    } else {
      let added = 0;
      for (const u of p.urls) {
        const ut = u.trim();
        if (ut && !channels[idx].urls.some((ex) => ex.trim() === ut)) {
          channels[idx].urls.push(ut);
          added += 1;
        } else {
          summary.skippedDuplicates += 1;
        }
      }
      if (added > 0) {
        summary.newSources += added;
        detail.push({ channel: p.name, action: `新增 ${added} 个播放源` });
      }
    }
  }

  return { channels, categories: [...catSet], summary, detail };
}
