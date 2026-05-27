declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export interface Event<T> {
    event: string;
    id: number;
    payload: T;
  }

  export type UnlistenFn = () => void;
  export type EventCallback<T> = (event: Event<T>) => void;

  export function listen<T>(
    event: string,
    handler: EventCallback<T>,
    options?: Record<string, unknown>
  ): Promise<UnlistenFn>;
}
