import { loadConfig } from './config.js'
import { Manager } from './manager.js'
import { CLI } from './cli.js'

const config = loadConfig()
const manager = new Manager(config)
const cli = new CLI(manager, config)

cli.start().catch((err) => {
  console.error(err)
  process.exit(1)
})
