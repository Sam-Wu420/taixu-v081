console.log('[shim] start');
import { register } from 'tsx/esm/api';
console.log('[shim] api loaded');
const api = register();
console.log('[shim] registered');
await import('./terrain-bake-thread.ts');
console.log('[shim] imported');
