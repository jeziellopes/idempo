import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { resourceFromAttributes } from '@opentelemetry/resources';

let sdk: NodeSDK | null = null;

export interface OtelOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP trace endpoint. Default: http://localhost:4318/v1/traces */
  otlpEndpoint?: string;
}

/**
 * Initialise OpenTelemetry. Must be called BEFORE any other imports.
 * Typically invoked at the top of main.ts before NestFactory.create().
 *
 * Jaeger v1.35+ accepts OTLP data natively — configure it to listen on
 * port 4317 (gRPC) or 4318 (HTTP). The OTLP exporter replaces the deprecated
 * @opentelemetry/exporter-jaeger SDK.
 */
export function initTelemetry(options: OtelOptions): void {
  const otlpEndpoint =
    options.otlpEndpoint ??
    process.env['OTLP_ENDPOINT'] ??
    'http://localhost:4318/v1/traces';

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
    instrumentations: [new HttpInstrumentation(), new NestInstrumentation()],
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
