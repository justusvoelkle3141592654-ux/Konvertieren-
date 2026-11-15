// Pool von Chunk-Workern auf dem Hauptthread: verteilt Anfragen und liefert Ergebnisse als Promise.
export class ChunkWorkerPool {
  constructor(size) {
    this.size = Math.max(1, size);
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(new URL('../workers/chunk-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => this.handleMessage(event.data);
      worker.onerror = (event) => this.handleFailure(worker, event);
      this.workers.push({ worker, load: 0 });
    }
  }

  /** Startet eine Chunk-Erzeugung. Resolve mit den Chunk-Daten. */
  request(params) {
    const id = this.nextId++;
    // Den am wenigsten beschäftigten Worker wählen
    const slot = this.workers.reduce((best, w) => (w.load < best.load ? w : best), this.workers[0]);
    slot.load++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, slot });
      slot.worker.postMessage({ type: 'gen', id, ...params });
    });
  }

  handleMessage(msg) {
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    entry.slot.load--;
    if (msg.type === 'error') entry.reject(new Error(msg.message));
    else entry.resolve(msg);
  }

  handleFailure(worker, event) {
    const message = event?.message || 'Worker-Fehler';
    for (const [id, entry] of this.pending) {
      if (entry.slot.worker === worker) {
        this.pending.delete(id);
        entry.slot.load--;
        entry.reject(new Error(message));
      }
    }
  }

  get busy() {
    return this.pending.size;
  }

  dispose() {
    for (const { worker } of this.workers) worker.terminate();
    this.workers = [];
    for (const entry of this.pending.values()) entry.reject(new Error('Worker beendet'));
    this.pending.clear();
  }
}
