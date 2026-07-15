import type { ApiFailure, ApiSuccess } from '../../shared/contracts/api';
import { API_ERROR_CODES, type ApiErrorCode } from '../../shared/contracts/errors';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function isFailure(value: unknown): value is ApiFailure {
  if (!value || typeof value !== 'object') return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && API_ERROR_CODES.includes(code as ApiErrorCode);
}

function isSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'data');
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const payload = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    if (isFailure(payload)) {
      const message = typeof payload.error.details?.message === 'string'
        ? payload.error.details.message
        : payload.error.code;
      throw new ApiClientError(message, response.status, payload.error.code, payload.error.requestId);
    }
    throw new ApiClientError(response.statusText || 'Request failed', response.status, 'INTERNAL_ERROR');
  }

  if (!isSuccess<T>(payload)) {
    throw new ApiClientError('Invalid API response', 500, 'INTERNAL_ERROR');
  }
  return payload.data;
}
