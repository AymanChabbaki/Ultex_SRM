FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
