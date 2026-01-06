import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { config } from '../config';

async function migrate() {
  console.info('Running database migrations...');

  const pool = new Pool({
    connectionString: config.database.url,
  });

  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      console.info(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await pool.query(sql);
      console.info(`Completed: ${file}`);
    }

    console.info('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
