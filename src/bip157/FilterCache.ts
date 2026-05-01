import { Level } from 'level';

export class FilterCache {
  private db: Level<string, string>;

  constructor(path: string) {
    this.db = new Level<string, string>(path, { valueEncoding: 'utf8' });
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async get(blockHash: string): Promise<string | null> {
    try {
      return await this.db.get(`cfh:${blockHash}`);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'LEVEL_NOT_FOUND') return null;
      throw err;
    }
  }

  async put(blockHash: string, cfheader: string): Promise<void> {
    await this.db.put(`cfh:${blockHash}`, cfheader);
  }

  async has(blockHash: string): Promise<boolean> {
    return (await this.get(blockHash)) !== null;
  }
}
