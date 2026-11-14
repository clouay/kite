import {
  CheckIcon,
  CopyPlusIcon,
  EllipsisIcon,
  ImageIcon,
  Trash2Icon,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/router";
import Link from "next/link";
import { ImageTemplate } from "@/lib/types/wire.gen";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useAppId } from "@/lib/hooks/params";
import { toast } from "sonner";
import { useImageTemplateDeleteMutation } from "@/lib/api/mutations";
import { formatDateTime } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ImageDuplicateDialog from "./ImageDuplicateDialog";

export default function ImageListEntry({
  template,
}: {
  template: ImageTemplate;
}) {
  const router = useRouter();
  const appId = useAppId();
  const deleteMutation = useImageTemplateDeleteMutation(appId);

  const remove = async () => {
    try {
      await deleteMutation.mutateAsync(template.id);
      toast.success("Image template deleted!");
    } catch (e: any) {
      toast.error(`Failed to delete image template: ${e.message || e}`);
    }
  };

  return (
    <Card className="relative">
      <div className="px-6 pt-4 sm:absolute sm:top-0 sm:right-0 sm:pt-3 sm:pr-4">
        <div className="flex items-center space-x-2">
          <CheckIcon className="h-5 w-5 text-green-500" />
          <div className="text-sm text-muted-foreground">
            {formatDateTime(new Date(template.updated_at))}
          </div>
        </div>
      </div>
      <CardHeader className="pt-3 sm:pt-6 sm:pr-48">
        <CardTitle className="text-base flex items-center space-x-2">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <div>{template.name}</div>
          <Badge variant="outline" className="text-xs font-mono font-normal">
            {template.width} × {template.height}
          </Badge>
        </CardTitle>
        <CardDescription className="text-sm">
          {template.description || "No description provided."}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex space-x-3">
        <Button size="sm" variant="outline" asChild>
          <Link
            href={{
              pathname: "/apps/[appId]/images/[imageId]",
              query: {
                appId: router.query.appId,
                imageId: template.id,
              },
            }}
          >
            Manage
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <EllipsisIcon className="h-5 w-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <ConfirmDialog
                title="Are you sure that you want to delete this image template?"
                description="This will remove the image template from your app and cannot be undone."
                onConfirm={remove}
              >
                <DropdownMenuItem
                  className="text-red-500 hover:!text-red-500"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2Icon className="h-4 w-4 mr-2" />
                  Delete Image Template
                </DropdownMenuItem>
              </ConfirmDialog>
              <ImageDuplicateDialog template={template}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <CopyPlusIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                  Duplicate Image Template
                </DropdownMenuItem>
              </ImageDuplicateDialog>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
