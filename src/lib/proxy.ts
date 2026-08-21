// 本地代理桥接：仅在 Tauri 运行时生效。
// Tauri 应用内，所有直播地址都改写为 http://127.0.0.1:<port>/proxy?url=...，
// 由 Rust 端同源转发，从而绕开浏览器对 IPTV 源的 CORS / mixed-content 限制。
// 纯浏览器（npm run dev）环境下没有代理，直接返回原始地址（播放会受 CORS 限制，仅用于 UI 调试）。

let portCache: number | null | undefined;

export async function getProxyPort(): Promise<number | null> {
  if (portCache !== undefined) return portCache;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const port = await invoke<number>("get_proxy_port");
      portCache = port;
      return port;
    } catch {
      portCache = null;
      return null;
    }
  }
  portCache = null;
  return null;
}

export function proxyUrl(port: number | null, raw: string): string {
  if (port == null) return raw;
  return `http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(raw)}`;
}
