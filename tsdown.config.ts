import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    dts: true,
    clean: true,
  },
  {
    entry: { 'bin/bigorec': 'bin/bigorec.ts' },
    format: 'esm',
    platform: 'node',
  },
  {
    entry: { 'tui/index': 'src/tui/index.ts' },
    format: 'esm',
    deps: {
      neverBundle: ['@opentui/core'],
    },
  },
])
