/** The room's invite link, copied (the room page's "Copy invite link" and the palette's "Copy room link"). */
import { toast } from "@/hooks/use-toast";
import { roomPath } from "./routes";

export function copyInvite(code: string) {
  const url = `${window.location.origin}${roomPath(code)}`;
  navigator.clipboard.writeText(url).then(() => toast({ title: "Invite link copied", description: url }), () => toast({ title: "Could not copy the invite link", description: url, variant: "destructive" }));
}
