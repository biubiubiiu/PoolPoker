/**
 * Unified Game Transport Interface
 *
 * Defines the contract for all client communication channels (Online Socket.IO and Offline BLE).
 * Decouples upper-level composables and UI components from concrete network implementations,
 * eliminating the need for unsafe type casts (e.g. `ble as any as Socket`).
 */

export type TransportEventCallback = (...args: any[]) => void;

export interface GameTransport {
  /** Connection status of the transport channel */
  readonly connected: boolean;
  /** Unique connection identifier (e.g. socket.id or ble_{userId}) */
  readonly id?: string;
  /** Establish or resume connection */
  connect(): this;
  /** Disconnect current connection */
  disconnect(): this;
  /** Register event listener */
  on(event: string, callback: TransportEventCallback): this;
  /** Register one-time event listener */
  once?(event: string, callback: TransportEventCallback): this;
  /** Remove event listener */
  off(event: string, callback?: TransportEventCallback): this;
  /** Emit event with optional payload and callback */
  emit(event: string, ...args: any[]): any;
  /** Timeout configuration returning chainable transport */
  timeout(ms: number): this;
}
