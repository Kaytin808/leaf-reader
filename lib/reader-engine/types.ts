export type EnginePositionSource =
  | 'open'
  | 'page-turn'
  | 'close'
  | 'viewport'
  | 'font-change';

export type TextQuoteAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
};

export type LayoutSignature = {
  viewportWidth: number;
  viewportHeight: number;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: string;
  flow: 'paginated' | 'scrolled';
};

export type EnginePosition = {
  schemaVersion: 1;
  bookId: string;
  cfi: string;
  spineHref: string;
  quote: TextQuoteAnchor;
  progression: number;
  revision: number;
  capturedAt: string;
  layoutSignature: LayoutSignature;
};

export type PositionCandidate = Omit<
  EnginePosition,
  'schemaVersion' | 'revision' | 'capturedAt'
>;

export type PositionDiagnosticType =
  | 'position.capture'
  | 'position.persist'
  | 'restore.attempt'
  | 'restore.verify'
  | 'restore.recover'
  | 'restore.commit'
  | 'restore.reject'
  | 'navigation.enqueue'
  | 'navigation.start'
  | 'navigation.complete'
  | 'navigation.fail';

export type PositionDiagnosticResult =
  | 'success'
  | 'mismatch'
  | 'recovered'
  | 'rejected'
  | 'queued'
  | 'started'
  | 'failed';

export type PositionDiagnosticEvent = {
  sequence: number;
  timestamp: string;
  type: PositionDiagnosticType;
  operationId: string;
  source: EnginePositionSource;
  revision: number;
  spineHrefHash: string;
  cfi: string;
  quote: {
    exactHash: string;
    prefixHash: string;
    suffixHash: string;
    exactLength: number;
  };
  layoutSignature: LayoutSignature;
  result: PositionDiagnosticResult;
  reason: string | null;
  durationMs: number;
  navigation?: {
    kind:
      | 'restore'
      | 'turn'
      | 'jump'
      | 'font-reflow'
      | 'viewport-reflow'
      | 'close';
    direction: -1 | 1 | null;
    sequence: number;
    queueDepthAtEnqueue: number;
    waitMs: number;
    operationDurationMs: number;
  };
};

export type PositionDiagnosticsLog = {
  schemaVersion: 1;
  sessionId: string;
  exportedAt: string;
  app: {
    version: string;
    engine: 'v2-position-navigation';
    featureFlagEnabled: true;
  };
  book: {
    bookIdHash: string;
    format: 'epub';
  };
  events: PositionDiagnosticEvent[];
};
