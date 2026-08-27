import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * These packages are just paths to native binaries. Bundling them rewrites
   * the `__dirname` those paths are built from, and the binary goes missing.
   */
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],

  /**
   * "Photos" became "Memories". Home screens are pinned to the old path and
   * nobody is going to re-add the app, so the old route keeps working.
   */
  redirects() {
    return Promise.resolve([
      { source: "/photos", destination: "/memories", permanent: true },
      { source: "/api/photos/:path*", destination: "/api/memories/:path*", permanent: true },
    ]);
  },
};

export default nextConfig;
