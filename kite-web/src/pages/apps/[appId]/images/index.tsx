import AppLayout from "@/components/app/AppLayout";
import { getAppShellLayout } from "@/components/app/AppShell";
import ImageList from "@/components/image/ImageList";
import { Separator } from "@/components/ui/separator";

const breadcrumbs = [
  {
    label: "Image Templates",
  },
];

export default function AppImagesPage() {
  return (
    <AppLayout title="Image Templates" breadcrumbs={breadcrumbs}>
      <div>
        <h1 className="text-lg font-semibold md:text-2xl mb-1">
          Image Templates
        </h1>
        <p className="text-muted-foreground text-sm">
          Design dynamic image cards and banners that can be populated with real
          data from commands, events, and webhooks.
        </p>
      </div>
      <Separator className="my-8" />
      <ImageList />
    </AppLayout>
  );
}

AppImagesPage.getLayout = getAppShellLayout;
