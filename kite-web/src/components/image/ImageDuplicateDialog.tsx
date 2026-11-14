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
import { ReactNode, useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import LoadingButton from "@/components/common/LoadingButton";
import { useAppId } from "@/lib/hooks/params";
import { useImageTemplateCreateMutation } from "@/lib/api/mutations";
import { ImageTemplate } from "@/lib/types/wire.gen";
import { Button } from "@/components/ui/button";

interface FormFields {
  name: string;
  description: string;
}

export default function ImageDuplicateDialog({
  children,
  template,
  onCreated,
}: {
  children: ReactNode;
  template: ImageTemplate;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const appId = useAppId();
  const createMutation = useImageTemplateCreateMutation(appId);

  const form = useForm<FormFields>({
    defaultValues: {
      name: `${template.name} (Copy)`,
      description: template.description || "",
    },
  });

  const onSubmit = async (values: FormFields) => {
    try {
      const res = await createMutation.mutateAsync({
        name: values.name.trim(),
        description: values.description.trim() || null,
        width: template.width,
        height: template.height,
        format: template.format,
        data: template.data,
        sample_data: template.sample_data || {},
      });
      if (res.success) {
        toast.success("Image template duplicated!");
        setOpen(false);
        onCreated?.(res.data.id);
      } else {
        toast.error(`Failed to duplicate: ${res.error.message}`);
      }
    } catch (e: any) {
      toast.error(`Failed to duplicate: ${e.message || e}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate Image Template</DialogTitle>
          <DialogDescription>
            Create a copy of &ldquo;{template.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Template name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={createMutation.isPending}
              >
                Duplicate
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
