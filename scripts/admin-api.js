import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileAllData, getDatasetHeaders, DATASET_FILES } from './compile-data.js';
import { writeCsvFile } from './csv-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.ADMIN_API_PORT || 3001);

let current = compileAllData();
const eventClients = new Set();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of eventClients) {
    client.write(data);
  }
}

function snapshotDatasetFiles() {
  return Object.fromEntries(
    Object.entries(DATASET_FILES).map(([key, fileName]) => {
      const filePath = path.join(DATA_DIR, fileName);
      return [key, fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''];
    })
  );
}

function restoreDatasetFiles(snapshot) {
  for (const [key, content] of Object.entries(snapshot)) {
    const filePath = path.join(DATA_DIR, DATASET_FILES[key]);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function writeRawDatasets(raw) {
  const headers = getDatasetHeaders();
  for (const [key, fileName] of Object.entries(DATASET_FILES)) {
    writeCsvFile(path.join(DATA_DIR, fileName), raw[key] ?? [], headers[key]);
  }
}

function getDatasetsPayload() {
  current = compileAllData();
  return {
    canEdit: true,
    headers: getDatasetHeaders(),
    raw: current.datasets.raw,
    compiled: current.compiled,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      version: current.compiled.version,
      generatedAt: current.compiled.generatedAt,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/datasets') {
    sendJson(res, 200, getDatasetsPayload());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ version: current.compiled.version })}\n\n`);
    eventClients.add(res);
    req.on('close', () => {
      eventClients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/datasets/save') {
    const snapshot = snapshotDatasetFiles();
    try {
      const rawBody = await readBody(req);
      const payload = JSON.parse(rawBody || '{}');
      writeRawDatasets(payload.raw ?? {});
      current = compileAllData();
      broadcast('config-update', {
        version: current.compiled.version,
        generatedAt: current.compiled.generatedAt,
      });
      sendJson(res, 200, getDatasetsPayload());
    } catch (error) {
      restoreDatasetFiles(snapshot);
      current = compileAllData();
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Admin API listening on http://127.0.0.1:${PORT}`);
});
