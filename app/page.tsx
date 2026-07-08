import { requireUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await requireUser();
  return <main>Signed in as {user.displayName}</main>;
}
