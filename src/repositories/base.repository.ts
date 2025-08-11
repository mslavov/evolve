import { Database } from '../db/client.js';

/**
 * Base repository class with common database operations
 */
export abstract class BaseRepository {
  constructor(protected readonly db: Database) {}
  
  /**
   * Execute a transaction
   */
  protected async transaction<T>(
    callback: (tx: any) => Promise<T>
  ): Promise<T> {
    return await this.db.transaction(async (tx) => {
      return await callback(tx);
    });
  }
}