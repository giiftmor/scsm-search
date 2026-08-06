import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { ConnectionPool } from 'mssql';
import { pino, type Logger } from 'pino';
import type { AppConfig } from '../src/config.js';
import { start } from '../src/start.js';

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    dbServer: 'db.example.com',
    dbUser: 'svc',
    dbPassword: 'pw',
    apiKeys: ['key'],
    port: 0,
    searchMode: 'fts',
    ...overrides,
  };
}

function fakePool(recordset: unknown[] | 'throw', queryLog: string[]): ConnectionPool {
  return {
    request() {
      return {
        input() {},
        async query(_sql: string) {
          if (recordset === 'throw') {
            throw new Error('probe denied');
          }
          queryLog.push('query');
          return { recordset };
        },
      };
    },
  } as unknown as ConnectionPool;
}

function fakeLogger(): { logger: Logger; calls: { level: string; msg: string }[] } {
  const calls: { level: string; msg: string }[] = [];
  const logger = {
    warn: (o: unknown, msg?: string) => calls.push({ level: 'warn', msg: msg ?? String(o) }),
    error: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => logger,
    level: 'info',
    levels: pino().levels,
  } as unknown as Logger;
  return { logger, calls };
}

async function close(s: Server) {
  await new Promise((resolve) => s.close(resolve));
}

test('start: rejects when DB_SERVER or API_KEYS is missing', async () => {
  await assert.rejects(start(baseConfig({ dbServer: '' })), /DB_SERVER and API_KEYS/);
  await assert.rejects(start(baseConfig({ apiKeys: [] })), /DB_SERVER and API_KEYS/);
});

test('start: warns when fts mode and no catalog is found', async () => {
  const { logger, calls } = fakeLogger();
  const s = await start(baseConfig({ searchMode: 'fts' }), { logger, pool: fakePool([{ n: 0 }], []) });
  await close(s);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'warn');
  assert.match(calls[0].msg, /FTS catalog not found/);
});

test('start: does not warn when fts mode and a catalog exists', async () => {
  const { logger, calls } = fakeLogger();
  const s = await start(baseConfig({ searchMode: 'fts' }), { logger, pool: fakePool([{ n: 1 }], []) });
  await close(s);
  assert.equal(calls.length, 0);
});

test('start: warns distinctly when the catalog probe fails', async () => {
  const { logger, calls } = fakeLogger();
  const s = await start(baseConfig({ searchMode: 'fts' }), { logger, pool: fakePool('throw', []) });
  await close(s);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'warn');
  assert.match(calls[0].msg, /probe failed/);
});

test('start: skips the catalog probe entirely in like mode', async () => {
  const queryLog: string[] = [];
  const { logger, calls } = fakeLogger();
  const s = await start(baseConfig({ searchMode: 'like' }), { logger, pool: fakePool([{ n: 0 }], queryLog) });
  await close(s);
  assert.equal(queryLog.length, 0);
  assert.equal(calls.length, 0);
});

test('start: boots the server with a real listen on the configured port', async () => {
  const { logger } = fakeLogger();
  const config = baseConfig({ port: 0 });
  const s = await start(config, { logger, pool: fakePool([{ n: 1 }], []) });
  assert.ok(s.listening);
  await close(s);
});
