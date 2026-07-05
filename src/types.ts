// Ponytail: types are minimal, add as needed
export interface StreamInfo {
  siteId: string
  uid: string
  sid: string
  nickName: string
  roomTopic: string
  alive: boolean
  hlsSrc: string | null
  snapshot: string | null
  roomId: string
}

export interface DownloadOptions {
  /** Output file path (default: {siteId}_{timestamp}.ts) */
  output?: string
  /** Segment download concurrency (default: 4) */
  concurrency?: number
  /** Request timeout in ms (default: 30000) */
  timeout?: number
}

export interface RecordOptions extends DownloadOptions {
  /** Poll interval in seconds when waiting for stream to go live (default: 30) */
  pollInterval?: number
  /** Max recording duration in seconds (0 = unlimited) */
  maxDuration?: number
  /** Output directory (default: ./recordings) */
  outputDir?: string
  /** Auto-split recording every N seconds (0 = no split) */
  splitEvery?: number
}

export interface RecorderEvents {
  live: (info: StreamInfo) => void
  offline: () => void
  recording: (path: string) => void
  error: (err: Error) => void
  progress: (bytes: number) => void
}
