/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true, serverExternalPackages: ['pg', 'pg-copy-streams'] };
export default nextConfig;
