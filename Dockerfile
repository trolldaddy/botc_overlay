# 使用 Node.js 官方映像檔
FROM node:20

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝相依套件
RUN npm install

# 複製所有專案檔案
COPY . .

# 啟動應用程式
CMD ["npm", "start"]

# Cloud Run 預設監聽 8080 端口
EXPOSE 8080
