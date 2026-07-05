import { EventEmitter } from 'node:events';

interface StreamInfo {
    siteId: string;
    uid: string;
    sid: string;
    nickName: string;
    roomTopic: string;
    alive: boolean;
    hlsSrc: string | null;
    snapshot: string | null;
    roomId: string;
}
interface DownloadOptions {
    /** Output file path (default: {siteId}_{timestamp}.ts) */
    output?: string;
    /** Segment download concurrency (default: 4) */
    concurrency?: number;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
}
interface RecordOptions extends DownloadOptions {
    /** Poll interval in seconds when waiting for stream to go live (default: 30) */
    pollInterval?: number;
    /** Max recording duration in seconds (0 = unlimited) */
    maxDuration?: number;
    /** Output directory (default: ./recordings) */
    outputDir?: string;
    /** Auto-split recording every N seconds (0 = no split) */
    splitEvery?: number;
}

/** Extract siteId from a Bigo URL or raw ID */
declare function parseSiteId(input: string): string;
/** Fetch stream info for a siteId */
declare function getStreamInfo(siteId: string): Promise<StreamInfo>;
/** Check if a room is currently live */
declare function isLive(siteId: string): Promise<boolean>;

/** Download an HLS stream and save to file */
declare function downloadHls(m3u8Url: string, options?: DownloadOptions): Promise<string>;
/** Download a live HLS stream (continuously fetches new segments) */
declare function downloadLiveHls(m3u8Url: string, outputPath: string, options?: {
    concurrency?: number;
    timeout?: number;
    onSegment?: (count: number) => void;
    signal?: AbortSignal;
}): Promise<void>;

declare class Recorder extends EventEmitter {
    private siteId;
    private options;
    private abortController;
    private stopController;
    private polling;
    constructor(input: string, options?: RecordOptions);
    /** Start watching and auto-record when live */
    start(): Promise<void>;
    /** Stop watching */
    stop(): void;
    private record;
}
/** Convenience: one-shot record of current live stream */
declare function recordOnce(input: string, options?: RecordOptions): Promise<string>;

export { type DownloadOptions, type RecordOptions, Recorder, type StreamInfo, downloadHls, downloadLiveHls, getStreamInfo, isLive, parseSiteId, recordOnce };
