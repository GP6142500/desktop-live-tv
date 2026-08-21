# 电视直播 · Windows 桌面应用

基于 **Tauri 2 + Next.js 14 (App Router) + React 18 + TypeScript** 的轻量桌面电视直播应用。
界面与工程规范遵循 `ui.md`（本地优先 / 轻量桌面应用），播放引擎使用 `hls.js`（HLS `.m3u8` / `.m3u`）与 `flv.js`（FLV `.flv` 直播流），并对 `.mp4` 等渐进式源走原生 `<video>`。

## 功能

- **频道列表展示**：左侧按分类（央视频道 / 卫视频道 / 电影 / 体育 …）导航，右侧虚拟滚动列表（422 个频道、765 条播放源，使用 `@tanstack/react-virtual` 避免长列表卡顿）。
- **直播流播放**：自动识别 HLS(`.m3u8`/`.m3u`)、FLV(`.flv`，经 `flv.js` 解码) 与渐进式(`.mp4`) 源；同一频道多播放源时**自动故障切换**，并支持手动「换源」。
- **全屏切换**：点击控制条按钮或按 `F` 键全屏观看。
- **全局搜索**：`Ctrl/Cmd + K` 唤起命令面板（基于 `cmdk`），按名称或分类秒搜频道。
- **桌面操作习惯**：键盘快捷键、可折叠频道面板（framer-motion 动画）、暗色主题自适应。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `F` | 全屏切换 |
| `↑` / `↓` | 上一个 / 下一个频道 |
| `Ctrl K` | 打开频道搜索面板 |
| `Esc` | 关闭搜索面板 |

## 目录结构

```
tv-live-app/
├── package.json            # 依赖与脚本 (pnpm/npm 通用)
├── next.config.mjs         # 静态导出 output:'export' -> out/
├── tailwind.config.ts      # Tailwind + shadcn 主题
├── components.json         # shadcn/ui 配置
├── playlist/
│   └── iptv4.txt           # 原始 IPTV 播放列表（源）
├── scripts/
│   └── gen-playlist.mjs    # 解析 iptv4.txt -> src/data/channels.ts
├── src/
│   ├── app/                # Next.js App Router (layout / page / globals)
│   ├── components/
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   ├── app-shell.tsx   # 整体布局 + 状态 + 快捷键
│   │   ├── sidebar.tsx     # 分类导航 + 搜索
│   │   ├── channel-list.tsx# 虚拟滚动频道列表
│   │   ├── video-player.tsx# hls.js 播放器 + 控制条
│   │   └── command-palette.tsx # Ctrl+K 搜索面板
│   ├── data/
│   │   └── channels.ts     # 由 gen-playlist 生成（勿手改）
│   ├── lib/                # utils / types / iptv 解析辅助
│   └── hooks/
└── src-tauri/              # Tauri 2 桌面壳 (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    └── src/main.rs
```

## 开发 / 运行

### 纯 Web 预览（仅 UI 调试，无法实际播放）

```bash
npm install        # 或 pnpm install
npm run dev        # 启动 Next.js，浏览器打开 http://localhost:3000
```

> 注意：纯浏览器环境因 CORS 无法拉取 IPTV 源，**点击频道不会出画面**（这是预期行为）。实际播放请走下面的 Tauri 桌面流程。

### 桌面应用（Tauri，Windows）

前置工具：Node 18+、Rust 工具链（`rustup`）、Visual Studio Build Tools（勾选“C++ 桌面开发”）与 WebView2（Win11 自带）。

```bash
npm install
npm run build            # 1) Next.js 静态导出到 out/
npm run tauri dev        # 2) 启动桌面窗口调试
npm run tauri build      # 3) 打包 Windows 安装包 (nsis / msi)
```

> 说明：`tauri dev`/`tauri build` 需要先执行 `npm run build` 生成 `out/` 目录（`tauri.conf.json` 中 `frontendDist: "../out"`）。

### 更新频道源

编辑 `playlist/iptv4.txt`（保持 `频道名,URL` 与 `分类名,#genre#` 格式），然后：

```bash
npm run gen:playlist    # 重新生成 src/data/channels.ts
```

## 播放原理：Tauri 本地代理（关键点）

免费 IPTV 源几乎都不返回 `Access-Control-Allow-Origin`，浏览器 / hls.js 用 XHR 拉取 `.m3u8` 与 `.ts` 分片时会被**跨域拦截**；Tauri 打包后页面又运行在 `https`(asset) 上下文，加载 `http://` 直播源还会被 **mixed-content** 拦截。这两道墙导致在纯浏览器（`npm run dev`）里永远无法播放这类源。

解决办法：Rust 端在 `127.0.0.1:18765` 起一个本地 HTTP 代理，`src-tauri/src/main.rs` 的 `/proxy?url=<真实地址>` 路由会：

1. 由 Rust 后端直接请求真实直播流（不受浏览器 CORS 限制）；
2. 在响应头加 `Access-Control-Allow-Origin: *`，前端取流无障碍；
3. 若返回的是 `.m3u8` 播放列表，自动把内部引用的 `.ts` 分片 / 子列表地址也重写为代理地址，保证后续分片同样走代理；
4. `127.0.0.1` 属于浏览器 mixed-content 例外，即便打包后页面是 https 也能加载。

前端 `src/lib/proxy.ts` 在 Tauri 环境下通过 `invoke('get_proxy_port')` 拿到端口，把所有直播地址改写为 `http://127.0.0.1:18765/proxy?url=...` 再交给 hls.js。

> 因此：**实际播放必须在 `tauri dev` / `tauri build` 下进行**；纯 `npm run dev` 仅用于 UI 调试。

已知限制：
- 极少数加密源（`#EXT-X-KEY` / `#EXT-X-MEDIA` 带 URI）的密钥或字幕地址未做代理重写，免费清流源不受影响。
- 个别源需要特定 `Referer` / `User-Agent` 才能出流，当前代理使用通用 UA；如个别源失败可手动「换源」。

## 注意事项

- **图标**：`src-tauri/icons/icon.png` 为占位图标。正式打包前请替换，或执行 `npx tauri icon ./src-tauri/icons/icon.png` 自动生成 Windows 所需全套图标（`.ico` 等）。
- **网络**：所有直播源均为外部 HTTP/HTTPS 地址，播放需要本机网络可访问这些源；`tauri.conf.json` 中 `security.csp` 已置空以放行跨域媒体加载。
- **体积**：Tauri 2 不依赖 Electron，安装包通常仅 ~10–20MB，远低于 Electron 方案（符合 `ui.md` 的“零冗余运行时”目标）。
- **硬件特性**：`src-tauri/Cargo.toml` 预留了 `cuda / vulkan / metal / coreml / openblas` feature flag，用于后续可选的本地 ML sidecar；当前应用未启用。
