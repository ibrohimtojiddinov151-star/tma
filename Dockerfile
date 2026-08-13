# TMA backend (bot + API + notification worker).
# The Mini App is deployed separately to Vercel and is not part of this image.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so dependency installs cache across code changes.
COPY server/package.json ./
RUN npm install

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
