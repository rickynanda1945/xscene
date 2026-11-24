FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
# Copy only application inputs. Private .env files never enter the image,
# even if a GitHub upload accidentally omits .dockerignore.
COPY package.json package-lock.json next.config.ts tsconfig.json next-env.d.ts ./
COPY src ./src
COPY scripts ./scripts
COPY database ./database
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN groupadd --system --gid 1001 nodeapp && useradd --system --uid 1001 --gid nodeapp nodeapp && mkdir -p /data/storage && chown -R nodeapp:nodeapp /data /app
COPY --from=builder --chown=nodeapp:nodeapp /app/.next/standalone ./
COPY --from=builder --chown=nodeapp:nodeapp /app/.next/static ./.next/static
COPY --from=builder --chown=nodeapp:nodeapp /app/public ./public
COPY --from=builder --chown=nodeapp:nodeapp /app/scripts ./scripts
COPY --from=builder --chown=nodeapp:nodeapp /app/database ./database
COPY --from=builder --chown=nodeapp:nodeapp /app/package.json ./package.json
COPY --from=builder --chown=nodeapp:nodeapp /app/build-info.json ./build-info.json
USER nodeapp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "scripts/start-container.sh"]
