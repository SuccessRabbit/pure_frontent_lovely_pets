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
    if (isShuttingDown) {
      return;
    }
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  processes.push(child);
  return child;
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForAdminApi(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3001/health');
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the local server has finished compiling and starts listening.
    }
    await sleep(250);
  }
  throw new Error('Timed out waiting for Admin API on http://127.0.0.1:3001');
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

async function main() {
  run('admin-api', process.execPath, ['scripts/admin-api.js']);
  await waitForAdminApi();
  run('vite', process.execPath, [viteCliPath]);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
});
