import { assertMemoryOffBoundaries } from './fixtures/guest-memory-off-runtime.js';
await assertMemoryOffBoundaries();
console.log('4 Guest Memory OFF boundary scenarios passed');
