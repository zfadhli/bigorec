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
    entry: { 'bin/bigorec-tui': 'bin/bigorec-tui.ts' },
    format: 'esm',
    platform: 'node',
    deps: {
      neverBundle: ['@opentui/core'],
    },
  },
])
