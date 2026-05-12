# Prisma V2

This schema is the starting point for the new Vibinn backend domain.

Current scope:

- phone-number-first identity
- OTP-based sign up / sign in
- invite-only onboarding
- session storage

Core flow:

1. User enters phone number.
2. Backend creates an `OtpRequest`.
3. During sign up, backend validates an active `InviteCode`.
4. After OTP verification, backend creates or finds `User`.
5. Backend records `InviteRedemption` on first successful signup.
6. Backend creates a `Session`.

Important:

- This v2 schema uses `DATABASE_URL_V2`.
- It is intentionally isolated from the legacy schema that still uses `DATABASE_URL`.
