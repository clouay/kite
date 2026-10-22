import { useFlowContext } from "@/lib/flow/context";
import { NodeData } from "@/lib/flow/dataSchema";
import { getAvailablePlaceholders } from "@/lib/flow/placeholders";
import { useAppSecrets } from "@/lib/hooks/api";
import { AppSecret } from "@/lib/types/wire.gen";
import { Node, useEdges, useNodes } from "@xyflow/react";
import { VariableIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import AppSecretDialog from "../app/AppSecretDialog";
import PlaceholderExplorer from "../common/PlaceholderExplorer";

export default function FlowPlaceholderExplorer({
  onSelect,
  hideBrackets,
}: {
  onSelect: (value: string) => void;
  hideBrackets?: boolean;
}) {
  const [addValueOpen, setAddValueOpen] = useState(false);
  const nodes = useNodes<Node<NodeData>>();
  const edges = useEdges();
  const contextType = useFlowContext((c) => c.type);
  const contextCommandId = useFlowContext((c) => c.commandId);
  const router = useRouter();
  const commandId =
    contextCommandId ||
    (typeof router.query.cmdId === "string" ? router.query.cmdId : undefined);

  const secrets = useAppSecrets();
  const selectedNode = useMemo(() => nodes.find((n) => n.selected), [nodes]);
  const isHttpNode = selectedNode?.type === "action_http_request";

  const placeholders = useMemo(() => {
    const base = getAvailablePlaceholders(
      selectedNode?.id,
      nodes,
      edges,
      contextType
    );

    const byName = new Map<string, AppSecret>();
    for (const s of secrets ?? []) {
      if (!s) continue;
      if (!s.command_id) {
        byName.set(s.name, s);
      }
    }
    if (commandId) {
      for (const s of secrets ?? []) {
        if (s && s.command_id === commandId) {
          byName.set(s.name, s);
        }
      }
    }

    const secretPlaceholders = Array.from(byName.values())
      .filter((s) => isHttpNode || !s.is_secret)
      .map((s) => ({
        label: `${s.is_secret ? "Secret" : "Value"} '${s.name}' (${
          s.command_id ? "Command" : "Global"
        })`,
        value: `${s.is_secret ? "secrets" : "values"}.${s.name}`,
      }));

    if (secretPlaceholders.length > 0) {
      base.push({
        label: "Secrets & Values",
        placeholders: secretPlaceholders,
      });
    }

    return base;
  }, [selectedNode?.id, nodes, edges, contextType, secrets, commandId, isHttpNode]);

  return (
    <div className="absolute top-1.5 right-1.5 z-20">
      <PlaceholderExplorer
        onSelect={onSelect}
        placeholders={placeholders}
        hideBrackets={hideBrackets}
        onAddValue={() => setAddValueOpen(true)}
      >
        <VariableIcon
          className="h-5.5 w-5.5 text-muted-foreground hover:text-foreground cursor-pointer"
          role="button"
        />
      </PlaceholderExplorer>
      <AppSecretDialog
        open={addValueOpen}
        onOpenChange={setAddValueOpen}
        commandId={commandId}
        defaultCommandId={commandId ?? null}
        defaultIsSecret={isHttpNode}
        onCreated={(secret) => {
          if (isHttpNode || !secret.is_secret) {
            onSelect(
              `${secret.is_secret ? "secrets" : "values"}.${secret.name}`
            );
          }
        }}
      />
    </div>
  );
}
