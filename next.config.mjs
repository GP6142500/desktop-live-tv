/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态导出：Tauri 直接加载本地 out/ 目录，无需 Node 服务器
  output: "export",
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // 导出后资源以相对路径引用，兼容 Tauri 自定义协议 (tauri://localhost)
  trailingSlash: true,
};

export default nextConfig;
