import { redirect } from "next/navigation";

/**
 * The root route sends everyone to the login page. AppShell/login then route a
 * signed-in employee on to /dashboard, so `/` is never a dead end or the
 * create-next-app starter.
 */
export default function Home() {
  redirect("/login");
}
