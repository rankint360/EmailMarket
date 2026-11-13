FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY test ./test
COPY tsconfig.json ./
RUN npm run build && npm prune --omit=dev

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production BIND_HOST=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY db ./db
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
