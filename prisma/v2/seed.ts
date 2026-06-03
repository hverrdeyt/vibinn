import crypto from 'node:crypto';
import { PrismaClient } from '../../generated/prisma-v2-client/index.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.inviteRedemption.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      phoneNumberE164: '+15551234567',
      displayName: 'Vibinn Founding User',
      username: 'foundinguser',
      status: 'ACTIVE',
      onboardingCompleted: false,
      lastLoginAt: new Date(),
    },
  });

  const invite = await prisma.inviteCode.create({
    data: {
      ownerUserId: user.id,
      code: 'ABC123',
      label: 'Founding testers',
      maxRedemptions: 100,
    },
  });

  await prisma.inviteRedemption.create({
    data: {
      inviteCodeId: invite.id,
      userId: user.id,
      phoneNumberE164: user.phoneNumberE164,
    },
  });

  await prisma.otpRequest.create({
    data: {
      phoneNumberE164: user.phoneNumberE164,
      purpose: 'SIGN_IN',
      provider: 'VONAGE_VERIFY',
      providerRequestId: crypto.randomUUID().replace(/-/g, ''),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    },
  });

  console.log(`Seeded v2 auth data for ${user.phoneNumberE164} with invite ${invite.code}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
