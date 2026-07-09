import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import JSONC from 'tiny-jsonc';

export interface AppConfig {
  outputDir: string;
  /** Polling interval in minutes (converted to seconds in Manager) */
  interval: number;
  /** Bigo room siteIds to monitor */
  rooms: string[];
}

const defaults: AppConfig = {
  outputDir: './recordings',
  interval: 3,
  rooms: [],
};

const CONFIG_NAMES = ['bigorec.jsonc', 'bigorec.json'] as const;

function findConfigPath(): string | null {
  for (const name of CONFIG_NAMES) {
    if (existsSync(name)) return name;
  }
  return null;
}

export function loadConfig(): AppConfig {
  const configPath = findConfigPath();

  if (!configPath) {
    console.error('Config file not found. Create bigorec.jsonc or bigorec.json like:');
    console.error(
      JSON.stringify(
        {
          outputDir: './recordings',
          interval: 3,
          rooms: ['1106771413'],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const raw = readFileSync(configPath, 'utf-8');
  let parsed: Partial<AppConfig>;

  try {
    parsed = JSONC.parse(raw);
  } catch {
    console.error(`Invalid JSON in ${configPath}`);
    process.exit(1);
  }

  return { ...defaults, ...parsed };
}

/** Save config to the file it was loaded from, or bigorec.jsonc by default. */
export function saveConfig(config: AppConfig, path?: string): void {
  const savePath = path ?? findConfigPath() ?? 'bigorec.jsonc';
  writeFileSync(savePath, JSON.stringify(config, null, 2) + '\n');
}
