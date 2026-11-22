import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Không để `next dev` tự tạo/sửa AGENTS.md - giữ repo đúng như mã nguồn gốc.
  agentRules: false,
  headers: async () => securityHeaders(),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
