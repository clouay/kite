import { getBlockDefinition } from "@/lib/blocks";
import { useFlowContext } from "@/lib/flow/context";
import { NodeData } from "@/lib/flow/dataSchema";
import { getAvailablePlaceholders } from "@/lib/flow/placeholders";
import { useSyncedParameters } from "@/lib/flow/parametersStore";
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
  field,
  onlyParameters,
}: {
  onSelect: (value: string) => void;
  hideBrackets?: boolean;
  // For settings that aren't templates, like the value of an event filter.
  onlyParameters?: boolean;
  // The setting it inserts into, like http_request_data.url. The app's
  // secrets are only offered for settings that can use them.
  field?: string;
}) {
  const [addValueOpen, setAddValueOpen] = useState(false);
  const nodes = useNodes<Node<NodeData>>();
  const edges = useEdges();
  const contextType = useFlowContext((c) => c.type);
  const contextCommandId = useFlowContext((c) => c.commandId);
  const contextEventListenerId = useFlowContext((c) => c.eventListenerId);
  const router = useRouter();
  const commandId =
    contextCommandId ||
    (typeof router.query.cmdId === "string" ? router.query.cmdId : undefined);
  const eventListenerId =
    contextEventListenerId ||
    (typeof router.query.eventId === "string" ? router.query.eventId : undefined);

  const selected = useMemo(() => nodes.find((n) => n.selected), [nodes]);
  const isResponseTarget =
    field === "message_target" &&
    !!selected?.type?.startsWith("action_response_");
  const allowsSecrets = !!getBlockDefinition(selected?.type)?.fields?.find(
    (f) => f.name === field?.split(".")[0]
  )?.secrets;
  const secrets = useAppSecrets();
  const parameters = useSyncedParameters();

  const placeholders = useMemo(() => {
    const parameterGroup = parameters.length
      ? [
          {
            label: "Parameters",
            placeholders: parameters.map((p) => ({
              label: p.label || p.key,
              value: `params.${p.key}`,
            })),
          },
        ]
      : [];
    if (onlyParameters) return parameterGroup;

    let res = [
      ...getAvailablePlaceholders(
        selected?.id,
        nodes,
        edges,
        contextType,
        isResponseTarget
      ),
      ...parameterGroup,
    ];

    const byName = new Map<string, AppSecret>();
    for (const s of secrets ?? []) {
      if (!s) continue;
      if (!s.command_id && !s.event_listener_id) {
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
    if (eventListenerId) {
      for (const s of secrets ?? []) {
        if (s && s.event_listener_id === eventListenerId) {
          byName.set(s.name, s);
        }
      }
    }

    const secretPlaceholders = Array.from(byName.values())
      .filter((s) => allowsSecrets || !s.is_secret)
      .map((s) => ({
        label: `${s.is_secret ? "Secret" : "Value"} '${s.name}' (${
          s.command_id ? "Command" : s.event_listener_id ? "Event" : "Global"
        })`,
        value: `${s.is_secret ? "secrets" : "values"}.${s.name}`,
      }));

    if (secretPlaceholders.length > 0) {
      res = [
        ...res,
        {
          label: "Secrets & Values",
          placeholders: secretPlaceholders,
        },
      ];
    }

    return res;
  }, [
    selected?.id,
    nodes,
    edges,
    contextType,
    isResponseTarget,
    allowsSecrets,
    secrets,
    parameters,
    commandId,
    eventListenerId,
    onlyParameters,
  ]);

  if (onlyParameters && !placeholders.length) return null;

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
        eventListenerId={eventListenerId}
        defaultCommandId={commandId ?? null}
        defaultEventListenerId={eventListenerId ?? null}
        defaultIsSecret={allowsSecrets}
        onCreated={(secret) => {
          if (allowsSecrets || !secret.is_secret) {
            onSelect(
              `${secret.is_secret ? "secrets" : "values"}.${secret.name}`
            );
          }
        }}
      />
    </div>
  );
}
