import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones and other computers on your Wi-Fi open the dev server (e.g. http://192.168.1.20:3000).
  // Development only; production on Vercel ignores this.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
