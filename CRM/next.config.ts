import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's client is generated to a custom path (src/generated/prisma
  // instead of node_modules/.prisma) - Next.js's serverless file tracer
  // doesn't discover that query-engine binary automatically, which throws
  // PrismaClientInitializationError (500s) once deployed to Vercel even
  // though it works fine in local dev where everything's just on disk.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**/*"],
  },

  // uploadFile() prefers Vercel Blob / Supabase Storage (both already served
  // through a CDN with long cache headers — see src/actions/upload.ts); this
  // local-disk /public/uploads path is only the last-resort fallback when
  // neither is configured. Filenames there are unique per upload (nanoid) and
  // never change, so cache them just as aggressively to keep repeat views off
  // Vercel's own bandwidth.
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
