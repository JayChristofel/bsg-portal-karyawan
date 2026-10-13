/**
 * Shared control channel for the auto-resume background drain.
 *
 * The drain lives inside the WhatsApp send route module, which cannot be
 * imported by another route. Its cancel flag therefore has to live here so both
 * the drain and the admin API observe the same module instance.
 *
 * Scope: this is per-process. On a multi-instance deployment each instance has
 * its own flag, so "stop" only reaches the instance that is draining. The
 * persisted run row in `auto_resume_runs` remains the source of truth for
 * progress reporting.
 */

let cancelRequested = false;
let inFlight = false;

export function requestAutoResumeCancel(): void {
  cancelRequested = true;
}

export function isCancelRequested(): boolean {
  return cancelRequested;
}

export function clearAutoResumeCancel(): void {
  cancelRequested = false;
}

export function markAutoResumeStarted(): void {
  inFlight = true;
  cancelRequested = false;
}

export function markAutoResumeFinished(): void {
  inFlight = false;
}

export function isAutoResumeRunning(): boolean {
  return inFlight;
}