import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow your local IP for mobile testing
  allowedDevOrigins: ['192.168.0.207'],
};

export default nextConfig;
