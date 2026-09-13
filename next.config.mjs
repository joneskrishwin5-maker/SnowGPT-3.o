/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ['serialport', '@serialport/bindings-cpp'],
};

export default nextConfig;