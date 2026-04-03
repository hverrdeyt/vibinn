<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e6a45a15-6472-4915-811c-84069a0a0b70

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values you need.
3. Start the mock backend API:
   `npm run dev:server`
4. Start the frontend:
   `npm run dev`

## Database Foundation

This project now includes a Prisma/PostgreSQL schema at [`prisma/schema.prisma`](./prisma/schema.prisma).

Useful commands:

- Generate Prisma client:
  `npm run prisma:generate`
- Run local development migrations:
  `npm run prisma:migrate:dev`

Required env for Prisma:

- `DATABASE_URL`
