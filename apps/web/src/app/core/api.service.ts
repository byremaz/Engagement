/** Typed REST client for /v1 (kebab-case, plural nouns). */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { HostAction, HostActionPayload, ParticipantHostView, SessionSnapshot, SessionState, SignalMode } from '@asas/shared';

export interface PublicSession {
  id: string; joinCode: string; title: string; state: SessionState; joinOpen: boolean; paused: boolean; createdAt: string;
}
export interface HostSession extends PublicSession {
  capacity: number; gameIndex: number; roundIndex: number; ceremonyStep: number; signalMode: SignalMode;
  contentFrozen: boolean; eventStartedAt: string | null; closedAt: string | null;
}
export interface JoinResponse {
  participant: { id: string; number: number; name: string; avatar: string; displayName: string };
  recoveryCode: string;
  token: string;
}
export interface RestoreResponse {
  participant: { id: string; number: number; name: string; avatar: string; displayName: string };
  token: string;
  controllerTransferred: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  // ---- participant (public) ----
  preview(code: string) {
    return firstValueFrom(this.http.get<{ session: PublicSession; participantCount: number }>(`/v1/join/${encodeURIComponent(code)}`));
  }
  join(code: string, name: string) {
    return firstValueFrom(this.http.post<JoinResponse>(`/v1/join/${encodeURIComponent(code)}/participants`, { name }));
  }
  restore(code: string, recoveryCode: string) {
    return firstValueFrom(this.http.post<RestoreResponse>(`/v1/join/${encodeURIComponent(code)}/restorations`, { recoveryCode }));
  }

  // ---- host ----
  createSession(title: string, capacity: number) {
    return firstValueFrom(this.http.post<HostSession>('/v1/sessions', { title, capacity }));
  }
  listSessions() {
    return firstValueFrom(this.http.get<{ items: HostSession[]; nextCursor: string | null }>('/v1/sessions'));
  }
  getSession(id: string) {
    return firstValueFrom(this.http.get<HostSession>(`/v1/sessions/${id}`));
  }
  roster(id: string) {
    return firstValueFrom(this.http.get<ParticipantHostView[]>(`/v1/sessions/${id}/participants`));
  }
  rename(id: string, participantId: string, name: string) {
    return firstValueFrom(this.http.patch<void>(`/v1/sessions/${id}/participants/${participantId}`, { name }));
  }
  remove(id: string, participantId: string) {
    return firstValueFrom(this.http.delete<void>(`/v1/sessions/${id}/participants/${participantId}`));
  }
  setJoinOpen(id: string, open: boolean) {
    return firstValueFrom(this.http.patch<HostSession>(`/v1/sessions/${id}/join-open`, { open }));
  }
  setSignalMode(id: string, mode: SignalMode) {
    return firstValueFrom(this.http.patch<HostSession>(`/v1/sessions/${id}/signal-mode`, { mode }));
  }
  displayToken(id: string) {
    return firstValueFrom(this.http.post<{ token: string }>(`/v1/sessions/${id}/display-tokens`, {}));
  }
  snapshot(id: string) {
    return firstValueFrom(this.http.get<SessionSnapshot>(`/v1/sessions/${id}/snapshot`));
  }
  act(id: string, action: HostAction, payload: HostActionPayload = {}) {
    return firstValueFrom(this.http.post<SessionSnapshot>(`/v1/sessions/${id}/actions`, { action, ...payload }));
  }
  closeSession(id: string) {
    return firstValueFrom(this.http.post<HostSession>(`/v1/sessions/${id}/close`, {}));
  }
  // ---- rehearsal mode: simulated participants (§16 deliverable 4) ----
  addSimulated(id: string, count: number) {
    return firstValueFrom(this.http.post<{ added: number; simulated: number }>(`/v1/sessions/${id}/simulated-participants`, { count }));
  }
  removeSimulated(id: string) {
    return firstValueFrom(this.http.delete<{ removed: number }>(`/v1/sessions/${id}/simulated-participants`));
  }
  exportUrl(id: string, kind: 'standings' | 'rounds', scope: 'public' | 'private' = 'public') {
    return `/v1/sessions/${id}/exports/${kind}.csv${kind === 'standings' ? `?scope=${scope}` : ''}`;
  }
  /** Fetch a CSV with the host header and trigger a download. */
  async download(id: string, kind: 'standings' | 'rounds', scope: 'public' | 'private' = 'public') {
    const blob = await firstValueFrom(this.http.get(this.exportUrl(id, kind, scope), { responseType: 'blob' }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `asas-challenge-${kind}${kind === 'standings' ? `-${scope}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
