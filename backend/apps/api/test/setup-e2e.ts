// Runs before every e2e file (vitest setupFiles), ahead of any import of the app modules, which
// read DATABASE_URL when they are first loaded.
import 'dotenv/config';
import { useTestDatabase } from './db-safety.js';

useTestDatabase(process.env);
