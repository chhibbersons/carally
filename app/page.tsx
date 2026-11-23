import { redirect } from "next/navigation";
import { getViewer, homePathFor } from "@/auth/guards";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homePathFor(viewer.role) : "/login");
}
