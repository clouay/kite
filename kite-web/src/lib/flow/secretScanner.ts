import { getBlockDefinition } from "../blocks";
import { FlowData } from "../types/flow.gen";
import { secretRules } from "./secretRules";

export interface SuspectedSecret {
  nodeId: string;
  blockTitle: string;
  fieldName: string;
  ruleName: string;
  masked: string;
}

export function maskSecret(val: string): string {
  const s = val.trim();
  if (s.length <= 8) return "...";
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

function stripPlaceholders(val: string): string {
  return val.replace(/\{\{\s*[\w\.\?\[\]"']+\s*\}\}/g, "");
}

function findSecretsInValue(
  value: unknown,
  nodeId: string,
  blockTitle: string,
  fieldName: string
): SuspectedSecret[] {
  if (!value) return [];

  if (typeof value === "string") {
    const text = stripPlaceholders(value).trim();
    if (!text) return [];

    for (const [ruleName, regex] of secretRules) {
      const match = text.match(regex);
      if (match) {
        const secret = match[1] ?? match[0];
        return [
          {
            nodeId,
            blockTitle,
            fieldName,
            ruleName,
            masked: maskSecret(secret),
          },
        ];
      }
    }
    return [];
  }

  if (Array.isArray(value)) {
    const results: SuspectedSecret[] = [];
    for (let i = 0; i < value.length; i++) {
      results.push(
        ...findSecretsInValue(
          value[i],
          nodeId,
          blockTitle,
          `${fieldName}[${i}]`
        )
      );
    }
    return results;
  }

  if (typeof value === "object") {
    const results: SuspectedSecret[] = [];
    for (const [k, v] of Object.entries(value)) {
      results.push(
        ...findSecretsInValue(v, nodeId, blockTitle, `${fieldName}.${k}`)
      );
    }
    return results;
  }

  return [];
}

export function scanFlowsForSecrets(
  flows: (FlowData | null | undefined)[]
): SuspectedSecret[] {
  const findings: SuspectedSecret[] = [];

  for (const flow of flows) {
    if (!flow?.nodes) continue;

    for (const node of flow.nodes) {
      const nodeType = node.type ?? "";
      const def = node.type ? getBlockDefinition(node.type) : undefined;
      const blockTitle = def?.title ?? nodeType;

      for (const [field, value] of Object.entries(node.data ?? {})) {
        findings.push(
          ...findSecretsInValue(value, node.id ?? "", blockTitle, field)
        );
      }
    }
  }

  return findings;
}
