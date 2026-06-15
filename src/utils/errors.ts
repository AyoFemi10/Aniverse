export type ErrorCode =
  | 'ANIME_NOT_FOUND'
  | 'EPISODE_NOT_FOUND'
  | 'STREAM_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'SCRAPER_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class NotFoundError extends ApiError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 404);
  }
}

export class ScraperError extends ApiError {
  constructor(message: string) {
    super('SCRAPER_ERROR', message, 502);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super('INVALID_PARAMS', message, 400);
  }
}
