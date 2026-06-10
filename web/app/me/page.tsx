import { redirect } from "next/navigation";

// Folded into the explorer — your tile lives on the wall now (click it to paint/edit).
export default function Me() {
  redirect("/canvas");
}
