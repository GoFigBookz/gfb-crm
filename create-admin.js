import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { hash } from 'bcryptjs';

async function createAdmin() {
  const client = createClient({ url: 'file:./data/crm.db' });
  const db = drizzle(client);
  
  const passwordHash = await hash('GoFig2026!', 12);
  
  try {
    await db.run(`INSERT INTO users (email, name, passwordHash, role, authProvider, isActive, createdAt, updatedAt, lastSignInAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['markie@gofig.ca', 'Markie', passwordHash, 'admin', 'local', 1, new Date(), new Date(), new Date()]);
    console.log('✅ Admin user created: markie@gofig.ca / GoFig2026!');
  } catch (e) {
    console.log('Note:', e.message);
  }
  client.close();
}

createAdmin();
