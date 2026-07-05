# bigorec

Download and record [Bigo Live](https://www.bigo.tv) streams.

## Install

```bash
npm install -g bigorec
```

Or use nub:

```bash
nub add -g bigorec
```

## Usage

### CLI

```bash
# Check room status
bigorec info 1106771413

# Download current live stream
bigorec download 1106771413 -o stream.ts

# Auto-record (polls every 3 min when offline, records when live)
bigorec record 1106771413

# Record with options
bigorec record 1106771413 -d ./recordings -p 15 -m 3600
```

You can also pass a full URL:

```bash
bigorec info https://www.bigo.tv/1106771413
```

### Library

```ts
import { getStreamInfo, isLive, downloadHls, Recorder } from 'bigorec'

// Get stream info
const info = await getStreamInfo('1106771413')
console.log(info.nickName, info.alive, info.hlsSrc)

// Download current live stream
await downloadHls(info.hlsSrc, { output: 'stream.ts' })

// Auto-record ( EventEmitter-based )
const recorder = new Recorder('1106771413', { pollInterval: 15 })
recorder.on('live', (info) => console.log(`Recording ${info.nickName}...`))
recorder.on('recording', (path) => console.log(`Saved to ${path}`))
await recorder.start()

// One-shot record
const path = await recordOnce('1106771413')
```

## How It Works

1. Calls Bigo's internal API to extract the HLS stream URL
2. Parses the m3u8 playlist and downloads segments with concurrent HTTP requests
3. Merges segments into a single `.ts` file

No ffmpeg required — pure HTTP download.

## API

### `getStreamInfo(siteId: string): Promise<StreamInfo>`

Fetch stream metadata. Throws if room not found.

### `isLive(siteId: string): Promise<boolean>`

Check if a room is currently live.

### `downloadHls(m3u8Url: string, options?: DownloadOptions): Promise<string>`

Download an HLS stream and save to file. Returns output path.

### `Recorder`

EventEmitter that polls a room and auto-records when live.

| Event | Payload | Description |
|-------|---------|-------------|
| `live` | `StreamInfo` | Stream started |
| `offline` | — | Stream ended |
| `recording` | `string` (path) | Recording started |
| `progress` | `number` (segments) | Segment downloaded |
| `error` | `Error` | Something went wrong |

### `recordOnce(siteId: string, options?: RecordOptions): Promise<string>`

Download the current live stream in one call. Throws if offline.

## Output Format

Files are saved as `{siteId}=YYYYMMDD_HHMMSS.ts` (e.g., `1106771413=20260705_115200.ts`).

## Limitations

- Single quality tier per stream (Bigo's API limitation)
- No VOD/recording support — live streams only
- 1080p HEVC streams require a computed token not yet reverse-engineered
- Some streams may not return `hls_src` even when live (Bigo server-side issue)

## License

MIT
