#!/usr/bin/env bun
import { loadConfig } from '../src/tui/config.js'
import { Manager } from '../src/tui/manager.js'
import { CLI } from '../src/tui/cli.js'

const config = loadConfig()
const manager = new Manager(config)
const cli = new CLI(manager, config)
cli.start().catch((err) => {
  console.error(err)
  process.exit(1)
})
