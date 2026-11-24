# Imagen para publicar Crypto Rush (Railway, Render, Fly.io o cualquier hosting con Docker)
FROM node:22-slim
WORKDIR /app

# dependencias (se cachean mientras no cambien los package-lock)
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm ci --prefix client && npm ci --prefix server --omit=dev

# código
COPY shared ./shared
COPY client ./client
COPY server/src ./server/src

# variables que el juego necesita al compilarse (se cargan en el panel del hosting)
ARG VITE_MONETAG_ZONE
ARG VITE_TWA_RETURN_URL
RUN npm run build --prefix client && rm -rf client/node_modules

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/src/index.js"]
