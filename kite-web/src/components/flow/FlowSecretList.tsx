import { useAppSecrets } from "@/lib/hooks/api";
import { useAppSecretDeleteMutation } from "@/lib/api/mutations";
import { useAppId } from "@/lib/hooks/params";
import { useFlowContext } from "@/lib/flow/context";
import { NodeData } from "@/lib/flow/dataSchema";
import { getReferencedSecrets } from "@/lib/flow/secrets";
import { AppSecret } from "@/lib/types/wire.gen";
import { Node, useEdges, useNodes } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import AppSecretDialog from "../app/AppSecretDialog";
import ConfirmDialog from "../common/ConfirmDialog";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ScopeTab = "all" | "cmd" | "global";

export default function FlowSecretList({
  hideHeader,
}: {
  hideHeader?: boolean;
}) {
  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");
  const router = useRouter();
  const contextCommandId = useFlowContext((c) => c.commandId);
  const commandId =
    contextCommandId ||
    (typeof router.query.cmdId === "string" ? router.query.cmdId : undefined);

  const secrets = useAppSecrets();
  const nodes = useNodes<Node<NodeData>>();
  const edges = useEdges();

  const allSecrets = useMemo(() => {
    if (!secrets) return [];
    return secrets.filter((s): s is AppSecret => Boolean(s));
  }, [secrets]);

  const cmdSecrets = useMemo(
    () =>
      commandId
        ? allSecrets.filter((s) => s.command_id === commandId)
        : [],
    [allSecrets, commandId]
  );

  const globalSecrets = useMemo(
    () => allSecrets.filter((s) => !s.command_id),
    [allSecrets]
  );

  const visibleSecrets = useMemo(() => {
    const list =
      scopeTab === "cmd"
        ? cmdSecrets
        : scopeTab === "global"
        ? globalSecrets
        : [...cmdSecrets, ...globalSecrets];

    return [...list].sort((a, b) => {
      if (a.has_value !== b.has_value) return a.has_value ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [scopeTab, cmdSecrets, globalSecrets]);

  const referenced = useMemo(
    () => getReferencedSecrets({ nodes: nodes as any, edges: edges as any }),
    [nodes, edges]
  );

  const availableByName = useMemo(() => {
    const map = new Map<string, AppSecret>();
    for (const s of globalSecrets) {
      map.set(s.name, s);
    }
    for (const s of cmdSecrets) {
      map.set(s.name, s);
    }
    return map;
  }, [globalSecrets, cmdSecrets]);

  const missingReferenced = useMemo(
    () => referenced.filter((r) => !availableByName.has(r.name)),
    [referenced, availableByName]
  );

  const misusedTrueSecrets = useMemo(
    () =>
      referenced.filter((r) => {
        const s = availableByName.get(r.name);
        return s && s.is_secret && r.usedOutsideHttp;
      }),
    [referenced, availableByName]
  );

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden select-none">
      {!hideHeader && (
        <div className="p-5 pb-3 flex-none space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-bold text-foreground">Secrets</div>
            <AppSecretDialog
              commandId={commandId}
              defaultCommandId={
                scopeTab === "cmd" && commandId ? commandId : null
              }
            >
              <Button size="sm" className="gap-1.5 h-8 font-medium">
                <PlusIcon className="size-3.5" />
                New secret
              </Button>
            </AppSecretDialog>
          </div>
          <div className="text-muted-foreground text-sm">
            Manage global and command secrets. Copy a placeholder to use it in
            your blocks.
          </div>
        </div>
      )}

      {hideHeader && (
        <div className="p-4 pb-2 flex items-center justify-between gap-2 flex-none">
          <div className="text-sm text-muted-foreground">
            Manage secrets and values for your flow.
          </div>
          <AppSecretDialog
            commandId={commandId}
            defaultCommandId={
              scopeTab === "cmd" && commandId ? commandId : null
            }
          >
            <Button size="sm" className="gap-1.5 h-8 flex-none font-medium">
              <PlusIcon className="size-3.5" />
              New secret
            </Button>
          </AppSecretDialog>
        </div>
      )}

      <div className="px-4 pb-3 flex-none">
        <Tabs
          value={scopeTab}
          onValueChange={(v) => setScopeTab(v as ScopeTab)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">
              All ({cmdSecrets.length + globalSecrets.length})
            </TabsTrigger>
            <TabsTrigger
              value="cmd"
              disabled={!commandId}
            >
              Command ({cmdSecrets.length})
            </TabsTrigger>
            <TabsTrigger value="global">
              Global ({globalSecrets.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
          {misusedTrueSecrets.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5">
              <AlertTriangleIcon className="size-4 flex-none mt-0.5" />
              <div>
                Secret{" "}
                <span className="font-semibold">
                  {misusedTrueSecrets.map((s) => s.name).join(", ")}
                </span>{" "}
                is used outside an HTTP Request block. Uncheck{" "}
                <strong>Secret value</strong> on edit if it needs to be used in
                other blocks.
              </div>
            </div>
          )}

          {missingReferenced.map((missing) => (
            <div
              key={`missing-${missing.name}`}
              className="flex items-center justify-between gap-3 p-3 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                <div className="rounded-md w-8 h-8 flex justify-center items-center flex-none bg-amber-500 text-white shadow-sm">
                  <AlertTriangleIcon className="size-4 text-white" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="font-medium text-sm text-foreground truncate cursor-default"
                        title={missing.name}
                      >
                        {missing.name}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs break-all">
                      {missing.name}
                    </TooltipContent>
                  </Tooltip>
                  <div className="text-xs text-amber-500 truncate mt-0.5">
                    Referenced in flow but not created yet
                  </div>
                </div>
              </div>
              <AppSecretDialog
                commandId={commandId}
                defaultName={missing.name}
                defaultCommandId={commandId ?? null}
                defaultIsSecret={!missing.usedOutsideHttp}
              >
                <Button size="sm" variant="outline" className="h-8 text-xs flex-none">
                  Create
                </Button>
              </AppSecretDialog>
            </div>
          ))}

          {visibleSecrets.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-center px-4">
              <div className="text-muted-foreground text-sm">
                {scopeTab === "cmd"
                  ? "No command secrets yet."
                  : scopeTab === "global"
                  ? "No global secrets yet."
                  : "No secrets or values yet."}
              </div>
            </div>
          ) : (
            visibleSecrets.map((secret) => (
              <FlowSecretTile
                key={secret.id}
                secret={secret}
                commandId={commandId}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FlowSecretTile({
  secret,
  commandId,
}: {
  secret: AppSecret;
  commandId?: string;
}) {
  const appId = useAppId();
  const deleteMutation = useAppSecretDeleteMutation(appId, secret.id);
  const [copied, setCopied] = useState(false);

  function copyPlaceholder() {
    const placeholder = `{{secrets.${secret.name}}}`;
    navigator.clipboard
      .writeText(placeholder)
      .then(() => {
        setCopied(true);
        toast.success(`Copied ${placeholder} to clipboard!`);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Failed to copy placeholder"));
  }

  function remove() {
    deleteMutation.mutate(undefined, {
      onSuccess(res) {
        if (res.success) {
          toast.success(
            secret.is_secret ? "Secret deleted!" : "Value deleted!"
          );
        } else {
          toast.error(
            `Failed to delete: ${res.error.message} (${res.error.code})`
          );
        }
      },
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border/60 bg-card hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "rounded-md w-8 h-8 flex justify-center items-center flex-none shadow-sm",
            secret.is_secret
              ? "bg-amber-500 text-white"
              : "bg-blue-500 text-white"
          )}
        >
          {secret.is_secret ? (
            <KeyRoundIcon className="size-4 text-white" />
          ) : (
            <FileTextIcon className="size-4 text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="font-medium text-sm text-foreground truncate cursor-default"
                  title={secret.name}
                >
                  {secret.name}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs break-all">
                {secret.name}
              </TooltipContent>
            </Tooltip>
            {!secret.has_value && (
              <span className="text-[11px] text-amber-500 font-medium flex items-center gap-1 flex-none">
                <AlertTriangleIcon className="size-3" />
                Needs value
              </span>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="text-xs text-muted-foreground truncate cursor-default mt-0.5"
                title={`{{secrets.${secret.name}}}`}
              >
                {secret.command_id ? "Command" : "Global"}{" "}
                {secret.is_secret ? "secret" : "value"} ·{" "}
                <span className="font-mono text-[11px]">
                  {`{{secrets.${secret.name}}}`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs break-all">
              <code>{`{{secrets.${secret.name}}}`}</code>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-none">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={copyPlaceholder}
            >
              {copied ? (
                <CheckIcon className="size-4 text-green-500" />
              ) : (
                <CopyIcon className="size-4" />
              )}
              <span className="sr-only">Copy placeholder</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Copy <code>{`{{secrets.${secret.name}}}`}</code>
          </TooltipContent>
        </Tooltip>

        <AppSecretDialog secret={secret} commandId={commandId}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <PencilIcon className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
        </AppSecretDialog>

        <ConfirmDialog
          title={`Are you sure that you want to delete ${secret.name}?`}
          description="Blocks that use it will fail. This can't be undone."
          onConfirm={remove}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2Icon className="size-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </ConfirmDialog>
      </div>
    </div>
  );
}
