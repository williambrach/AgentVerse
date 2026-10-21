FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY public ./public
COPY index.html tsconfig.json vite.config.ts ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 OVERRIDE_DATA_DIR=/app/data
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
