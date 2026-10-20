export interface SnippetVariable {
  readonly token: string; // e.g. "{{prompt:Port=8080}}"
  readonly key: string; // e.g. "prompt:Port=8080"
  readonly label: string; // e.g. "Port"
  readonly defaultValue: string;
  readonly type: "host" | "prompt" | "custom";
}

export interface HostContext {
  readonly hostname?: string | null;
  readonly username?: string | null;
  readonly port?: number | null;
  readonly label?: string | null;
}

/**
 * Extracts and categorizes all unique {{variable}} placeholders in a script.
 */
export function parseSnippetVariables(script: string): SnippetVariable[] {
  const matches = script.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];

  const uniqueTokens = Array.from(new Set(matches));

  return uniqueTokens.map((token) => {
    // Strip {{ and }}
    const inner = token.slice(2, -2).trim();

    // Check for host tokens
    const lower = inner.toLowerCase();
    if (
      lower.startsWith("host.") ||
      lower === "hostname" ||
      lower === "username" ||
      lower === "port" ||
      lower === "label"
    ) {
      return {
        token,
        key: inner,
        label: inner,
        defaultValue: "",
        type: "host",
      };
    }

    // Check for prompt tokens: e.g. prompt:Port=8080 or prompt:Branch
    if (inner.startsWith("prompt:")) {
      const rest = inner.slice("prompt:".length).trim();
      const eqIndex = rest.indexOf("=");
      if (eqIndex !== -1) {
        const label = rest.slice(0, eqIndex).trim();
        const defaultValue = rest.slice(eqIndex + 1).trim();
        return {
          token,
          key: inner,
          label: label || "Parameter",
          defaultValue,
          type: "prompt",
        };
      }
      return {
        token,
        key: inner,
        label: rest || "Parameter",
        defaultValue: "",
        type: "prompt",
      };
    }

    // Custom variable with optional default: e.g. {{branch=main}}
    const eqIndex = inner.indexOf("=");
    if (eqIndex !== -1) {
      const label = inner.slice(0, eqIndex).trim();
      const defaultValue = inner.slice(eqIndex + 1).trim();
      return {
        token,
        key: inner,
        label,
        defaultValue,
        type: "custom",
      };
    }

    return {
      token,
      key: inner,
      label: inner,
      defaultValue: "",
      type: "custom",
    };
  });
}

/**
 * Resolves standard host context variables in the script if host information is provided.
 */
export function resolveHostVariables(
  script: string,
  host?: HostContext | null
): { resolvedScript: string; remainingVariables: SnippetVariable[] } {
  let resolvedScript = script;

  if (host) {
    if (host.hostname) {
      resolvedScript = resolvedScript
        .replace(/\{\{host\.hostname\}\}/gi, host.hostname)
        .replace(/\{\{host\.ip\}\}/gi, host.hostname)
        .replace(/\{\{hostname\}\}/gi, host.hostname);
    }
    if (host.username) {
      resolvedScript = resolvedScript
        .replace(/\{\{host\.username\}\}/gi, host.username)
        .replace(/\{\{username\}\}/gi, host.username)
        .replace(/\{\{user\}\}/gi, host.username);
    }
    if (host.port !== undefined) {
      const portStr = String(host.port);
      resolvedScript = resolvedScript
        .replace(/\{\{host\.port\}\}/gi, portStr)
        .replace(/\{\{port\}\}/gi, portStr);
    }
    if (host.label) {
      resolvedScript = resolvedScript
        .replace(/\{\{host\.label\}\}/gi, host.label)
        .replace(/\{\{label\}\}/gi, host.label);
    }
  }

  const remainingVariables = parseSnippetVariables(resolvedScript);
  return { resolvedScript, remainingVariables };
}

/**
 * Replaces each variable token with its user-provided value.
 */
export function interpolateScript(
  script: string,
  values: Record<string, string>
): string {
  let result = script;
  for (const [token, value] of Object.entries(values)) {
    // If token includes {{ }}, replace directly; otherwise match both exact and wrapped
    if (token.startsWith("{{") && token.endsWith("}}")) {
      result = result.split(token).join(value);
    } else {
      result = result.split(`{{${token}}}`).join(value);
    }
  }
  return result;
}
