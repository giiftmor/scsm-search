export interface AppConfig {
  dbServer: string;
  dbUser: string;
  dbPassword: string;
  apiKeys: string[];
  port: number;
  searchMode: 'fts' | 'like';
}

const PORT_MIN = 1;
const PORT_MAX = 65535;
const DEFAULT_PORT = 3000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const portRaw = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    throw new Error(`Invalid PORT "${portRaw}" — expected an integer between ${PORT_MIN} and ${PORT_MAX}`);
  }

  const searchMode = env.SEARCH_MODE ?? 'fts';
  if (searchMode !== 'fts' && searchMode !== 'like') {
    throw new Error(`Invalid SEARCH_MODE "${searchMode}" — expected "fts" or "like"`);
  }

  return {
    dbServer: env.DB_SERVER ?? '',
    dbUser: env.DB_USER ?? '',
    dbPassword: env.DB_PASSWORD ?? '',
    apiKeys: (env.API_KEYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    port,
    searchMode,
  };
}
