import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (
    ![
      "dashboard",
      "home",
      "create",
      "projects",
      "characters",
      "products",
      "brands",
      "backgrounds",
      "assets",
      "templates",
      "history",
      "settings",
    ].includes(page)
  )
    notFound();
  return <Workspace />;
}
