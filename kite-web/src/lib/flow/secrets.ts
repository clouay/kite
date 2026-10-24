import { getBlockDefinition } from "../blocks";
import { FlowData } from "../types/flow.gen";
import { templateSecretNames, templateValueNames } from "./templateSecrets";

// The names of the secrets a flow references, like API_KEY in
// {{secrets.API_KEY}}. Only the settings of blocks that allow secrets can use
// them, and only placeholders reference them.
export function getReferencedSecretNames(flow: FlowData) {
  const names = new Set<string>();
  for (const node of flow.nodes) {
    const fields = getBlockDefinition(node.type)?.fields ?? [];
    for (const field of fields.filter((f) => f.secrets)) {
      const data = JSON.stringify(node.data[field.name] ?? "");
      for (const name of templateSecretNames(data)) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

// missingSecretNames are the secrets the flows reference that aren't among
// the names.
export function missingSecretNames(
  flows: FlowData[],
  names: (string | undefined)[]
) {
  const have = new Set(names);
  return Array.from(
    new Set(flows.flatMap((f) => getReferencedSecretNames(f)))
  ).filter((name) => !have.has(name));
}

export interface ReferencedSecret {
  name: string;
  // Referenced as {{secrets.NAME}}.
  asSecret: boolean;
  // Referenced as {{values.NAME}}, which only works for non-secret values.
  asValue: boolean;
  // Referenced as {{secrets.NAME}} in a setting that doesn't allow secrets,
  // which fails when the flow runs.
  secretMisplaced: boolean;
}

// Every secret and value a flow references, in any setting. Used to show the
// ones that are missing or misused, and to create blank ones when importing a
// shared flow.
export function getReferencedSecrets(flow: FlowData): ReferencedSecret[] {
  const map = new Map<string, ReferencedSecret>();
  const get = (name: string) => {
    let ref = map.get(name);
    if (!ref) {
      ref = { name, asSecret: false, asValue: false, secretMisplaced: false };
      map.set(name, ref);
    }
    return ref;
  };

  for (const node of flow.nodes ?? []) {
    const fields = getBlockDefinition(node.type)?.fields ?? [];
    for (const [key, value] of Object.entries(node.data ?? {})) {
      const allowsSecrets = fields.some((f) => f.name === key && f.secrets);
      const data = JSON.stringify(value ?? "");
      for (const name of templateSecretNames(data)) {
        const ref = get(name);
        ref.asSecret = true;
        if (!allowsSecrets) ref.secretMisplaced = true;
      }
      for (const name of templateValueNames(data)) {
        get(name).asValue = true;
      }
    }
  }

  return Array.from(map.values());
}
