import React, { ReactNode, useState } from "react";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useAppId } from "@/lib/hooks/params";
import { useImageTemplateCreateMutation } from "@/lib/api/mutations";
import { useRouter } from "next/router";
import { toast } from "sonner";
import LoadingButton from "../common/LoadingButton";
import { TEMPLATE_PRESETS } from "@/lib/image/presets";

export const AVAILABLE_LAYOUTS = [
  {
    id: "level-card",
    label: "Level & Rank Card",
    width: 850,
    height: 280,
    group: "Starter Designs",
  },
  {
    id: "welcome-banner",
    label: "Welcome Banner",
    width: 800,
    height: 360,
    group: "Starter Designs",
  },
  {
    id: "leaderboard",
    label: "Server Leaderboard",
    width: 800,
    height: 480,
    group: "Starter Designs",
  },
  {
    id: "level-up",
    label: "Level Up Announcement",
    width: 800,
    height: 260,
    group: "Starter Designs",
  },
  {
    id: "discord-server-banner",
    label: "Discord Server Banner",
    width: 960,
    height: 540,
    group: "Discord Sizes",
  },
  {
    id: "discord-embed-card",
    label: "Discord Embed / Invite Card",
    width: 800,
    height: 450,
    group: "Discord Sizes",
  },
  {
    id: "discord-welcome-banner",
    label: "Discord Wide Welcome Banner",
    width: 1200,
    height: 400,
    group: "Discord Sizes",
  },
  {
    id: "discord-user-profile-banner",
    label: "Discord Profile Banner",
    width: 600,
    height: 240,
    group: "Discord Sizes",
  },
  {
    id: "discord-server-icon",
    label: "Discord Server Icon / Square",
    width: 512,
    height: 512,
    group: "Discord Sizes",
  },
  {
    id: "blank",
    label: "Blank Canvas",
    width: 800,
    height: 400,
    group: "Custom",
  },
];

interface FormFields {
  name: string;
  preset: string;
  description: string;
}

export default function ImageCreateDialog({
  children,
  onCreated,
  noRedirect,
}: {
  children: ReactNode;
  onCreated?: (id: string) => void;
  noRedirect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const appId = useAppId();
  const router = useRouter();
  const createMutation = useImageTemplateCreateMutation(appId);

  const form = useForm<FormFields>({
    defaultValues: {
      name: "",
      preset: "level-card",
      description: "",
    },
  });

  const onSubmit = (data: FormFields) => {
    if (createMutation.isPending) return;

    const selectedLayout = AVAILABLE_LAYOUTS.find((l) => l.id === data.preset);
    const selectedPreset = TEMPLATE_PRESETS.find((p) => p.id === data.preset);
    const width = selectedLayout
      ? selectedLayout.width
      : selectedPreset
      ? selectedPreset.width
      : 800;
    const height = selectedLayout
      ? selectedLayout.height
      : selectedPreset
      ? selectedPreset.height
      : 400;

    const templateData = selectedPreset
      ? selectedPreset.data
      : {
          layers: [
            {
              id: "bg-1",
              name: "Background",
              type: "background",
              visible: true,
              x: 0,
              y: 0,
              width,
              height,
              opacity: 1,
              color: "#1e1f22",
              border_radius: 12,
            },
          ],
        };
    const sampleData = selectedPreset ? selectedPreset.sample_data : {};

    createMutation.mutate(
      {
        name: data.name.trim(),
        description: data.description.trim() || null,
        width,
        height,
        format: "png",
        data: templateData,
        sample_data: sampleData,
      },
      {
        onSuccess(res) {
          if (res.success) {
            toast.success("Image template created!");
            setOpen(false);
            form.reset();

            if (onCreated) {
              onCreated(res.data.id);
            }
            if (!noRedirect) {
              router.push({
                pathname: "/apps/[appId]/images/[imageId]",
                query: { appId, imageId: res.data.id },
              });
            }
          } else {
            toast.error(`Failed to create template: ${res.error.message}`);
          }
        },
        onError(err: any) {
          toast.error(`Failed to create template: ${err.message || err}`);
        },
      }
    );
  };

  const groups = Array.from(new Set(AVAILABLE_LAYOUTS.map((l) => l.group)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create image template</DialogTitle>
          <DialogDescription>
            Create an image template that can be generated and sent in your app.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="e.g. Server Rank Card"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="preset"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Layout & canvas size</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a layout" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {groups.map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {AVAILABLE_LAYOUTS.filter((l) => l.group === group).map(
                            (l) => (
                              <SelectItem key={l.id} value={l.id}>
                                <span>{l.label}</span>
                                <span className="text-muted-foreground font-mono ml-2 text-xs">
                                  ({l.width} × {l.height})
                                </span>
                              </SelectItem>
                            )
                          )}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Optional description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <LoadingButton type="submit" loading={createMutation.isPending}>
                Create image template
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
