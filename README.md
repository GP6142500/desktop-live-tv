# 电视直播 · Windows 桌面应用

基于 **Tauri 2 + Next.js 14 (App Router) + React 18 + TypeScript** 的轻量桌面电视直播应用。

界面与工程规范遵循 `ui.md`（本地优先 / 轻量桌面应用）；播放引擎使用 `hls.js`（HLS `.m3u8` / `.m3u`）与 `flv.js`（FLV `.flv` 直播流），并对 `.mp4` 等渐进式源走原生 `<video>`。直播源支持批量上传与可视化增删改管理，数据本地落盘、重启不丢。

## 功能

- **频道列表展示**：左侧按分类（央视频道 / 卫视频道 / 电影 / 体育 …）导航，右侧频道列表按分类 + 搜索过滤。
- **直播流播放**：自动识别 HLS(`.m3u8`/`.m3u`)、FLV(`.flv`，经 `flv.js` 解码) 与渐进式(`.mp4`) 源；同一频道多播放源时支持手动「换源」。
- **全屏切换**：点击控制条按钮或按 `F` 键全屏观看。
- **全局搜索**：`Ctrl K` 唤起命令面板，按名称或分类秒搜频道。
- **直播源配置（核心）**：点击左上角 logo 旁的「配置」按钮打开面板，提供三种能力：
  - **上传文件**：上传 `iptv4.txt` 风格的播放列表，按频道名**增量合并**——只追加不重复的播放源，原有源不会被覆盖；新频道直接新增。导入前预览「新增频道 / 新增源 / 跳过重复」。
  - **手动添加**：选已有频道加源，或新建频道（选择已有分类 / 新建分类）+ 命名 + 加源；支持一次粘贴多个源（每行一个或分号分隔），自动去重。
  - **管理**：重命名频道、修改分类、删除分类 / 删除频道 / 删除单条源、全部清空；破坏性操作均有二次确认并给出提示。
- **本地持久化**：所有增删改写入 `app_data_dir/channels.json`，应用重启后保留。
- **桌面操作习惯**：键盘快捷键、可折叠频道面板（framer-motion 动画）、暗色主题自适应。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `F` | 全屏切换 |
| `↑` / `↓` | 上一个 / 下一个频道 |
| `Ctrl K` | 打开频道搜索面板 |
| `Esc` | 关闭搜索面板 / 弹窗 |

## 目录结构

```
tv-live-app/
├── package.json            # 依赖与脚本
├── next.config.mjs         # 静态导出 output:'export' -> out/
├── tailwind.config.ts      # Tailwind + shadcn 主题
├── components.json         # shadcn/ui 配置
├── playlist/
│   └── iptv4.txt           # 原始 IPTV 播放列表（源数据），随版本提交
├── scripts/
│   └── gen-playlist.mjs    # 解析 iptv4.txt -> src/data/channels.ts
├── src/
│   ├── app/                # Next.js App Router (layout / page / globals)
│   ├── components/
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   ├── app-shell.tsx   # 整体布局 + 状态 + 快捷键 + 数据源接入
│   │   ├── sidebar.tsx     # 分类导航 + 搜索 + 配置入口
│   │   ├── channel-list.tsx# 频道列表
│   │   ├── video-player.tsx# hls.js / flv.js / 原生 播放器 + 控制条
│   │   ├── command-palette.tsx # Ctrl+K 搜索面板
│   │   └── source-manager.tsx  # 直播源配置面板（上传 / 手动 / 管理）
│   ├── data/
│   │   └── channels.ts     # 由 gen-playlist 生成（初始种子数据）
│   ├── lib/
│   │   ├── channels-store.tsx # 运行时数据源 Context + 持久化(store)
│   │   ├── playlist-parse.ts  # 前端版 txt 解析 + 增量合并算法
│   │   ├── proxy.ts        # 本地代理地址封装
│   │   └── types.ts        # Channel / 播放源类型与识别
│   └── hooks/
└── src-tauri/              # Tauri 2 桌面壳 (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    └── src/main.rs         # axum 本地代理 + load/save_channels 命令
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
npm run tauri dev        # 2) 启动桌面窗口调试（实际可播放）
npm run tauri build      # 3) 打包 Windows 安装包 (nsis / msi)
```

> 说明：`tauri dev`/`tauri build` 需要先执行 `npm run build` 生成 `out/` 目录（`tauri.conf.json` 中 `frontendDist: "../out"`）。

### 更新频道源

两种方式：

1. **应用内配置面板**：点「配置」→「上传文件」选择 `iptv4.txt`，预览后导入（增量合并）。
2. **构建期生成**：编辑 `playlist/iptv4.txt`（保持 `频道名,URL` 与 `分类名,#genre#` 格式），然后：

```bash
npm run gen:playlist    # 重新生成 src/data/channels.ts（初始种子）
```

## 播放原理：Tauri 本地代理（关键点）

免费 IPTV 源几乎都不返回 `Access-Control-Allow-Origin`，浏览器 / hls.js 用 XHR 拉取 `.m3u8` 与 `.ts` 分片时会被**跨域拦截**；Tauri 打包后页面又运行在 `https`(asset) 上下文，加载 `http://` 直播源还会被 **mixed-content** 拦截。这两道墙导致在纯浏览器（`npm run dev`）里永远无法播放这类源。

解决办法：Rust 端在 `127.0.0.1:18765` 起一个本地 HTTP 代理，`src-tauri/src/main.rs` 的 `/proxy?url=<真实地址>` 路由会：

1. 由 Rust 后端直接请求真实直播流（不受浏览器 CORS 限制）；
2. 在响应头加 `Access-Control-Allow-Origin: *`，前端取流无障碍；
3. 若返回的是 `.m3u8` 播放列表，自动把内部引用的 `.ts` 分片 / 子列表地址也重写为代理地址，保证后续分片同样走代理；
4. `127.0.0.1` 属于浏览器 mixed-content 例外，即便打包后页面是 https 也能加载。

前端 `src/lib/proxy.ts` 在 Tauri 环境下通过 `invoke('get_proxy_port')` 拿到端口，把所有直播地址改写为 `http://127.0.0.1:18765/proxy?url=...` 再交给播放器。

> 因此：**实际播放必须在 `tauri dev` / `tauri build` 下进行**；纯 `npm run dev` 仅用于 UI 调试。

## 直播源数据持久化

- 运行时的增删改由 `src/lib/channels-store.tsx` 管理，启动后通过 `load_channels` 命令读取 `app_data_dir/channels.json`；任何修改通过 `save_channels` 写回。
- 纯浏览器 `npm run dev` 环境无 Tauri API，会回退到 `src/data/channels.ts` 的静态种子数据（只读，改了不落盘）。
- `npm run tauri build` 打包时 `app_data_dir` 位于：`%LOCALAPPDATA%\<productName>\channels.json`。

## 打包踩坑（Windows）

- 仅建议打 **nsis**（`setup.exe`）：`npm run tauri build --bundles nsis`。MSI 需 WiX 运行库，易在 `light.exe` 阶段失败，与功能无关。
- 首次打包 NSIS 工具链需联网下载（`nsis-3.11.zip`），若超时请把已下载文件放到 `AppData\Local\tauri\nsis-3.11\` 后重试，或配置 `HTTPS_PROXY`。
- 未签名的 `setup.exe` 首次运行会被 SmartScreen 拦截，点「更多信息 → 仍要运行」即可。
- 更换图标：把新图替换 `src-tauri/icons/icon.png` 后执行 `npx tauri icon ./src-tauri/icons/icon.png`，再重新 `tauri build`。若资源管理器里图标看着没变，是 Windows 图标缓存未刷新，重启 `explorer.exe` 即可，与重编无关。

## 已知限制

- 极少数加密源（`#EXT-X-KEY` / `#EXT-X-MEDIA` 带 URI）的密钥或字幕地址未做代理重写，免费清流源不受影响。
- 个别源需要特定 `Referer` / `User-Agent` 才能出流，当前代理使用通用 UA；如个别源失败可手动「换源」。
- 直播源均为外部地址，播放需要本机网络可访问；`tauri.conf.json` 中 `security.csp` 已置空以放行跨域媒体加载。
