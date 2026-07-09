export class BigorecError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BigorecError';
  }
}

export class ApiError extends BigorecError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
  }
}

export class UserNotFoundError extends BigorecError {
  readonly siteId: string;
  constructor(siteId: string) {
    super(`Unknown user: ${siteId}`);
    this.name = 'UserNotFoundError';
    this.siteId = siteId;
  }
}

export class StreamNotFoundError extends BigorecError {
  readonly siteId: string;
  constructor(siteId: string) {
    super(`Stream is not live (siteId: ${siteId})`);
    this.name = 'StreamNotFoundError';
    this.siteId = siteId;
  }
}

export class HlsError extends BigorecError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HlsError';
  }
}

export class TmuxError extends BigorecError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TmuxError';
  }
}

export class FfmpegError extends BigorecError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfmpegError';
  }
}
