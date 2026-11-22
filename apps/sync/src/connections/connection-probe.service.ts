import { Injectable } from '@nestjs/common';
import { ConnectionTargetPolicyService } from './connection-target-policy.service';

type ProbeError =
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'redirect_not_allowed'
  | 'response_too_large';

export type ConnectionProbeResult = {
  ok: boolean;
  status_code: number | null;
  error: ProbeError | null;
};

@Injectable()
export class ConnectionProbeService {
  constructor(private readonly targets: ConnectionTargetPolicyService) {}

  async probe(address: string, token?: string): Promise<ConnectionProbeResult> {
    const url = this.targets.assertAllowed(address);
    const signal = AbortSignal.timeout(3000);
    let statusCode: number | null = null;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers:
          token === undefined ? {} : { Authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal,
      });

      statusCode = response.status;

      if (statusCode >= 300 && statusCode < 400) {
        await response.body?.cancel();
        return this.result(statusCode, 'redirect_not_allowed');
      }

      if (response.body) {
        const reader = response.body.getReader();
        let bytes = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytes += value.byteLength;

            if (bytes > 64 * 1024) {
              await reader.cancel();
              return this.result(statusCode, 'response_too_large');
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      return this.result(statusCode, response.ok ? null : 'http_error');
    } catch {
      return this.result(
        statusCode,
        signal.aborted ? 'timeout' : 'network_error',
      );
    }
  }

  private result(
    statusCode: number | null,
    error: ProbeError | null,
  ): ConnectionProbeResult {
    return {
      ok: error === null,
      status_code: statusCode,
      error,
    };
  }
}
