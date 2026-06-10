import { redirect } from "next/navigation";

// Claiming happens in the explorer now — tap an open tile on the wall.
export default function Claim() {
  redirect("/canvas");
}
