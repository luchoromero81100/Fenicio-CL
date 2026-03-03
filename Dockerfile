FROM node:20-slim
WORKDIR /app
COPY . .
WORKDIR /app/server
RUN npm install --production
WORKDIR /app
EXPOSE 8080
CMD ["node", "server/index.js"]
