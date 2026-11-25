# Image simple (mono-étage) privilégiant la lisibilité : le CLI Prisma (devDependency)
# reste nécessaire au démarrage pour générer le client et appliquer les migrations.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
