import type {
  CliRenderer,
  InputRenderable,
  KeyEvent,
  Renderable,
  TextRenderable,
} from '@opentui/core'
import { Box, createCliRenderer, Input, Text } from '@opentui/core'
import type { AppConfig } from './config.js'
import { saveConfig } from './config.js'
import type { Manager } from './manager.js'
import type { AppStatus } from './manager.js'

const VERSION = '0.1.0'

const REFRESH_MS = 2000
const STARTUP_DELAY = 5000

const stateColors: Record<AppStatus, string> = {
  recording: 'cyan',
  polling: 'white',
  idle: 'gray',
  error: 'red',
}

export class CLI {
  private renderer: CliRenderer | null = null
  private roomRenderables = new Map<string, TextRenderable>()
  private statusContainer: Renderable | null = null
  private shuttingDown = false
  private inStopMode = false
  private inRestartMode = false
  private inNewMode = false
  private refreshTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private manager: Manager,
    private config: AppConfig,
  ) {}

  async start(): Promise<void> {
    if (this.config.rooms.length === 0) {
      console.error('No rooms in config — add rooms to bigorec.json')
      process.exit(1)
    }

    // Create renderer — TUI appears immediately
    try {
      this.renderer = await createCliRenderer({
        exitOnCtrlC: false,
        targetFps: 10,
      })
    } catch (err) {
      console.error('Failed to initialize TUI:', err)
      process.exit(1)
    }

    // Build component tree
    const banner = Text({
      content: ` bigorec-tui v${VERSION}`,
      fg: 'cyan',
    })
    this.renderer.root.add(banner)

    const container = Box({
      flexDirection: 'column',
      borderStyle: 'rounded',
      title: 'Room Status',
      padding: 1,
      width: 50,
    })

    for (const room of this.config.rooms) {
      container.add(Text({ content: ` ${room.padEnd(24)} Idle` }))
    }

    container.add(
      Text({
        content: ' [q] quit [s] stop [r] restart [n] new',
        fg: 'gray',
      }),
    )

    this.renderer.root.add(container)

    // Extract renderables from mounted tree
    this.statusContainer = this.renderer.root.getChildren()[1] ?? null
    const children = this.statusContainer?.getChildren() ?? []

    for (let i = 0; i < this.config.rooms.length; i++) {
      const child = children[i]
      if (child) this.roomRenderables.set(this.config.rooms[i]!, child as any)
    }

    // Keyboard handling
    this.renderer.keyInput.on('keypress', (event: KeyEvent) => {
      const inAnyMode = this.inStopMode || this.inRestartMode || this.inNewMode

      if (event.name === 'q' || (event.ctrl && event.name === 'c')) {
        if (!inAnyMode) {
          this.shutdown().then(() => process.exit(0))
        }
      }

      if (event.name === 's' && !inAnyMode) {
        this.handleStopMode()
      }

      if (event.name === 'r' && !inAnyMode) {
        this.handleRestartMode()
      }

      if (event.name === 'n' && !inAnyMode) {
        this.handleNewMode()
      }
    })

    // Start render loop + refresh
    this.renderer.start()
    this.refreshStatus()
    this.refreshTimer = setInterval(() => this.refreshStatus(), REFRESH_MS)

    // Start downloads sequentially in background
    this.startRooms()

    // Keep process alive
    await new Promise(() => {})
  }

  private async startRooms(): Promise<void> {
    for (let i = 0; i < this.config.rooms.length; i++) {
      const room = this.config.rooms[i]!
      this.manager.startRoom(room)

      if (i < this.config.rooms.length - 1) {
        await new Promise((r) => setTimeout(r, STARTUP_DELAY))
      }
    }
  }

  private refreshStatus(): void {
    const statuses = this.manager.getStatuses()

    for (const [room, renderable] of this.roomRenderables) {
      const state = statuses.get(room)
      const status = state?.status ?? 'idle'
      const lastError = state?.lastError

      const color = lastError ? 'red' : (stateColors[status] ?? 'gray')

      let statusText: string
      if (lastError) {
        statusText = `error: ${lastError}`
      } else if (status === 'recording') {
        const start = state?.recordingStart
        const sec = start ? Math.floor((Date.now() - start) / 1000) : 0
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = sec % 60

        const timer =
          h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`

        statusText = `recording ${timer}`
      } else {
        statusText = status
      }

      renderable.content = ` ${room.padEnd(24)}${statusText}`
      renderable.fg = color
    }
  }

  private handleStopMode(): void {
    if (!this.renderer || this.inStopMode) return
    this.inStopMode = true

    // Hide status container
    this.statusContainer!.visible = false

    // Build stop mode UI
    const stopBox = Box({
      flexDirection: 'column',
      borderStyle: 'rounded',
      title: 'Stop Mode',
      padding: 1,
      width: 50,
    })

    const rooms = this.manager.getActiveRooms()

    if (rooms.length === 0) {
      stopBox.add(Text({ content: ' No active rooms.' }))
      stopBox.add(Text({ content: ' Press Enter to return...' }))
      stopBox.add(Input({ placeholder: '' }))

      this.renderer.root.add(stopBox)
      const stopRenderable = this.renderer.root.getChildren().at(-1)
      if (!stopRenderable) return

      const inputRenderable = stopRenderable.getChildren().at(-1) as InputRenderable
      inputRenderable.value = ''
      queueMicrotask(() => inputRenderable.focus())

      inputRenderable.on('enter', () => {
        this.renderer?.root.remove(stopRenderable as any)
        this.statusContainer!.visible = true
        this.inStopMode = false
      })
      return
    }

    rooms.forEach((r, i) => {
      stopBox.add(Text({ content: ` ${i + 1}. ${r}` }))
    })

    stopBox.add(Text({ content: '' }))
    stopBox.add(Text({ content: ' Enter number or siteId (blank to cancel):' }))
    stopBox.add(Input({ placeholder: '' }))

    this.renderer.root.add(stopBox)
    const stopRenderable = this.renderer.root.getChildren().at(-1)
    if (!stopRenderable) return

    const inputRenderable = stopRenderable.getChildren().at(-1) as InputRenderable
    inputRenderable.value = ''
    queueMicrotask(() => inputRenderable.focus())

    inputRenderable.on('enter', () => {
      const value = inputRenderable.value.trim()

      if (value) {
        const idx = Number.parseInt(value, 10)
        const target =
          !Number.isNaN(idx) && idx >= 1 && idx <= rooms.length ? rooms[idx - 1] : value

        if (target && rooms.includes(target)) {
          this.manager.stopRoom(target)
        }
      }

      this.renderer?.root.remove(stopRenderable as any)
      this.statusContainer!.visible = true
      this.inStopMode = false
    })
  }

  private handleRestartMode(): void {
    if (!this.renderer || this.inRestartMode) return
    this.inRestartMode = true

    // Hide status container
    this.statusContainer!.visible = false

    // Build restart mode UI
    const restartBox = Box({
      flexDirection: 'column',
      borderStyle: 'rounded',
      title: 'Restart Mode',
      padding: 1,
      width: 50,
    })

    const rooms = this.config.rooms

    if (rooms.length === 0) {
      restartBox.add(Text({ content: ' No configured rooms.' }))
      restartBox.add(Text({ content: ' Press Enter to return...' }))
      restartBox.add(Input({ placeholder: '' }))

      this.renderer.root.add(restartBox)
      const restartRenderable = this.renderer.root.getChildren().at(-1)
      if (!restartRenderable) return

      const inputRenderable = restartRenderable.getChildren().at(-1) as InputRenderable
      inputRenderable.value = ''
      queueMicrotask(() => inputRenderable.focus())

      inputRenderable.on('enter', () => {
        this.renderer?.root.remove(restartRenderable as any)
        this.statusContainer!.visible = true
        this.inRestartMode = false
      })
      return
    }

    rooms.forEach((r, i) => {
      restartBox.add(Text({ content: ` ${i + 1}. ${r}` }))
    })

    restartBox.add(Text({ content: '' }))
    restartBox.add(Text({ content: ' Enter number or siteId (blank to cancel):' }))
    restartBox.add(Input({ placeholder: '' }))

    this.renderer.root.add(restartBox)
    const restartRenderable = this.renderer.root.getChildren().at(-1)
    if (!restartRenderable) return

    const inputRenderable = restartRenderable.getChildren().at(-1) as InputRenderable
    inputRenderable.value = ''
    queueMicrotask(() => inputRenderable.focus())

    inputRenderable.on('enter', () => {
      const value = inputRenderable.value.trim()

      if (value) {
        const idx = Number.parseInt(value, 10)
        const target =
          !Number.isNaN(idx) && idx >= 1 && idx <= rooms.length ? rooms[idx - 1] : value

        if (target && rooms.includes(target)) {
          this.manager.restartRoom(target)
        }
      }

      this.renderer?.root.remove(restartRenderable as any)
      this.statusContainer!.visible = true
      this.inRestartMode = false
    })
  }

  private handleNewMode(): void {
    if (!this.renderer || this.inNewMode) return
    this.inNewMode = true

    // Hide status container
    this.statusContainer!.visible = false

    // Build new mode UI
    const newBox = Box({
      flexDirection: 'column',
      borderStyle: 'rounded',
      title: 'New Room',
      padding: 1,
      width: 50,
    })

    newBox.add(Text({ content: ' Enter Bigo siteId or URL:' }))
    newBox.add(Input({ placeholder: '' }))

    this.renderer.root.add(newBox)
    const newRenderable = this.renderer.root.getChildren().at(-1)
    if (!newRenderable) return

    const inputRenderable = newRenderable.getChildren().at(-1) as InputRenderable
    inputRenderable.value = ''
    queueMicrotask(() => inputRenderable.focus())

    inputRenderable.on('enter', () => {
      const value = inputRenderable.value.trim()

      if (value) {
        this.addNewRoom(value)
      }

      this.renderer?.root.remove(newRenderable as any)
      this.statusContainer!.visible = true
      this.inNewMode = false
    })
  }

  private addNewRoom(siteId: string): void {
    if (!this.statusContainer) return

    // Add text renderable for new room (insert before footer)
    const children = this.statusContainer.getChildren()
    const footerIndex = children.length - 1

    const newText = Text({ content: ` ${siteId.padEnd(24)} Idle` })
    this.statusContainer.add(newText, footerIndex)

    // Extract the actual renderable and add to map
    const updatedChildren = this.statusContainer.getChildren()
    const renderable = updatedChildren[footerIndex] as TextRenderable

    if (renderable) {
      this.roomRenderables.set(siteId, renderable)
    }

    // Start the recorder
    this.manager.startRoom(siteId)

    // Save updated config
    this.config.rooms.push(siteId)
    saveConfig(this.config)
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true

    if (this.refreshTimer) clearInterval(this.refreshTimer)
    this.renderer?.destroy()
    this.manager.stopAll()
  }
}
