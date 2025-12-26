/**
 * Dexie database for local device storage.
 *
 * Stores device profile info and other local-only data.
 */
import Dexie, { type Table } from 'dexie';

export interface DeviceProfile {
  id: 'device-profile'; // Single record with fixed ID
  profileId: string; // UUID from backend
  deviceId: string; // UUID for this device
  createdAt: Date;
}

export class FamiliarDB extends Dexie {
  deviceProfile!: Table<DeviceProfile>;

  constructor() {
    super('FamiliarDB');
    this.version(1).stores({
      // 'id' is the primary key
      deviceProfile: 'id',
    });
  }
}

export const db = new FamiliarDB();
