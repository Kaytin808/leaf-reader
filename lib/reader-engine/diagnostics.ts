import { version } from '@/package.json';
import type {
  EnginePosition,
  EnginePositionSource,
  PositionDiagnosticResult,
  PositionDiagnosticType,
  PositionDiagnosticsLog,
} from './types';

const LATEST_LOG_KEY = 'leaf-reader-engine-v2-latest-diagnostics';

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

type RecordEvent = {
  type: PositionDiagnosticType;
  operationId: string;
  source: EnginePositionSource;
  position: EnginePosition;
  result: PositionDiagnosticResult;
  reason?: string;
  startedAt?: number;
};

export class PositionDiagnostics {
  private sequence = 0;
  private readonly log: PositionDiagnosticsLog;

  private constructor(bookIdHash: string) {
    this.log = {
      schemaVersion: 1,
      sessionId: crypto.randomUUID(),
      exportedAt: new Date().toISOString(),
      app: {
        version: `${version}-engine-beta.1`,
        engine: 'v2-position',
        featureFlagEnabled: true,
      },
      book: { bookIdHash, format: 'epub' },
      events: [],
    };
  }

  static async create(bookId: string) {
    return new PositionDiagnostics(await sha256(bookId));
  }

  async record(event: RecordEvent) {
    const { position } = event;
    this.log.events.push({
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      type: event.type,
      operationId: event.operationId,
      source: event.source,
      revision: position.revision,
      spineHrefHash: await sha256(position.spineHref),
      cfi: position.cfi,
      quote: {
        exactHash: await sha256(position.quote.exact),
        prefixHash: await sha256(position.quote.prefix),
        suffixHash: await sha256(position.quote.suffix),
        exactLength: position.quote.exact.length,
      },
      layoutSignature: structuredClone(position.layoutSignature),
      result: event.result,
      reason: event.reason ?? null,
      durationMs: Math.max(
        0,
        Math.round(performance.now() - (event.startedAt ?? performance.now())),
      ),
    });
    this.persist();
  }

  export() {
    this.log.exportedAt = new Date().toISOString();
    this.persist();
    return structuredClone(this.log);
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LATEST_LOG_KEY, JSON.stringify(this.log));
  }
}

export function latestPositionDiagnostics() {
  if (typeof localStorage === 'undefined') return undefined;
  const value = localStorage.getItem(LATEST_LOG_KEY);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as PositionDiagnosticsLog;
  } catch {
    return undefined;
  }
}

export function diagnosticsBlob() {
  const log = latestPositionDiagnostics();
  if (!log) return undefined;
  return new Blob(
    [JSON.stringify({ ...log, exportedAt: new Date().toISOString() }, null, 2)],
    {
      type: 'application/json',
    },
  );
}
