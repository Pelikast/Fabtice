// `ProjectStorage` in memory, behind the same interface as IndexedDB. For
// tests: it round-trips documents through JSON like a real store, and can be
// told to fail (`failWith`) to exercise the « the piece will not be kept »
// paths. The app itself never falls back to it (that would pretend to keep
// what is lost at the next launch).

import { newChunkChannel, pcmFromChunks, type PcmAudio } from '../audio/pcm';
import type { ProjectDocument } from '../model/document';
import { readDocument } from './documentFormat';
import { StorageError, type ProjectStorage, type StorageErrorCode, type StorageEstimate, type StoredAudio } from './ProjectStorage';

export class MemoryStorage implements ProjectStorage {
  /** The stored document as JSON text, like a real store would hold it. */
  json: string | null = null;
  readonly audio = new Map<string, StoredAudio>();
  /** Separated tracks, copied (a real store keeps its own copy). */
  readonly tracks = new Map<string, PcmAudio>();
  /** When set, every call fails with this code. */
  failWith: StorageErrorCode | null = null;
  persistenceGranted = true;
  persistenceRequests = 0;
  /** Counts the document writes (`saveCurrent` and `replaceCurrent`). */
  writes = 0;

  private check(): void {
    if (this.failWith) throw new StorageError(this.failWith, `memory storage set to fail: ${this.failWith}`);
  }

  async isAvailable(): Promise<boolean> {
    return this.failWith !== 'unavailable';
  }

  async requestPersistence(): Promise<boolean> {
    this.persistenceRequests++;
    return this.persistenceGranted;
  }

  async estimate(): Promise<StorageEstimate> {
    return { usage: null, quota: null, persisted: this.persistenceGranted };
  }

  async loadCurrent(): Promise<ProjectDocument | null> {
    this.check();
    if (this.json === null) return null;
    return readDocument(JSON.parse(this.json));
  }

  async saveCurrent(doc: ProjectDocument): Promise<void> {
    this.check();
    this.writes++;
    this.json = JSON.stringify(doc);
  }

  async replaceCurrent(doc: ProjectDocument, audio: ReadonlyMap<string, StoredAudio>): Promise<void> {
    this.check();
    this.writes++;
    this.json = JSON.stringify(doc);
    this.audio.clear();
    this.tracks.clear();
    for (const [id, a] of audio) this.audio.set(id, a);
  }

  async saveAudio(audioId: string, audio: StoredAudio): Promise<void> {
    this.check();
    this.audio.set(audioId, audio);
  }

  async loadAudio(audioId: string): Promise<StoredAudio | null> {
    this.check();
    return this.audio.get(audioId) ?? null;
  }

  async clearCurrent(): Promise<void> {
    this.check();
    this.json = null;
    this.audio.clear();
    this.tracks.clear();
  }

  async saveTrackAudio(audioId: string, pcm: PcmAudio): Promise<void> {
    this.check();
    this.tracks.set(audioId, copyPcm(pcm));
  }

  async loadTrackAudio(audioId: string): Promise<PcmAudio | null> {
    this.check();
    const t = this.tracks.get(audioId);
    return t ? copyPcm(t) : null;
  }

  async deleteTrackAudio(audioIds: readonly string[]): Promise<void> {
    this.check();
    for (const id of audioIds) this.tracks.delete(id);
  }

  async pruneTrackAudio(keep: ReadonlySet<string>): Promise<void> {
    this.check();
    for (const id of [...this.tracks.keys()]) if (!keep.has(id)) this.tracks.delete(id);
  }

  async trackAudioUsage(): Promise<{ bytes: number; ids: string[] }> {
    this.check();
    let bytes = 0;
    for (const t of this.tracks.values()) bytes += t.bytes;
    return { bytes, ids: [...this.tracks.keys()] };
  }
}

function copyPcm(p: PcmAudio): PcmAudio {
  const chunks = p.chunks.map((c) => {
    const l = newChunkChannel();
    l.set(c.l);
    let r: Int16Array | null = null;
    if (c.r) {
      r = newChunkChannel();
      r.set(c.r);
    }
    return { l, r };
  });
  return pcmFromChunks(chunks, p.frames, p.sampleRate, p.channelCount);
}
