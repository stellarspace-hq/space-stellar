import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/space_stellar',
});

const migrate = async () => {
  try {
    console.log('🔄 Running database migrations...');

    // Create sequence for user ID
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS user_id_seq START WITH 1;
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY DEFAULT nextval('user_id_seq'),
        address TEXT UNIQUE NOT NULL,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT,
        email TEXT,
        bio TEXT,
        avatar_url TEXT,
        default_ship_token_id BIGINT,
        points INTEGER DEFAULT 2000 NOT NULL CHECK (points >= 0),
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create trigger to update updated_at timestamp
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create ships table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ships (
        token_id BIGINT PRIMARY KEY,
        owner_address TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
        ipfs_cid TEXT NOT NULL,
        class TEXT NOT NULL,
        rarity TEXT NOT NULL,
        tier TEXT,
        attack INT NOT NULL,
        speed INT NOT NULL,
        shield INT NOT NULL,
        last_onchain_update TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Add tier column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE ships 
      ADD COLUMN IF NOT EXISTS tier TEXT;
    `);

    // Create rooms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code TEXT UNIQUE NOT NULL,
        host_address TEXT NOT NULL REFERENCES users(address),
        guest_address TEXT REFERENCES users(address),
        mode TEXT CHECK (mode IN ('solo','versus','multiplayer')) DEFAULT 'solo',
        seed BIGINT NOT NULL,
        status TEXT CHECK (status IN ('waiting','playing','finished')) DEFAULT 'waiting',
        host_ready BOOLEAN DEFAULT FALSE NOT NULL,
        guest_ready BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add room_code column if it doesn't exist (for existing tables)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'rooms' AND column_name = 'room_code'
        ) THEN
          ALTER TABLE rooms ADD COLUMN room_code TEXT UNIQUE;
        END IF;
      END $$;
    `);

    // Create matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mode TEXT CHECK (mode IN ('solo','versus','multiplayer')) NOT NULL,
        p1_address TEXT NOT NULL REFERENCES users(address),
        p2_address TEXT REFERENCES users(address),
        p1_ship_token_id BIGINT,
        p2_ship_token_id BIGINT,
        p1_ship_name TEXT,
        p2_ship_name TEXT,
        p1_ship_rarity TEXT,
        p2_ship_rarity TEXT,
        p1_score INT NOT NULL,
        p2_score INT,
        duration_ms INT NOT NULL DEFAULT 0,
        room_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Add ship name and rarity columns if they don't exist (for existing tables)
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'matches' AND column_name = 'p1_ship_name'
        ) THEN
          ALTER TABLE matches ADD COLUMN p1_ship_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'matches' AND column_name = 'p2_ship_name'
        ) THEN
          ALTER TABLE matches ADD COLUMN p2_ship_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'matches' AND column_name = 'p1_ship_rarity'
        ) THEN
          ALTER TABLE matches ADD COLUMN p1_ship_rarity TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'matches' AND column_name = 'p2_ship_rarity'
        ) THEN
          ALTER TABLE matches ADD COLUMN p2_ship_rarity TEXT;
        END IF;
      END $$;
    `);

    // issue #94: seed/checksum only ever stored placeholders and nothing read
    // them, so drop them (idempotent for existing databases).
    await pool.query(`
      ALTER TABLE matches DROP COLUMN IF EXISTS seed;
      ALTER TABLE matches DROP COLUMN IF EXISTS checksum;
    `);

    // Create leaderboard table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        address TEXT PRIMARY KEY REFERENCES users(address) ON DELETE CASCADE,
        best_score INT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ships_owner ON ships(owner_address);
      CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches(p1_address);
      CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches(p2_address);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(best_score DESC);
      CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
    `);

    console.log('✅ Database migrations completed successfully!');
    console.log('📊 Tables created:');
    console.log('   - users (wallet, user_id, username, email, bio, avatar_url, etc.)');
    console.log('   - ships (NFT metadata)');
    console.log('   - matches (game history)');
    console.log('   - leaderboard (scores)');
    console.log('   - rooms (multiplayer)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migrate();


