import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const processes = [];
const require = createRequire(import.meta.url);
const vitePackagePath = require.resolve('vite/package.json');
const viteCliPath = path.join(path.dirname(vitePackagePath), 'bin', 'vite.js');
let isShuttingDown = false;

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', code => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  processes.push(child);
}

function shutdown(code = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('compile-data', process.execPath, ['scripts/compile-data.js']);
run('admin-api', process.execPath, ['scripts/admin-api.js']);
run('vite', process.execPath, [viteCliPath]);
