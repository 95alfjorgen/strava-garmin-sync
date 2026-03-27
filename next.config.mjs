/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'bullmq', 'ioredis', 'garmin-connect'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle these packages on the server
      config.externals.push('@prisma/client', 'prisma', 'bullmq', 'ioredis');
    }
    return config;
  },
};

export default nextConfig;
