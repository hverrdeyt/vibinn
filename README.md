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

## Backend Environments

The backend now supports explicit app environments:

- `development`
- `staging`
- `production`

Environment loading order:

1. `.env.<APP_ENV>.local`
2. `.env.local` for `development` only
3. `.env.<APP_ENV>`
4. `.env`

Examples:

- Local development backend:
  `npm run dev:server`
- Local staging backend:
  `cp .env.staging.example .env.staging`
  `npm run dev:server:staging`
- Local production-like backend:
  `cp .env.production.example .env.production`
  `npm run start:server:production`

Environment-specific database commands:

- Staging Prisma client:
  `npm run prisma:generate:staging`
- Staging migrations:
  `npm run prisma:migrate:deploy:staging`
- Staging seed:
  `npm run prisma:seed:staging`
- Production Prisma client:
  `npm run prisma:generate:production`
- Production migrations:
  `npm run prisma:migrate:deploy:production`
- Production seed:
  `npm run prisma:seed:production`

V2 user/auth schema commands:

- Generate v2 Prisma client for staging:
  `npm run prisma:v2:generate:staging`
- Validate v2 Prisma schema for staging:
  `npm run prisma:v2:validate:staging`
- Create or run v2 staging migrations:
  `npm run prisma:v2:migrate:dev:staging -- --name init_user_auth`
- Deploy v2 staging migrations:
  `npm run prisma:v2:migrate:deploy:staging`
- Seed v2 staging auth data:
  `npm run prisma:v2:seed:staging`

The v2 schema lives in [`prisma/v2/schema.prisma`](./prisma/v2/schema.prisma) and uses `DATABASE_URL_V2`.

Current v2 auth endpoints:

- `GET /api/v2/auth/config`
- `POST /api/v2/auth/otp/request`
- `POST /api/v2/auth/otp/verify`

Expected OTP provider env:

- `VONAGE_API_KEY`
- `VONAGE_API_SECRET`
- `VONAGE_VERIFY_BRAND`
- `VONAGE_VERIFY_CODE_LENGTH`
- `VONAGE_VERIFY_PIN_EXPIRY_SECONDS`
- `VONAGE_VERIFY_WORKFLOW_ID`
- Optional App Review-only OTP env:
  - `APP_REVIEW_MODE_ENABLED`
  - `APP_REVIEW_PHONE`
  - `APP_REVIEW_OTP_CODE`

Render blueprints for backend split deploys:

- `render.staging.yaml`
- `render.production.yaml`

## Production Cutover Checklist

Before shipping the current v2 stack to production:

1. Backend / Render
   - Deploy from `render.production.yaml`
   - Set both `DATABASE_URL` and `DATABASE_URL_V2`
   - Set all Vonage env vars:
     - `VONAGE_API_KEY`
     - `VONAGE_API_SECRET`
     - `VONAGE_VERIFY_BRAND`
   - `VONAGE_VERIFY_CODE_LENGTH=6`
   - `VONAGE_VERIFY_PIN_EXPIRY_SECONDS`
   - `VONAGE_VERIFY_WORKFLOW_ID`
   - Do **not** set `V2_STAGING_FIXED_OTP_CODE` in production
   - If App Review needs a pre-populated demo account, optionally set:
     - `APP_REVIEW_MODE_ENABLED=true`
     - `APP_REVIEW_PHONE=+16172345678`
     - `APP_REVIEW_OTP_CODE=1247`
   - Set R2 env vars for media uploads
   - Set Firebase env vars for push delivery
   - Set `API_ORIGIN=https://api.vibinn.club`

2. Database
   - Run both legacy and v2 Prisma deploy migrations in production
   - Verify the production service runs with the v2 Prisma client generated from `prisma/v2/schema.prisma`

3. iOS / AppDecision
   - Native default API base now targets `https://api.vibinn.club`
   - Confirm `MIXPANEL_PROJECT_TOKEN` is set for the Release build
   - Confirm `GoogleService-Info.plist` points to the production Firebase project
   - Confirm the production Google Sign-In and Apple Sign-In client IDs are enabled

4. Release validation
   - Request and verify a real OTP SMS
   - Complete sign up, onboarding, and first memory creation
   - Upload media and avatar
   - Toggle push notifications on/off
   - Receive a foreground push and a background push
   - Test block/report
   - Test followers/following lists
   - Test invite flows and invite-code redemption
