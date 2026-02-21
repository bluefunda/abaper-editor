FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
ARG VITE_GITHUB_CLIENT_ID
ENV VITE_GITHUB_CLIENT_ID=${VITE_GITHUB_CLIENT_ID}
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 3000
ENV ABAPER_HOST=abaper
ENV ABAPER_PORT=8080
ENV ABAPER_LSP_PORT=8089
# nginx:alpine auto-runs envsubst on /etc/nginx/templates/*.template → /etc/nginx/conf.d/
CMD ["nginx", "-g", "daemon off;"]
