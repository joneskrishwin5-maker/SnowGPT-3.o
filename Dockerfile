# Use an official Node.js runtime as a parent image
FROM node:22-bullseye

# Install Arduino CLI securely into the system bin
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh

# Configure Arduino CLI and download the ESP32 and Arduino cores
RUN arduino-cli config init
RUN arduino-cli config set board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
RUN arduino-cli core update-index
RUN arduino-cli core install esp32:esp32
RUN arduino-cli core install arduino:avr

# Set the working directory for the website
WORKDIR /app

# Copy package files and install website dependencies safely
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of your website code
COPY . .

# Build the Next.js application for production
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Start the Next.js production server
CMD ["npm", "start"]