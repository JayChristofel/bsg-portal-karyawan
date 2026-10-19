import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type NetError = Error & { cause?: { code?: string; message?: string } };

/** Narrows a caught value to something with message/cause so `catch (e: unknown)` stays typed. */
export function asNetError(e: unknown): NetError {
  return e instanceof Error ? (e as NetError) : (new Error(String(e)) as NetError);
}
