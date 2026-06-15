export type PipelineDebugTraceStatus = "ok" | "skip" | "fail";

export type PipelineDebugTraceStep = {
  step: string;
  status: PipelineDebugTraceStatus;
  ms: number;
  detail?: Record<string, unknown>;
  error?: string;
};

export type PipelineDebugTracePayload = {
  deploy: string;
  started_at: string;
  ended_at?: string;
  total_ms?: number;
  steps: PipelineDebugTraceStep[];
};

export class PipelineDebugTrace {
  private readonly deploy: string;
  private readonly startedAt: string;
  private readonly steps: PipelineDebugTraceStep[] = [];
  private lastMark = Date.now();

  constructor(deploy: string) {
    this.deploy = deploy;
    this.startedAt = new Date().toISOString();
  }

  log(
    step: string,
    status: PipelineDebugTraceStatus,
    detail?: Record<string, unknown>,
    error?: string
  ): void {
    const now = Date.now();
    const ms = now - this.lastMark;
    this.lastMark = now;
    const entry: PipelineDebugTraceStep = { step, status, ms };
    if (detail && Object.keys(detail).length > 0) entry.detail = detail;
    if (error) entry.error = error;
    this.steps.push(entry);
    const detailText = detail ? ` ${JSON.stringify(detail)}` : "";
    const errorText = error ? ` error=${error}` : "";
    console.log(`[${this.deploy}] ${step} ${status} +${ms}ms${detailText}${errorText}`);
  }

  fail(step: string, error: string, detail?: Record<string, unknown>): PipelineDebugTracePayload {
    this.log(step, "fail", detail, error);
    return this.finish();
  }

  finish(): PipelineDebugTracePayload {
    const endedAt = new Date().toISOString();
    return {
      deploy: this.deploy,
      started_at: this.startedAt,
      ended_at: endedAt,
      total_ms: Date.now() - Date.parse(this.startedAt),
      steps: this.steps,
    };
  }
}
