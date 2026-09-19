/**
 * Tiny in-process event bus between the RoundsService and the WebSocket
 * gateway, so the service stays free of socket.io concerns.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { SessionSnapshot } from '@asas/shared';

export interface RoundsEvents {
  snapshot: (sessionId: string, snapshot: SessionSnapshot) => void;
  /** Personal state push for one participant (e.g. elimination, lock ack). */
  personal: (participantId: string, payload: Record<string, unknown>) => void;
  /** Race elimination burst for death animation + sound on phones/display (§6.4). */
  eliminated: (sessionId: string, participantIds: string[], eventId: number) => void;
  signal: (sessionId: string, color: 'RED' | 'GREEN', eventId: number, effectiveAt: number) => void;
}

@Injectable()
export class RoundsEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof RoundsEvents>(event: K, listener: RoundsEvents[K]): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof RoundsEvents>(event: K, ...args: Parameters<RoundsEvents[K]>): void {
    this.emitter.emit(event, ...args);
  }
}
