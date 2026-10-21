export type ProviderErrorKind = "retryable" | "permanent" | "unknown";

/**
 * The only error type that crosses the provider boundary. Workers branch on
 * `kind` only — never on courier response shapes. Messages must already be
 * safe to log (URLs/credentials redacted via redactUrl()/redactSecrets()).
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    if (options && options.cause !== undefined) this.cause = options.cause;
  }
}
