import type { SessionParams, SessionResponse } from "./ai-agent-types";
import { ApiClient } from "../api-client/api-client";

export class AiAgentService {
  private readonly apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  createSession = (params: SessionParams): Promise<SessionResponse> =>
    this.apiClient.post(
      "/api/ai-agent/session",
      {},
      {
        headers: {
          "X-AI-Provider-URL": params.aiProviderUrl,
          "X-AI-Provider-Key": params.aiProviderApiKey,
          "X-AI-Model": params.model,
          "X-AI-Voice": params.voice,
        },
        params: {
          configKey: params.configKey,
        },
      },
    );

  startSdp = (url: string, sdp: string | undefined, token: string) => {
    if (!url || !sdp || !token) return;

    return this.apiClient.post<string>(url, sdp, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/sdp",
      },
      responseType: "text",
    });
  };

  // Generic tool executor
  executeTool = async (toolName: string, args: any) => {
    const endpoint = toolEndpoints[toolName];

    if (!endpoint) console.error(`Unknown tool: ${toolName}`);

    return this.apiClient.post(endpoint, args);
  };
}

const toolEndpoints: Record<string, string> = {
  create_order: "/api/ai-agent/tool/create-order",
  add_items_to_order: "/api/ai-agent/tool/add-items",
  pay_bill: "/api/ai-agent/tool/pay-bill",
};
