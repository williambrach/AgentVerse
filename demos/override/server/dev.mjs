import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: '3001', HOST: '127.0.0.1' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
children.forEach(child => child.on('exit', code => stop(code || 0)));
