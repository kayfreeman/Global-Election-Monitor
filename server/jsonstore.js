// Tiny JSON-file collection with atomic writes (crowd reports, polls).
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(file, seed = []) {
    this.file = file;
    if (fs.existsSync(file)) { try { this.items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.items = seed; } }
    else { this.items = seed; this.save(); }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.file);
  }
  add(item) { this.items.push(item); this.save(); return item; }
  find(id) { return this.items.find((x) => x.id === id); }
  remove(id) { const i = this.items.findIndex((x) => x.id === id); if (i < 0) return false; this.items.splice(i, 1); this.save(); return true; }
}
