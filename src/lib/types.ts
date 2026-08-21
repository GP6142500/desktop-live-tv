import type { Channel } from "@/data/channels";

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "buffering"
  | "error";

/** 判断 URL 是否为 HLS 直播流。
 *  兼容非标准后缀：.m3u8（含 .m3u8zzhed 这类带标记）、.m3u（HLS chunklist 有时用 .m3u） */
export function isHls(url: string): boolean {
  return /\.m3u8/i.test(url) || /\.m3u(\?.*)?$/i.test(url) || /manifest/i.test(url);
}

/** 判断 URL 是否为可直接 <video> 播放的渐进式文件 (.mp4/.webm 等) */
export function isProgressive(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
}

/** 判断 URL 是否为 FLV 直播流 (.flv)，需 flv.js 解码 */
export function isFlv(url: string): boolean {
  return /\.flv(\?.*)?$/i.test(url);
}

export type { Channel };
