import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { STARTING_ID } from '../utils/userId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/space_stellar',
});

const migrate = async () => {
  try {
    console.log('🔄 Adding sequential user ID system...\n');

    // Check if id column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ Column "id" already exists');
      console.log('⚠️  Skipping migration (already migrated)');
      process.exit(0);
    }

    // Step 1: Add id column (nullable first)
    console.log('📝 Step 1: Adding id column...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN id INTEGER UNIQUE
    `);
    console.log('✅ Column "id" added\n');

    // Step 2: Create sequence starting from STARTING_ID
    console.log(`📝 Step 2: Creating sequence starting from ${STARTING_ID}...`);
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS user_id_seq 
      START WITH ${STARTING_ID}
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1
    `);
    console.log('✅ Sequence created\n');

    // Step 3: Assign IDs to existing users
    console.log('📝 Step 3: Assigning IDs to existing users...');
    const existingUsers = await pool.query('SELECT address FROM users ORDER BY created_at ASC');
    
    if (existingUsers.rows.length > 0) {
      console.log(`   Found ${existingUsers.rows.length} existing users`);
      let currentId = STARTING_ID;
      
      for (const user of existingUsers.rows) {
        await pool.query(
          'UPDATE users SET id = $1 WHERE address = $2',
          [currentId, user.address]
        );
        console.log(`   ✅ Assigned ID ${currentId} to ${user.address.slice(0, 8)}...`);
        currentId++;
      }
    } else {
      console.log('   No existing users found');
    }
    console.log('');

    // Step 4: Set default value and make NOT NULL
    console.log('📝 Step 4: Setting default value and making NOT NULL...');
    await pool.query(`
      ALTER TABLE users 
      ALTER COLUMN id SET DEFAULT nextval('user_id_seq'),
      ALTER COLUMN id SET NOT NULL
    `);
    console.log('✅ Default value set\n');

    // Step 5: Set sequence to continue from current max ID
    const maxIdResult = await pool.query('SELECT COALESCE(MAX(id), 0) as max_id FROM users');
    const maxId = parseInt(maxIdResult.rows[0].max_id) || STARTING_ID - 1;
    const nextId = maxId + 1;
    
    console.log(`📝 Step 5: Setting sequence to continue from ${nextId}...`);
    await pool.query(`SELECT setval('user_id_seq', ${nextId}, false)`);
    console.log('✅ Sequence updated\n');

    // Step 6: Add index on id for performance
    console.log('📝 Step 6: Adding index on id column...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)
    `);
    console.log('✅ Index created\n');

    console.log('✅ Migration completed successfully!');
    console.log(`\n📊 User ID System:`);
    console.log(`   - Starting ID: ${STARTING_ID}`);
    console.log(`   - Next ID: ${nextId}`);
    console.log(`   - Total users: ${existingUsers.rows.length}`);
    console.log(`   - ID is unique and cannot be changed\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migrate();



