export const ENGINE_REPOSITORY: string;
export const ENGINE_COMMIT: string;
export const TOOL_DIRECTORY: string;

export interface BuildOptions {
  toolDirectory?: string;
  run?: (command: string, args: string[], options?: { capture?: boolean; allowFailure?: boolean }) => string | null;
}

export function buildBootstrap(options?: BuildOptions): string;
