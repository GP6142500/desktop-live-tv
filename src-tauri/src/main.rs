// 隐藏 Windows 控制台窗口（发布版本）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::Manager;

use axum::{
    body::Body,
    extract::{Query, State},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;

/// 本地代理监听端口（单实例桌面应用，使用固定端口即可）
const PROXY_PORT: u16 = 18765;

/// 应用共享状态：把代理端口暴露给前端（invoke）
struct AppState {
    port: u16,
}

#[derive(Deserialize)]
struct ProxyQuery {
    url: String,
}

/// 前端调用：获取本地代理端口
#[tauri::command]
fn get_proxy_port(state: tauri::State<AppState>) -> u16 {
    state.port
}

/// 读取用户工作区频道数据。
/// 存放在应用数据目录的 channels.json（由前端 save_channels 写入）。
/// 未写入过则返回 null，前端回退到内置种子列表。
#[tauri::command]
fn load_channels(app: tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?;
    let path = dir.join("channels.json");
    std::fs::read_to_string(path).ok()
}

/// 持久化用户工作区频道数据到应用数据目录。
/// payload 为 JSON 字符串：{ "categories": string[], "channels": Channel[] }
#[tauri::command]
fn save_channels(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let path = dir.join("channels.json");
    std::fs::write(&path, payload).map_err(|e| format!("写入 channels.json 失败: {e}"))?;
    Ok(())
}

/// 把真实直播地址包装成本地代理地址
fn proxy_url(raw: &str, port: u16) -> String {
    format!(
        "http://127.0.0.1:{}/proxy?url={}",
        port,
        urlencoding::encode(raw)
    )
}

/// 重写 m3u8 播放列表：把内部引用的分片 / 子列表地址改写为本地代理地址，
/// 这样 hls.js 后续请求这些资源时也走同源代理，不受 CORS 限制。
fn rewrite_playlist(body: &[u8], base: &reqwest::Url, port: u16) -> Vec<u8> {
    let text = String::from_utf8_lossy(body);
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let t = line.trim();
        // 注释行 / 空行原样保留
        if t.is_empty() || t.starts_with('#') {
            out.push_str(line);
            out.push('\n');
            continue;
        }
        if t.starts_with("http://") || t.starts_with("https://") {
            // 已是绝对地址
            out.push_str(&proxy_url(t, port));
        } else if t.starts_with("rtmp://")
            || t.starts_with("rtsp://")
            || t.starts_with("rtp://")
        {
            // 非 HTTP 协议无法走本代理，原样保留
            out.push_str(line);
        } else {
            // 相对地址：基于 m3u8 自身地址解析成绝对地址再包装
            match base.join(t) {
                Ok(abs) => out.push_str(&proxy_url(abs.as_str(), port)),
                Err(_) => out.push_str(line),
            }
        }
        out.push('\n');
    }
    out.into_bytes()
}

async fn proxy_handler(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ProxyQuery>,
) -> Response {
    let port = state.port;

    // 仅允许 http / https，避免被当作 SSRF 跳板
    let target = match reqwest::Url::parse(&q.url) {
        Ok(u) if u.scheme() == "http" || u.scheme() == "https" => u,
        _ => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                "invalid or unsupported url",
            )
                .into_response()
        }
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let upstream = match client.get(target.clone()).send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("upstream request failed: {e}"),
            )
                .into_response()
        }
    };

    let status = upstream.status();
    let content_type = upstream.headers().get(axum::http::header::CONTENT_TYPE).cloned();

    let is_playlist = content_type
        .as_ref()
        .and_then(|c| c.to_str().ok())
        .map(|c| c.contains("mpegurl") || c.contains("vnd.apple.mpegurl"))
        .unwrap_or(false)
        || target.path().ends_with(".m3u8")
        || target.path().ends_with(".m3u");

    let bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("upstream body read failed: {e}"),
            )
                .into_response()
        }
    };

    let payload: Vec<u8> = if is_playlist {
        rewrite_playlist(&bytes, &target, port)
    } else {
        bytes.to_vec()
    };

    let mut builder = Response::builder().status(status);
    if let Some(h) = builder.headers_mut() {
        // 关键：放开跨域，使 hls.js 的 XHR 请求能拿到流
        h.insert(
            axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
            axum::http::header::HeaderValue::from_static("*"),
        );
        if let Some(ct) = content_type {
            h.insert(axum::http::header::CONTENT_TYPE, ct);
        }
    }

    builder.body(Body::from(payload)).unwrap_or_else(|_| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "response build failed",
        )
            .into_response()
    })
}

fn main() {
    let state = Arc::new(AppState { port: PROXY_PORT });

    // 在 Tauri 自带的 async runtime 中起本地代理，避免嵌套 tokio runtime
    let proxy_state = state.clone();
    tauri::async_runtime::spawn(async move {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], PROXY_PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("本地代理绑定失败 (端口 {PROXY_PORT}): {e}");
                return;
            }
        };
        let app = Router::new()
            .route("/proxy", get(proxy_handler))
            .with_state(proxy_state);
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("本地代理服务异常: {e}");
        }
    });

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![get_proxy_port, load_channels, save_channels])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
