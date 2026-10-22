import { FlowData } from "../types/flow.gen";

export interface ReferencedSecret {
  name: string;
  usedInHttp: boolean;
  usedOutsideHttp: boolean;
}

// Extracts all {{secrets.NAME}} placeholders referenced across any node in a
// flow, along with whether each name is used in HTTP request blocks and/or
// other blocks.
export function getReferencedSecrets(flow: FlowData): ReferencedSecret[] {
  const map = new Map<string, ReferencedSecret>();

  for (const node of flow.nodes) {
    const isHttp = node.type === "action_http_request";
    const data = JSON.stringify(node.data);
    for (const [, placeholder] of data.matchAll(/\{\{(.*?)\}\}/g)) {
      for (const [, name] of placeholder.matchAll(
        /\b(?:secrets|values)\.([A-Za-z_][A-Za-z0-9_]*)/g
      )) {
        const existing = map.get(name) ?? {
          name,
          usedInHttp: false,
          usedOutsideHttp: false,
        };
        if (isHttp) {
          existing.usedInHttp = true;
        } else {
          existing.usedOutsideHttp = true;
        }
        map.set(name, existing);
      }
    }
  }

  return Array.from(map.values());
}

// The names of the secrets a flow references in HTTP requests, like API_KEY in
// {{secrets.API_KEY}}.
export function getReferencedSecretNames(flow: FlowData) {
  return getReferencedSecrets(flow)
    .filter((s) => s.usedInHttp)
    .map((s) => s.name);
}
