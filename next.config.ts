import type { NextConfig } from "next";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  importScripts: ["/sw-custom.js"],
});

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure trailing slashes are handled correctly
  trailingSlash: false,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/a/client',
        permanent: false,
      },
    ];
  },
};

export default withPWA(nextConfig);
