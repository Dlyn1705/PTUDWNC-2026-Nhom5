FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY Culinary_Blog_Nhom5/culinary-blog-web/package*.json ./
RUN npm ci
COPY Culinary_Blog_Nhom5/culinary-blog-web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ARG PUBLIC_ORIGIN
ENV NEXT_PUBLIC_API_URL=$PUBLIC_ORIGIN
RUN npm run build -- --webpack
RUN mkdir -p public
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
CMD ["node", "server.js"]
