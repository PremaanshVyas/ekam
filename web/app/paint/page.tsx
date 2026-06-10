import { redirect } from "next/navigation";

// Painting happens in the explorer's studio panel now (click your tile → paint/edit).
export default function Paint() {
  redirect("/canvas");
}
