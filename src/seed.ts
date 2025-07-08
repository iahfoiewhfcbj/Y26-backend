import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user with the specified email
  const adminPassword = await bcrypt.hash('IamAdmin123!@#', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@yugam.in' },
    update: {},
    create: {
      email: 'admin@yugam.in',
      name: 'Admin',
      password: adminPassword,
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  console.log('Admin user created:', admin.email);
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });