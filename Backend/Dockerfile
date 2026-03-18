FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

# Use dev mode for hot reload when running via docker-compose
CMD ["npm", "run", "dev"]
