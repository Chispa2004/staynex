import 'dotenv/config';
import { validateEnvironment } from '../src/config/env.js';

validateEnvironment({ exitOnError: true });
