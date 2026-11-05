import { HttpErrorResponse } from '@angular/common/http';
import { Collection } from '../services/api.service';

export function collectionItems<T>(response: Collection<T>): T[] {
  return Array.isArray(response) ? response : response.results ?? [];
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'The server could not be reached. Please check your connection and try again.';
  const message = extractMessage(error.error);
  return message || fallback;
}

function extractMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractMessage).filter(Boolean).join(' ');
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).map(extractMessage).filter(Boolean).join(' ');
  }
  return '';
}
