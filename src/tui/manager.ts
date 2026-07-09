import { parseSiteId } from '../api.js';
import { Recorder } from '../recorder.js';

export type AppStatus = 'idle' | 'polling' | 'recording' | 'error';

export interface RoomState {
  status: AppStatus;
  lastError?: string;
  recordingStart?: number;
}

export interface ManagerConfig {
  outputDir: string;
  /** Polling interval in minutes */
  interval: number;
}

export class Manager {
  private recorders = new Map<string, Recorder>();
  private states = new Map<string, RoomState>();

  constructor(private config: ManagerConfig) {}

  /** Start monitoring a room. Fire-and-forget — errors tracked in state. */
  startRoom(siteId: string): void {
    const id = parseSiteId(siteId);

    if (this.recorders.has(id)) {
      return;
    }

    this.states.set(id, { status: 'idle' });

    const recorder = new Recorder(id, {
      outputDir: this.config.outputDir,
      pollInterval: this.config.interval * 60, // minutes → seconds
    });

    // Track state from Recorder events
    recorder.on('live', () => {
      this.setState(id, { status: 'polling' });
    });

    recorder.on('offline', () => {
      this.setState(id, { status: 'polling' });
    });

    recorder.on('recording', () => {
      this.setState(id, { status: 'recording', recordingStart: Date.now() });
    });

    recorder.on('error', (err: Error) => {
      this.setState(id, { status: 'error', lastError: err.message.slice(0, 30) });
    });

    this.recorders.set(id, recorder);

    // Fire-and-forget: start() blocks in poll loop
    recorder.start().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState(id, { status: 'error', lastError: msg.slice(0, 30) });
      this.recorders.delete(id);
    });
  }

  /** Stop a room's recorder */
  stopRoom(siteId: string): void {
    const id = parseSiteId(siteId);
    const recorder = this.recorders.get(id);
    if (!recorder) return;

    recorder.stop();
    this.recorders.delete(id);
    this.states.delete(id);
  }

  /** Restart a room: stop then start */
  restartRoom(siteId: string): void {
    const id = parseSiteId(siteId);
    this.stopRoom(id);
    this.startRoom(id);
  }

  /** Stop all recorders */
  stopAll(): void {
    for (const id of this.recorders.keys()) {
      this.stopRoom(id);
    }
  }

  /** Get status snapshot for all rooms */
  getStatuses(): Map<string, RoomState> {
    return new Map(this.states);
  }

  /** Get all active room IDs */
  getActiveRooms(): string[] {
    return [...this.recorders.keys()];
  }

  private setState(siteId: string, state: Partial<RoomState>): void {
    const prev = this.states.get(siteId) ?? { status: 'idle' as AppStatus };
    this.states.set(siteId, { ...prev, ...state });
  }
}
