FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

# Install necessary dependencies
RUN apt-get update && apt-get install -y curl gnupg ffmpeg \
  && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /usr/share/keyrings/google-chrome.gpg > /dev/null \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google.list \
  && apt-get update \
  && apt-get install -y google-chrome-stable --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*  # Clean up package lists to reduce image size

RUN npm install

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
