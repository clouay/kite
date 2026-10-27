import { ReactNode, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import LoadingButton from "../common/LoadingButton";
import { ShareCodeDisplay, ShareCodePanel } from "./ShareCode";
import { useShareCodeCreateMutation } from "@/lib/api/mutations";
import { useAppId } from "@/lib/hooks/params";
import { useAppSecrets, useMessages } from "@/lib/hooks/api";
import { collectReferencedMessages } from "@/lib/flow/messageTemplates";
import { getReferencedSecrets } from "@/lib/flow/secrets";
import { scanFlowsForSecrets } from "@/lib/flow/secretScanner";
import { FlowData } from "@/lib/types/flow.gen";
import {
  AlertTriangleIcon,
  BracesIcon,
  CopyIcon,
  KeyRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

type ExportProps = {
  title: string;
  type: "command" | "event_listener" | "message" | "bundle";
  shareData: Record<string, unknown>;
  // Message templates used by these flows are exported along with them, so
  // they don't have to be recreated in the other app.
  flows: (FlowData | null | undefined)[];
  // Templates that are already part of shareData.
  excludeMessageIds?: string[];
  commandId?: string;
  eventListenerId?: string;
  // Shown under the title, like what the export contains.
  note?: ReactNode;
};

export default function FlowExportDialog({
  children,
  ...props
}: ExportProps & { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <ExportForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

// Separate from the dialog so its state resets every time it's opened.
export function ExportForm({
  title,
  type,
  shareData: baseShareData,
  flows,
  excludeMessageIds,
  commandId,
  eventListenerId,
  note,
}: ExportProps) {
  const [showJson, setShowJson] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [confirmedSecrets, setConfirmedSecrets] = useState(false);

  const appId = useAppId();
  const createMutation = useShareCodeCreateMutation(appId);
  const messages = useMessages();
  const secrets = useAppSecrets();

  const bundledMessages = messages
    ? collectReferencedMessages(flows, messages, excludeMessageIds)
    : null;

  const suspectedSecrets = useMemo(() => {
    const all = [
      ...flows.filter((f): f is FlowData => Boolean(f)),
      ...(bundledMessages?.flatMap((m) =>
        Object.values(m.flow_sources ?? {})
      ) ?? []),
    ];
    return scanFlowsForSecrets(all);
  }, [flows, bundledMessages]);

  const hasUnconfirmedSecrets =
    suspectedSecrets.length > 0 && !confirmedSecrets;

  const secretsWarning = hasUnconfirmedSecrets && (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2.5">
      <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangleIcon className="h-4 w-4 shrink-0" />
        <span>Possible secrets in this export</span>
      </div>
      <p className="text-muted-foreground">
        These values look like API keys or tokens. Replace them with
        placeholders so they aren&apos;t shared:
      </p>
      <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] bg-background/60 rounded p-2 border">
        {suspectedSecrets.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="truncate">
              <span className="text-foreground font-semibold">
                {s.blockTitle}
              </span>
              <span className="text-muted-foreground"> ({s.fieldName})</span>
            </span>
            <span className="text-amber-600 dark:text-amber-400 shrink-0 font-medium">
              {s.masked}
            </span>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setConfirmedSecrets(true)}
      >
        I know, share anyway
      </Button>
    </div>
  );

  const bundledSecrets = useMemo(() => {
    if (!bundledMessages) return null;
    const allFlows = [
      ...flows.filter((f): f is FlowData => Boolean(f)),
      ...bundledMessages.flatMap((m) => Object.values(m.flow_sources ?? {})),
    ];

    const secretMap = new Map<
      string,
      { name: string; is_secret: boolean; scope: "cmd" | "event" | "global" }
    >();

    for (const flow of allFlows) {
      for (const ref of getReferencedSecrets(flow)) {
        const existing =
          (secrets ?? []).find(
            (s) =>
              Boolean(s) &&
              Boolean(commandId) &&
              s!.command_id === commandId &&
              s!.name === ref.name
          ) ??
          (secrets ?? []).find(
            (s) =>
              Boolean(s) &&
              Boolean(eventListenerId) &&
              s!.event_listener_id === eventListenerId &&
              s!.name === ref.name
          ) ??
          (secrets ?? []).find((s) => s && s.name === ref.name);
        secretMap.set(ref.name, {
          name: ref.name,
          is_secret: existing
            ? existing.is_secret
            : ref.asSecret
            ? true
            : !ref.asValue,
          scope: existing?.command_id
            ? "cmd"
            : existing?.event_listener_id
            ? "event"
            : "global",
        });
      }
    }

    return Array.from(secretMap.values());
  }, [bundledMessages, flows, secrets, commandId, eventListenerId]);

  const shareData = useMemo(() => {
    const next = { ...baseShareData };
    if (bundledMessages && bundledMessages.length > 0) {
      next.messages = bundledMessages;
    }
    if (bundledSecrets && bundledSecrets.length > 0) {
      next.secrets = bundledSecrets;
    }
    return next;
  }, [baseShareData, bundledMessages, bundledSecrets]);

  const bundledNote =
    bundledMessages && bundledMessages.length > 0
      ? ` The ${bundledMessages.length} message template(s) and ${
          bundledSecrets?.length ?? 0
        } placeholder(s) it uses are included.`
      : "";

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied to clipboard!"))
      .catch(() => toast.error("Failed to copy, use ctrl + c instead"));
  }

  function generateCode() {
    createMutation.mutate(
      { type, data: shareData },
      {
        onSuccess: (res) => {
          if (res.success) {
            setCode(res.data.code);
          } else {
            toast.error(
              `Failed to generate share code: ${res.error.message} (${res.error.code})`
            );
          }
        },
      }
    );
  }

  if (showJson) {
    // Without the templates the JSON would be incomplete, so it's only shown
    // once they're loaded.
    const json = bundledMessages ? JSON.stringify(shareData) : "";

    return (
      <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy the JSON below and import it into another app.{bundledNote}
          </DialogDescription>
        </DialogHeader>
        {note}
        {secretsWarning}
        <Textarea
          readOnly
          value={json}
          placeholder="Loading..."
          minRows={8}
          maxRows={8}
          className="resize-none break-all font-mono md:text-xs"
          onFocus={(e) => e.target.select()}
        />
        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          <Button variant="ghost" onClick={() => setShowJson(false)}>
            <KeyRoundIcon className="mr-2 h-4 w-4" />
            Use share code
          </Button>
          <Button
            onClick={() => copy(json)}
            disabled={!bundledMessages || hasUnconfirmedSecrets}
          >
            <CopyIcon className="mr-2 h-4 w-4" />
            Copy JSON
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Anyone with the code can import this into their app. Codes expire
          after 90 days without use.{bundledNote}
        </DialogDescription>
      </DialogHeader>
      {note}
      {secretsWarning}
      <ShareCodePanel>
        <ShareCodeDisplay code={code} />
      </ShareCodePanel>
      <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
        <Button variant="ghost" onClick={() => setShowJson(true)}>
          <BracesIcon className="mr-2 h-4 w-4" />
          Use JSON
        </Button>
        {code ? (
          <Button onClick={() => copy(code)}>
            <CopyIcon className="mr-2 h-4 w-4" />
            Copy code
          </Button>
        ) : (
          <LoadingButton
            onClick={generateCode}
            loading={createMutation.isPending || !bundledMessages}
            disabled={hasUnconfirmedSecrets}
          >
            Generate code
          </LoadingButton>
        )}
      </DialogFooter>
    </>
  );
}
