import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  KeyRoundIcon,
  TerminalIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import AppEmptyPlaceholder from "./AppEmptyPlaceholder";
import { Skeleton } from "../ui/skeleton";
import AutoAnimate from "../common/AutoAnimate";
import { useAppSecrets, useCommands } from "@/lib/hooks/api";
import AppSecretDialog from "./AppSecretDialog";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import ConfirmDialog from "../common/ConfirmDialog";
import { useAppSecretDeleteMutation } from "@/lib/api/mutations";
import { useAppId } from "@/lib/hooks/params";
import { toast } from "sonner";
import { AppSecret, Command } from "@/lib/types/wire.gen";
import { formatDateTime } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import Link from "next/link";

type ScopeFilter = "all" | "cmd" | "global";

export default function AppSecretList() {
  const [filter, setFilter] = useState<ScopeFilter>("all");
  const secrets = useAppSecrets();
  const commands = useCommands();

  const commandMap = useMemo(() => {
    const map = new Map<string, Command>();
    for (const cmd of commands ?? []) {
      if (cmd) map.set(cmd.id, cmd);
    }
    return map;
  }, [commands]);

  const allSecrets = useMemo(
    () => (secrets ?? []).filter((s): s is AppSecret => Boolean(s)),
    [secrets]
  );

  const cmdSecrets = useMemo(
    () => allSecrets.filter((s) => Boolean(s.command_id)),
    [allSecrets]
  );

  const globalSecrets = useMemo(
    () => allSecrets.filter((s) => !s.command_id),
    [allSecrets]
  );

  const filteredSecrets = useMemo(() => {
    const base =
      filter === "cmd"
        ? cmdSecrets
        : filter === "global"
        ? globalSecrets
        : allSecrets;
    return [...base].sort((a, b) => {
      if (a.has_value !== b.has_value) return a.has_value ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [filter, allSecrets, cmdSecrets, globalSecrets]);

  const needsValueCount = useMemo(
    () => allSecrets.filter((s) => !s.has_value).length,
    [allSecrets]
  );

  const createButton = (
    <AppSecretDialog
      commands={commands}
      defaultCommandId={
        filter === "cmd" ? commands?.find(Boolean)?.id ?? null : null
      }
    >
      <Button>Create secret</Button>
    </AppSecretDialog>
  );

  return (
    <AutoAnimate className="flex flex-col md:flex-1 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as ScopeFilter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full sm:w-[320px] grid-cols-3">
            <TabsTrigger value="all">All ({allSecrets.length})</TabsTrigger>
            <TabsTrigger value="cmd">Command ({cmdSecrets.length})</TabsTrigger>
            <TabsTrigger value="global">
              Global ({globalSecrets.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {allSecrets.length > 0 && <div className="flex">{createButton}</div>}
      </div>

      {needsValueCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2.5">
          <AlertTriangleIcon className="size-4 flex-none" />
          <div>
            <strong>{needsValueCount}</strong> placeholder
            {needsValueCount === 1 ? "" : "s"} from imported commands need a
            value configured before use.
          </div>
        </div>
      )}

      {!secrets ? (
        <>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </>
      ) : filteredSecrets.length === 0 ? (
        <AppEmptyPlaceholder
          title={
            filter === "cmd"
              ? "There are no command secrets"
              : filter === "global"
              ? "There are no global secrets"
              : "There are no secrets"
          }
          description="Store API keys, command secrets, and reusable configuration values here instead of hardcoding them in your blocks."
          action={createButton}
        />
      ) : (
        <>
          {filteredSecrets.map((secret) => (
            <AppSecretListEntry
              secret={secret}
              command={
                secret.command_id
                  ? commandMap.get(secret.command_id)
                  : undefined
              }
              commands={commands}
              key={secret.id}
            />
          ))}
        </>
      )}
    </AutoAnimate>
  );
}

function AppSecretListEntry({
  secret,
  command,
  commands,
}: {
  secret: AppSecret;
  command?: Command;
  commands?: (Command | undefined)[];
}) {
  const appId = useAppId();
  const deleteMutation = useAppSecretDeleteMutation(appId, secret.id);
  const [copied, setCopied] = useState(false);

  function copyPlaceholder() {
    const placeholder = `{{${secret.is_secret ? "secrets" : "values"}.${
      secret.name
    }}}`;
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
    <Card className={!secret.has_value ? "border-amber-500/50" : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center flex-wrap gap-2">
          {secret.is_secret ? (
            <KeyRoundIcon className="h-5 w-5 text-muted-foreground flex-none" />
          ) : (
            <FileTextIcon className="h-5 w-5 text-muted-foreground flex-none" />
          )}
          <div>{secret.name}</div>

          {secret.command_id ? (
            command ? (
              <Link href={`/apps/${appId}/commands/${secret.command_id}`}>
                <Badge
                  variant="secondary"
                  className="gap-1 font-normal hover:bg-secondary/80 cursor-pointer"
                >
                  <TerminalIcon className="size-3" />/{command.name}
                </Badge>
              </Link>
            ) : (
              <Badge variant="secondary" className="font-normal">
                Command
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="font-normal">
              Global
            </Badge>
          )}

          {!secret.is_secret && (
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              Non-secret value
            </Badge>
          )}

          {!secret.has_value && (
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-500 gap-1 font-normal"
            >
              <AlertTriangleIcon className="size-3" />
              Needs value
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-sm space-y-1">
          <div>
            <code>{`{{${secret.is_secret ? "secrets" : "values"}.${
              secret.name
            }}}`}</code>, updated{" "}
            {formatDateTime(new Date(secret.updated_at))}
          </div>
          {!secret.is_secret && secret.has_value && secret.value && (
            <div className="font-mono text-xs text-foreground/80 bg-muted/50 px-2 py-1 rounded w-fit max-w-full truncate">
              {secret.value}
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex space-x-3">
        <AppSecretDialog secret={secret} commands={commands}>
          <Button size="sm" variant={!secret.has_value ? "default" : "outline"}>
            {!secret.has_value ? "Set value" : "Edit"}
          </Button>
        </AppSecretDialog>
        <Button size="sm" variant="outline" onClick={copyPlaceholder}>
          {copied ? (
            <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-green-500" />
          ) : (
            <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          Copy placeholder
        </Button>
        <ConfirmDialog
          title={`Are you sure that you want to delete ${secret.name}?`}
          description="Blocks that use it will fail. This can't be undone."
          onConfirm={remove}
        >
          <Button size="sm" variant="ghost">
            Delete
          </Button>
        </ConfirmDialog>
      </CardFooter>
    </Card>
  );
}
