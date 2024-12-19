#
# 👨‍👨‍👦‍👧💻 Dev phase
#
FROM node:18-alpine as dev
# alpine missed shared-libraries. so if needed, install here
RUN apk add --no-cache libc6-compat
# install and activate pnpm
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

# Create app directory
WORKDIR /app

# Set as dev environment
ENV NODE_ENV dev

# Copy source code into app directory
COPY --chown=node:node . .

# Install dependencies
RUN pnpm install

# Set Docker as a non-root user
USER node

#
# 🖥️📲 Production-build phase
#
FROM node:18-alpine as build

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate
WORKDIR /app

# Set as production environment
ENV NODE_ENV production

# Copy source code with dev install
COPY --chown=node:node --from=dev /app/node_modules ./node_modules
COPY --chown=node:node . .

# Build nest-js project
RUN pnpm build
# Install only the production dependencies and prun store to optimize image size
RUN pnpm install --production && pnpm store prune

USER node

#
# 🚀 Production-deploy phase
#
FROM node:18-alpine as prod

WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

ENV NODE_ENV production

# Copy only the necessary files
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/node_modules ./node_modules

# Set Docker as non-root user
USER node

CMD ["node", "dist/main.js"]