import Landing from "@/components/Landing";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <Landing error={p.error?.slice(0, 500)} notice={p.notice?.slice(0, 500)} />
  );
}
