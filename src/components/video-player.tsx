"use client";

import * as React from "react";
import type HlsType from "hls.js";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCw,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { isHls, isProgressive, isFlv, type PlayerStatus } from "@/lib/types";
import type { Channel } from "@/data/channels";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  channel: Channel | null;
  /** 当前使用的播放源下标 */
  sourceIndex: number;
  status: PlayerStatus;
  /** 状态变化时上报（loading / playing / buffering / error / idle） */
  onStatusChange: (status: PlayerStatus) => void;
  /** 当前源致命错误，请求上层切换/标记失败 */
  onFatalError: () => void;
  /** 手动切换到下一个播放源（循环） */
  onNextSource: () => void;
  /** 把真实直播地址改写为可播放地址（Tauri 环境走本地代理，浏览器环境直连） */
  resolveUrl: (raw: string) => string;
}

export function VideoPlayer({
  channel,
  sourceIndex,
  status,
  onStatusChange,
  onFatalError,
  onNextSource,
  resolveUrl,
}: VideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<HlsType | null>(null);
  const flvRef = React.useRef<ReturnType<typeof import("flv.js").default.createPlayer> | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [showControls, setShowControls] = React.useState(true);

  const currentUrl = channel ? resolveUrl(channel.urls[sourceIndex]) : null;

  // 全屏状态同步
  React.useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // 加载/切换播放源
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 清理上一次的 hls / flv 实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (flvRef.current) {
      flvRef.current.destroy();
      flvRef.current = null;
    }

    if (!channel || !currentUrl) {
      video.removeAttribute("src");
      video.load();
      onStatusChange("idle");
      return;
    }

    onStatusChange("loading");
    let cancelled = false;

    const attachNative = () => {
      if (cancelled) return;
      video.src = currentUrl;
      video.play().catch(() => {
        /* 自动播放被拦截时等待用户点击 */
      });
    };

    if (isHls(currentUrl) && typeof window !== "undefined") {
      // 动态加载 hls.js，避免 SSR/首次加载体积膨胀
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled) return;
          // Safari 等原生支持 HLS 的浏览器直接走 <video>
          if (Hls.isSupported()) {
            const hls = new Hls({
              lowLatencyMode: true,
              enableWorker: true,
              maxBufferLength: 30,
              backBufferLength: 30,
            });
            hlsRef.current = hls;
            hls.loadSource(currentUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_evt, data) => {
              if (data.fatal) {
                onStatusChange("error");
                onFatalError();
              }
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            attachNative();
          } else {
            onStatusChange("error");
            onFatalError();
          }
        })
        .catch(() => {
          if (!cancelled) {
            onStatusChange("error");
            onFatalError();
          }
        });
    } else if (isFlv(currentUrl)) {
      // FLV 直播流：flv.js 解码后喂给 <video>
      import("flv.js")
        .then(({ default: flvjs }) => {
          if (cancelled) return;
          if (!flvjs.isSupported()) {
            onStatusChange("error");
            onFatalError();
            return;
          }
          const player = flvjs.createPlayer({
            type: "flv",
            url: currentUrl,
            isLive: true,
          });
          flvRef.current = player;
          player.attachMediaElement(video);
          player.on(flvjs.Events.ERROR, () => {
            if (cancelled) return;
            onStatusChange("error");
            onFatalError();
          });
          try {
            player.load();
            video.play().catch(() => {});
          } catch {
            if (!cancelled) {
              onStatusChange("error");
              onFatalError();
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            onStatusChange("error");
            onFatalError();
          }
        });
    } else if (isProgressive(currentUrl)) {
      attachNative();
    } else {
      // 兜底：直接尝试原生播放
      attachNative();
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (flvRef.current) {
        flvRef.current.destroy();
        flvRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, currentUrl]);

  // 视频元素事件 -> 状态上报
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => onStatusChange("playing");
    const onWaiting = () => onStatusChange("buffering");
    const onError = () => {
      onStatusChange("error");
      onFatalError();
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStatusChange, onFatalError]);

  const togglePlay = React.useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const handleVolume = (val: number) => {
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    setMuted(val === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
  };

  // 快捷键：空格 播放/暂停，F 全屏（输入框 / 命令面板聚焦时忽略）
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          t.closest("[cmdk-root]"))
      ) {
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFullscreen]);

  const statusLabel: Record<PlayerStatus, string> = {
    idle: "未选择频道",
    loading: "连接中…",
    playing: "直播中",
    buffering: "缓冲中…",
    error: "播放失败",
  };

  return (
    <div
      ref={containerRef}
      className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-black"
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        playsInline
        muted={muted}
        onClick={togglePlay}
      />

      {/* 空状态占位 */}
      {!channel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Tv className="h-16 w-16 opacity-40" />
          <p className="text-sm">从左侧选择频道开始观看</p>
        </div>
      )}

      {/* 加载 / 缓冲遮罩 */}
      {(status === "loading" || status === "buffering") && channel && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      )}

      {/* 顶部信息条 */}
      {channel && (
        <div
          className={cn(
            "absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 transition-opacity",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">
              {channel.name}
            </span>
            <span className="text-xs text-white/60">
              {channel.category} · 源 {sourceIndex + 1}/{channel.urls.length}
            </span>
          </div>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs",
              status === "error"
                ? "bg-destructive/80 text-white"
                : "bg-black/50 text-white/80"
            )}
          >
            {statusLabel[status]}
          </span>
        </div>
      )}

      {/* 底部控制条 */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 transition-opacity",
          showControls || status === "error" ? "opacity-100" : "opacity-0"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={togglePlay}
          disabled={!channel}
          aria-label="播放/暂停"
        >
          {videoRef.current?.paused ? (
            <Play className="h-5 w-5" />
          ) : (
            <Pause className="h-5 w-5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={toggleMute}
          disabled={!channel}
          aria-label="静音"
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </Button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => handleVolume(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer accent-primary"
          aria-label="音量"
        />

        <div className="flex-1" />

        {channel && channel.urls.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
            onClick={onNextSource}
            aria-label="切换播放源"
          >
            <RotateCw className="h-4 w-4" />
            换源
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={toggleFullscreen}
          disabled={!channel}
          aria-label="全屏"
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" />
          ) : (
            <Maximize className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
