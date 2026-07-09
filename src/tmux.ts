import { execSync } from 'node:child_process';
import { TmuxError } from './errors.js';

function sessionName(siteId: string): string {
  return `bigorec-${siteId}`;
}

function hasSession(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

export function tmuxStart(siteId: string, command: string): void {
  const name = sessionName(siteId);
  if (hasSession(name)) {
    throw new TmuxError(`Session "${name}" already exists. Run "bigorec stop ${siteId}" first.`);
  }
  execSync(`tmux new-session -d -s ${name} "${command}"`);
}

export function tmuxStop(siteId?: string): void {
  if (siteId) {
    const name = sessionName(siteId);
    if (!hasSession(name)) {
      throw new TmuxError(`No session "${name}" found.`);
    }
    gracefulStop(name);
    return;
  }

  // Stop all bigorec-* sessions
  try {
    const output = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' });
    const sessions = output.split('\n').filter((s) => s.startsWith('bigorec-'));
    if (sessions.length === 0) {
      throw new TmuxError('No active bigorec sessions found.');
    }
    for (const s of sessions) {
      gracefulStop(s);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('No active')) throw err;
    // tmux not running or no sessions
  }
}

function gracefulStop(name: string): void {
  try {
    execSync(`tmux send-keys -t ${name} C-c`);
  } catch {
    // session might have already exited
  }

  // Wait up to 5 seconds for graceful shutdown
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!hasSession(name)) return;
    execSync('sleep 0.5');
  }

  // Force kill if still alive
  if (hasSession(name)) {
    execSync(`tmux kill-session -t ${name}`);
  }
}

export interface SessionInfo {
  siteId: string;
  session: string;
}

export function tmuxStatus(siteId?: string): SessionInfo[] {
  let output: string;
  try {
    output = execSync('tmux list-sessions -F "#{session_name}"', { encoding: 'utf-8' });
  } catch {
    return [];
  }

  const all = output
    .split('\n')
    .filter((s) => s.startsWith('bigorec-'))
    .map((s) => ({ siteId: s.slice('bigorec-'.length), session: s }));

  if (siteId) {
    return all.filter((s) => s.siteId === siteId);
  }

  return all;
}
