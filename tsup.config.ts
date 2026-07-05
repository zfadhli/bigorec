import { defineConfig } from 'tsup'

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
    noExternal: [],
  },
])
