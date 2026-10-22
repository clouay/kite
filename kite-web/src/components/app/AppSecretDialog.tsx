import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReactNode, useEffect, useState } from "react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { useForm } from "react-hook-form";
import {
  useAppSecretCreateMutation,
  useAppSecretUpdateMutation,
} from "@/lib/api/mutations";
import { toast } from "sonner";
import { setValidationErrors } from "@/lib/form";
import LoadingButton from "../common/LoadingButton";
import { useAppId } from "@/lib/hooks/params";
import { AppSecret, Command, EventListener } from "@/lib/types/wire.gen";
import { Checkbox } from "../ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import env from "@/lib/env/client";
import { cn } from "@/lib/utils";

export function formatEventListenerLabel(listener: EventListener): string {
  if (listener.source === "schedule") {
    const cron = (listener.flow_source?.nodes as any)?.find(
      (n: any) => n.type === "entry_event"
    )?.data?.event_schedule_cron;
    return `Schedule ${cron ?? ""}`.trim();
  }
  if (listener.source === "webhook") {
    return listener.description ? `Webhook: ${listener.description}` : "Webhook";
  }
  return listener.type || "Event Listener";
}

interface FormFields {
  name: string;
  value: string;
  is_secret: boolean;
  scope: "global" | "cmd" | "event";
  command_id: string;
  event_listener_id: string;
}

// Creates a secret or non-secret value, or edits one when given. True secrets
// can't be read back, so an existing secret's value is blank when editing and
// only replaced when a new one is entered. Non-secrets show their existing
// value in plain text.
export default function AppSecretDialog({
  children,
  secret,
  defaultName = "",
  defaultCommandId = null,
  defaultEventListenerId = null,
  defaultIsSecret = true,
  commandId,
  commands,
  eventListenerId,
  eventListeners,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
}: {
  children?: ReactNode;
  secret?: AppSecret;
  defaultName?: string;
  defaultCommandId?: string | null;
  defaultEventListenerId?: string | null;
  defaultIsSecret?: boolean;
  commandId?: string;
  commands?: (Command | undefined)[];
  eventListenerId?: string;
  eventListeners?: (EventListener | undefined)[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (secret: AppSecret) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

  const appId = useAppId();

  const createMutation = useAppSecretCreateMutation(appId);
  const updateMutation = useAppSecretUpdateMutation(appId, secret?.id ?? "");
  const pending = createMutation.isPending || updateMutation.isPending;

  const getInitialValues = (): FormFields => {
    const initialCmdId =
      secret?.command_id ??
      defaultCommandId ??
      commandId ??
      commands?.find(Boolean)?.id ??
      "";
    const initialEventId =
      secret?.event_listener_id ??
      defaultEventListenerId ??
      eventListenerId ??
      eventListeners?.find(Boolean)?.id ??
      "";
    const isSecret = secret ? secret.is_secret : defaultIsSecret;
    let initialScope: "global" | "cmd" | "event" = "global";
    if (secret) {
      if (secret.command_id) initialScope = "cmd";
      else if (secret.event_listener_id) initialScope = "event";
    } else if (defaultEventListenerId || eventListenerId) {
      initialScope = "event";
    } else if (defaultCommandId || commandId) {
      initialScope = "cmd";
    }
    return {
      name: secret?.name ?? defaultName,
      value: secret && !secret.is_secret ? secret.value ?? "" : "",
      is_secret: isSecret,
      scope: initialScope,
      command_id: initialCmdId,
      event_listener_id: initialEventId,
    };
  };

  const form = useForm<FormFields>({
    defaultValues: getInitialValues(),
  });

  useEffect(() => {
    if (open) {
      form.reset(getInitialValues());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    secret,
    defaultName,
    defaultCommandId,
    defaultEventListenerId,
    defaultIsSecret,
    commandId,
    eventListenerId,
  ]);

  const watchedIsSecret = form.watch("is_secret");
  const watchedScope = form.watch("scope");
  const watchedName = form.watch("name");

  function onSubmit(data: FormFields) {
    if (pending) return;

    const targetCommandId =
      data.scope === "cmd" ? commandId || data.command_id || null : null;
    const targetEventListenerId =
      data.scope === "event"
        ? eventListenerId || data.event_listener_id || null
        : null;

    if (!secret && data.scope === "cmd" && !targetCommandId) {
      toast.error("Select a command for this command secret.");
      return;
    }
    if (!secret && data.scope === "event" && !targetEventListenerId) {
      toast.error("Select an event listener for this event secret.");
      return;
    }

    const handlers = {
      onSuccess(res: Awaited<ReturnType<typeof createMutation.mutateAsync>>) {
        if (res.success) {
          toast.success(
            secret
              ? data.is_secret
                ? "Secret updated!"
                : "Value updated!"
              : data.is_secret
              ? "Secret created!"
              : "Value created!"
          );
          setOpen(false);
          onCreated?.(res.data);
        } else if (res.error.code === "validation_failed") {
          setValidationErrors(form, res.error.data);
        } else {
          toast.error(
            `Failed to save: ${res.error.message} (${res.error.code})`
          );
        }
      },
    };

    if (secret) {
      updateMutation.mutate(
        {
          name: data.name,
          value: data.value ? data.value : null,
          is_secret: data.is_secret,
        },
        handlers
      );
    } else {
      createMutation.mutate(
        {
          name: data.name,
          value: data.value,
          command_id: targetCommandId,
          event_listener_id: targetEventListenerId,
          is_secret: data.is_secret,
          allow_empty: false,
        },
        handlers
      );
    }
  }

  const isCommandContext = Boolean(commandId);
  const isEventContext = Boolean(eventListenerId);
  const hasCmds = Boolean(commands && commands.length > 0);
  const hasEvents = Boolean(eventListeners && eventListeners.length > 0);

  const canChooseScope =
    !secret &&
    (isCommandContext ||
      isEventContext ||
      hasCmds ||
      hasEvents);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) form.reset(getInitialValues());
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {secret
              ? watchedIsSecret
                ? "Edit Secret"
                : "Edit Value"
              : watchedIsSecret
              ? "Create Secret"
              : "Create Value"}
          </DialogTitle>
          <DialogDescription>
            {watchedIsSecret ? (
              <>
                This secret is encrypted and hidden. You will not be able to
                see this secret after saving.{" "}
                <a
                  href={`${env.NEXT_PUBLIC_DOCS_LINK}/reference/secrets#secrets`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-foreground text-primary"
                >
                  Learn more
                </a>
              </>
            ) : (
              <>
                This value is stored in plain text and will remain visible
                whenever you view or edit it.{" "}
                <a
                  href={`${env.NEXT_PUBLIC_DOCS_LINK}/reference/secrets#secrets`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-foreground text-primary"
                >
                  Learn more
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {canChooseScope && (
              <div className="grid gap-2">
                <FormLabel>Scope</FormLabel>
                {isEventContext ? (
                  <Tabs
                    value={watchedScope === "cmd" ? "global" : watchedScope}
                    onValueChange={(v) =>
                      form.setValue("scope", v as "global" | "event")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="global">Global</TabsTrigger>
                      <TabsTrigger value="event">Event</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : isCommandContext ? (
                  <Tabs
                    value={watchedScope === "event" ? "global" : watchedScope}
                    onValueChange={(v) =>
                      form.setValue("scope", v as "global" | "cmd")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="global">Global</TabsTrigger>
                      <TabsTrigger value="cmd">Command</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <Tabs
                    value={watchedScope}
                    onValueChange={(v) =>
                      form.setValue("scope", v as "global" | "cmd" | "event")
                    }
                  >
                    <TabsList
                      className={cn(
                        "grid w-full",
                        hasCmds && hasEvents
                          ? "grid-cols-3"
                          : hasCmds || hasEvents
                          ? "grid-cols-2"
                          : "grid-cols-1"
                      )}
                    >
                      <TabsTrigger value="global">Global</TabsTrigger>
                      {hasCmds && <TabsTrigger value="cmd">Command</TabsTrigger>}
                      {hasEvents && <TabsTrigger value="event">Event</TabsTrigger>}
                    </TabsList>
                  </Tabs>
                )}
                {watchedScope === "cmd" && !commandId && commands && (
                  <Select
                    value={form.watch("command_id")}
                    onValueChange={(v) => form.setValue("command_id", v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select command..." />
                    </SelectTrigger>
                    <SelectContent>
                      {commands.filter(Boolean).map((cmd) => (
                        <SelectItem key={cmd!.id} value={cmd!.id}>
                          /{cmd!.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {watchedScope === "event" && !eventListenerId && eventListeners && (
                  <Select
                    value={form.watch("event_listener_id")}
                    onValueChange={(v) => form.setValue("event_listener_id", v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select event listener..." />
                    </SelectTrigger>
                    <SelectContent>
                      {eventListeners.filter(Boolean).map((listener) => (
                        <SelectItem key={listener!.id} value={listener!.id}>
                          {formatEventListenerLabel(listener!)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="API_KEY"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {watchedIsSecret
                      ? `Use it in API requests as {{secrets.${
                          watchedName || "NAME"
                        }}}.`
                      : `Use it in any block as {{values.${
                          watchedName || "NAME"
                        }}}.`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_secret"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 bg-muted/20">
                  <FormControl>
                    <Checkbox checked={field.value} className="size-5 rounded-full mt-0.5 border-2 data-[state=checked]:border-primary"
                      onCheckedChange={(checked) => {
                        const next = Boolean(checked);
                        field.onChange(next);
                        if (secret && secret.is_secret && !next) {
                          form.setValue("value", "");
                        }
                      }}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-medium cursor-pointer">
                      Secret value
                    </FormLabel>
                    <FormDescription className="text-xs">
                      {field.value
                        ? "Encrypted and hidden. You will not be able to see this secret after saving."
                        : "Stored as plain text and remains visible when editing."}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input
                      type={watchedIsSecret ? "password" : "text"}
                      autoComplete="off"
                      placeholder={
                        secret && secret.is_secret && secret.has_value
                          ? "Enter a new value to replace current secret"
                          : watchedIsSecret
                          ? "Enter secret value..."
                          : "Enter value..."
                      }
                      {...field}
                    />
                  </FormControl>
                  {secret && secret.has_value && watchedIsSecret && (
                    <FormDescription>
                      Leave empty to keep the current value.
                    </FormDescription>
                  )}
                  {secret && !secret.has_value && (
                    <FormDescription className="text-amber-500">
                      This placeholder currently has no value set.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <LoadingButton type="submit" loading={pending}>
                {secret
                  ? watchedIsSecret
                    ? "Save secret"
                    : "Save value"
                  : watchedIsSecret
                  ? "Create secret"
                  : "Create value"}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
