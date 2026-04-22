#
# Frontend (Vue3 + Vite) Dockerfile
# - Build: Node builds static assets to /dist
# - Run:  Nginx serves /usr/share/nginx/html and proxies /api to backend
#

FROM node:22-alpine AS builder
WORKDIR /app

# Prefer pnpm (lockfile exists)
RUN corepack enable

# 设置 npm/pnpm 镜像源和 electron 镜像源，解决下载超时问题
RUN npm config set registry https://repo.huaweicloud.com/repository/npm/ && \
    pnpm config set registry https://repo.huaweicloud.com/repository/npm/ && \
    npm config set electron_mirror https://repo.huaweicloud.com/electron/

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build-only


FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

