import { CampaignStatus, EmailJobStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_USER_EMAIL = 'dev@example.com';

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {
      name: 'Dev User',
      avatarUrl: 'https://example.com/avatar.png',
    },
    create: {
      email: SEED_USER_EMAIL,
      name: 'Dev User',
      avatarUrl: 'https://example.com/avatar.png',
    },
  });

  const senderOne = await prisma.sender.upsert({
    where: {
      userId_email: { userId: user.id, email: 'sender-one@example.com' },
    },
    update: {
      displayName: 'Sender One',
      isActive: true,
    },
    create: {
      userId: user.id,
      email: 'sender-one@example.com',
      displayName: 'Sender One',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-one@example.com',
      smtpPassword: 'fake-smtp-password-one',
      hourlyLimit: 200,
      isActive: true,
    },
  });

  const senderTwo = await prisma.sender.upsert({
    where: {
      userId_email: { userId: user.id, email: 'sender-two@example.com' },
    },
    update: {
      displayName: 'Sender Two',
      isActive: true,
    },
    create: {
      userId: user.id,
      email: 'sender-two@example.com',
      displayName: 'Sender Two',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'sender-two@example.com',
      smtpPassword: 'fake-smtp-password-two',
      hourlyLimit: 150,
      isActive: true,
    },
  });

  const existingCampaign = await prisma.campaign.findFirst({
    where: {
      userId: user.id,
      subject: 'Welcome to ReachInbox — Dev Campaign',
    },
  });

  const campaign =
    existingCampaign ??
    (await prisma.campaign.create({
      data: {
        userId: user.id,
        subject: 'Welcome to ReachInbox — Dev Campaign',
        body: 'This is a seeded development campaign for local testing.',
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        delayMs: 2000,
        hourlyLimit: 200,
        status: CampaignStatus.SCHEDULED,
        totalRecipients: 5,
        scheduledCount: 5,
      },
    }));

  const recipients = [
    'recipient-one@example.com',
    'recipient-two@example.com',
    'recipient-three@example.com',
    'recipient-four@example.com',
    'recipient-five@example.com',
  ];

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]!;
    const sender = index % 2 === 0 ? senderOne : senderTwo;
    const scheduledAt = new Date(campaign.startTime.getTime() + index * campaign.delayMs);

    const existingJob = await prisma.emailJob.findFirst({
      where: { campaignId: campaign.id, recipient },
    });

    if (existingJob) {
      await prisma.emailJob.update({
        where: { id: existingJob.id },
        data: {
          senderId: sender.id,
          subject: campaign.subject,
          body: campaign.body,
          scheduledAt,
          status: EmailJobStatus.SCHEDULED,
        },
      });
    } else {
      await prisma.emailJob.create({
        data: {
          campaignId: campaign.id,
          senderId: sender.id,
          recipient,
          subject: campaign.subject,
          body: campaign.body,
          scheduledAt,
          status: EmailJobStatus.SCHEDULED,
        },
      });
    }
  }

  console.log('Seed completed successfully.');
  console.log(`User: ${user.email}`);
  console.log(`Senders: ${senderOne.email}, ${senderTwo.email}`);
  console.log(`Campaign: ${campaign.subject}`);
  console.log('Email jobs: 5 recipients seeded');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
