import type { RequestConfig } from "./api-client-types";

export class ApiClient {
  private readonly baseUrl: string;

  constructor(url: string) {
    this.baseUrl = url;
  }

  async post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    const isAbsoluteUrl = url.startsWith("http://") || url.startsWith("https://");
    let fullUrl = isAbsoluteUrl ? url : `${this.baseUrl}${url}`;

    if (config?.params) {
      const searchParams = new URLSearchParams(config.params);
      fullUrl += `?${searchParams.toString()}`;
    }

    const contentType = config?.headers?.["Content-Type"];
    const isJson = !contentType || contentType === "application/json";

    const headers: Record<string, string> = {
      ...(isJson && { "Content-Type": "application/json" }),
      ...config?.headers,
    };

    let body: BodyInit | undefined;

    if (data !== undefined && data !== null) body = isJson ? JSON.stringify(data) : String(data);

    const response = await fetch(fullUrl, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);

    if (config?.responseType === "text") return (await response.text()) as T;

    return response.json() as Promise<T>;
  }
}
