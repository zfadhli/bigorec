import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export interface AppConfig {
  outputDir: string
  /** Polling interval in minutes (converted to seconds in Manager) */
  interval: number
  /** Bigo room siteIds to monitor */
  rooms: string[]
}

const defaults: AppConfig = {
  outputDir: './recordings',
  interval: 3,
  rooms: [],
}

const CONFIG_FILE = 'bigorec.json'

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) {
    console.error('Config file not found. Create bigorec.json like:')
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
    )
    process.exit(1)
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  let parsed: Partial<AppConfig>

  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error(`Invalid JSON in ${CONFIG_FILE}`)
    process.exit(1)
  }

  return { ...defaults, ...parsed }
}

export function saveConfig(config: AppConfig, path = 'bigorec.json'): void {
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
}
