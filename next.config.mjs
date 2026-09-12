/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['serialport', '@serialport/bindings-cpp'],
};

export default nextConfig;