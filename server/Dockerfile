FROM node:20-alpine AS builder

RUN apk add --no-cache libreoffice-writer fontconfig ttf-dejavu font-liberation

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production
ENV SAL_USE_VCLPLUGIN=svp

CMD ["node", "src/index.js"]
