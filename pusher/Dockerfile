FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
RUN addgroup -S gleaned && adduser -S gleaned -G gleaned
USER gleaned
EXPOSE 3001
CMD ["node", "index.js"]
