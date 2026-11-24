import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "XSCENE — AI Video Prompt Workspace",
  description:
    "Plan scenes, organize your references and build ready-to-use AI video prompts.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <base href="/" />
        <link rel="icon" href="/assets/images/xscene-mark.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
