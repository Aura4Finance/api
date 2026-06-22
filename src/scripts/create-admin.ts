import  db  from "@/config/db-config";
import argon from 'argon2';

async function createInitialAdmin() {
  // Check if an admin already exists
  const existingAdmin = await db.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (existingAdmin) {
    console.log('✅ Admin already exists:', existingAdmin.email);
    return;
  }


  const password = 'Admin@123'; 
  const hash = await argon.hash(password);

  // Create the admin
  const admin = await db.user.create({
    data: {
      firstname: "Super",
      lastname: "Admin",
      provider: "LOCAL",
      email: 'admin@sultured.com',
      password: hash,
      role: 'ADMIN',
    },
  });

  console.log('🚀 Admin created successfully:', admin.email);
}

createInitialAdmin()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
