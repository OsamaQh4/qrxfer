import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { BenchmarkSummary } from './types'

interface HistoryRecord extends BenchmarkSummary {
  id?: number
  savedAt: number
}

interface QrxferDB extends DBSchema {
  runs: {
    key: number
    value: HistoryRecord
    indexes: { savedAt: number }
  }
}

let dbPromise: Promise<IDBPDatabase<QrxferDB>> | null = null

function getDb(): Promise<IDBPDatabase<QrxferDB>> {
  dbPromise ??= openDB<QrxferDB>('qrxfer-benchmarks', 1, {
    upgrade(db) {
      const store = db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true })
      store.createIndex('savedAt', 'savedAt')
    },
  })
  return dbPromise
}

export async function saveRun(summary: BenchmarkSummary): Promise<number> {
  const db = await getDb()
  return db.add('runs', { ...summary, savedAt: Date.now() })
}

export async function listRuns(): Promise<HistoryRecord[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('runs', 'savedAt')
  return all.reverse()
}

export async function deleteRun(id: number): Promise<void> {
  const db = await getDb()
  await db.delete('runs', id)
}

export async function clearRuns(): Promise<void> {
  const db = await getDb()
  await db.clear('runs')
}
