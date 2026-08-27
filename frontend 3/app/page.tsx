import { redirect } from "next/navigation";

// The flow always starts at the login page.
export default function Home() {
  redirect("/login");
}
