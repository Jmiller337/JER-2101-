import { ClientApp } from "@/components/ClientApp";

// Rendered on each request, so the page is sent with "no-store": after a deploy the phone always
// loads the new version instead of a copy it kept. The page is a small shell, so this costs
// almost nothing.
export const dynamic = "force-dynamic";

export default function Home() {
  return <ClientApp />;
}
