import type { SessionParams, SessionResponse } from "./ai-agent-types";
import { apiClient } from "../api-client";

class AiAgentService {
  createSession = (params: SessionParams): Promise<SessionResponse> =>
    apiClient.post(
      "/api/ai-agent/session",
      {},
      {
        params: {
          configKey: params.configKey,
        },
      },
    );

  startSdp = (sdp: string, token: string) =>
    apiClient.post<string>("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", sdp, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/sdp",
      },
      responseType: "text",
    });

  // Generic tool executor
  executeTool = async (toolName: string, args: any) => {
    const endpoint = toolEndpoints[toolName];

    if (!endpoint) throw new Error(`Unknown tool: ${toolName}`);

    return apiClient.post(endpoint, args);
  };
}

export const aiAgentService = new AiAgentService();

const toolEndpoints: Record<string, string> = {
  create_order: "/api/ai-agent/tool/create-order",
  add_items_to_order: "/api/ai-agent/tool/add-items",
  pay_bill: "/api/ai-agent/tool/pay-bill",
};
