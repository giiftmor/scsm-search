export interface AppConfig {
  dbServer: string;
  dbUser: string;
  dbPassword: string;
  apiKeys: string[];
  port: number;
  searchMode: 'fts' | 'like';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    dbServer: env.DB_SERVER ?? '',
    dbUser: env.DB_USER ?? '',
    dbPassword: env.DB_PASSWORD ?? '',
    apiKeys: (env.API_KEYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    port: Number(env.PORT ?? 3000),
    searchMode: env.SEARCH_MODE === 'like' ? 'like' : 'fts',
  };
}
