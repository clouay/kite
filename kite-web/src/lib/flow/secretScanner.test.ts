import { describe, expect, it } from "vitest";
import { maskSecret, scanFlowsForSecrets } from "./secretScanner";

describe("maskSecret", () => {
  it("masks values by keeping the first and last three characters", () => {
    expect(maskSecret("11234567889")).toBe("112...889");
    expect(maskSecret("sk-proj-abcdef1234567890")).toBe("sk-...890");
    expect(maskSecret("short")).toBe("...");
  });
});

describe("scanFlowsForSecrets", () => {
  it("ignores valid placeholder references", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          type: "action_http_request",
          position: { x: 0, y: 0 },
          data: {
            http_request_data: {
              url: "https://api.example.com",
              headers: [
                { key: "Authorization", value: "Bearer {{secrets.MY_TOKEN}}" },
              ],
            },
          },
        },
      ],
      edges: [],
    };

    expect(scanFlowsForSecrets([flow])).toEqual([]);
  });

  it("finds hardcoded tokens in nested block fields and reports the block and masked value", () => {
    const flow = {
      nodes: [
        {
          id: "node_1",
          type: "action_http_request",
          position: { x: 0, y: 0 },
          data: {
            http_request_data: {
              url: "https://api.openai.com/v1/chat/completions",
              headers: [
                {
                  key: "Authorization",
                  value: "Bearer sk-proj-1234567890abcdef1234567890abcdef",
                },
              ],
            },
          },
        },
        {
          id: "node_2",
          type: "action_message_create",
          position: { x: 0, y: 0 },
          data: {
            content:
              "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789",
          },
        },
      ],
      edges: [],
    };

    const results = scanFlowsForSecrets([flow]);
    expect(results.length).toBe(2);

    expect(results[0].nodeId).toBe("node_1");
    expect(results[0].blockTitle).toBe("Send API Request");
    expect(results[0].fieldName).toBe("http_request_data.headers[0].value");
    expect(results[0].ruleName).toBe("OpenAI API Key");
    expect(results[0].masked).toBe("sk-...def");

    expect(results[1].nodeId).toBe("node_2");
    expect(results[1].blockTitle).toBe("Create channel message");
    expect(results[1].fieldName).toBe("content");
    expect(results[1].ruleName).toBe("Discord Webhook");
    expect(results[1].masked).toBe("htt...789");
  });
});
