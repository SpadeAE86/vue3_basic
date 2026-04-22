#
# Frontend (Vue3 + Vite) Dockerfile
# - Build: Node builds static assets to /dist
# - Run:  Nginx serves /usr/share/nginx/html and proxies /api to backend
#

FROM node:22-alpine AS builder
WORKDIR /app

# electron 的 postinstall 下载二进制时使用该镜像（不走 npm registry）
ENV ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/

# 设置 npm/pnpm 镜像源，并安装 pnpm（避免 corepack 拉取 pnpm tarball 失败）
RUN npm config set registry https://repo.huaweicloud.com/repository/npm/ && \
    npm install -g pnpm && \
    pnpm config set registry https://repo.huaweicloud.com/repository/npm/

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build-only


FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

