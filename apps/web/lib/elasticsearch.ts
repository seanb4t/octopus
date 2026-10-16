import { Client } from "@elastic/elasticsearch";

// The sync-log store is optional. Without a URL every write is a no-op and
// every read is empty, with no log line, so an install with no Elasticsearch
// does not report a failure on each index run.
const ES_ENABLED = Boolean(process.env.ELASTICSEARCH_URL);

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    const url = process.env.ELASTICSEARCH_URL!;
    const node = url.startsWith("http") ? url : `http://${url}`;
    client = new Client({
      node,
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME!,
        password: process.env.ELASTICSEARCH_PASSWORD!,
      },
      tls: { rejectUnauthorized: false },
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
    });
  }
  return client;
}

function getIndexName(name: string): string {
  const prefix = process.env.ELASTICSEARCH_INDEX_PREFIX ?? "octopus";
  return `${prefix}_${name}`;
}

const REPO_SYNC_INDEX = "repo_sync";

export interface SyncLogEntry {
  orgId: string;
  repoId: string;
  message: string;
  level: "info" | "success" | "error" | "warning";
  timestamp: number;
}

export async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  if (!ES_ENABLED) return;
  try {
    const es = getClient();
    const index = getIndexName(REPO_SYNC_INDEX);

    await es.index({
      index,
      body: {
        ...entry,
        createdAt: new Date(entry.timestamp).toISOString(),
      },
    });
  } catch (err) {
    console.error("Failed to write sync log to ES:", err);
  }
}

export async function getSyncLogs(
  orgId: string,
  repoId: string,
  limit = 500,
): Promise<SyncLogEntry[]> {
  if (!ES_ENABLED) return [];
  try {
    const es = getClient();
    const index = getIndexName(REPO_SYNC_INDEX);

    const exists = await es.indices.exists({ index });
    if (!exists) return [];

    const result = await es.search<SyncLogEntry>({
      index,
      size: limit,
      query: {
        bool: {
          filter: [
            { term: { orgId } },
            { term: { repoId } },
          ],
        },
      },
      sort: [{ timestamp: { order: "asc" } }],
    });

    return result.hits.hits.map((hit) => hit._source!);
  } catch (err) {
    console.error("Failed to read sync logs from ES:", err);
    return [];
  }
}

export async function deleteSyncLogs(
  orgId: string,
  repoId: string,
): Promise<void> {
  if (!ES_ENABLED) return;
  try {
    const es = getClient();
    const index = getIndexName(REPO_SYNC_INDEX);

    const exists = await es.indices.exists({ index });
    if (!exists) return;

    await es.deleteByQuery({
      index,
      query: {
        bool: {
          filter: [
            { term: { orgId } },
            { term: { repoId } },
          ],
        },
      },
    });
  } catch (err) {
    console.error("Failed to delete sync logs from ES:", err);
  }
}
