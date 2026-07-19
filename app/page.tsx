import { requireMember, canCreateInvites } from "@/lib/auth/access";
import { listDocuments } from "@/lib/data/documents";
import { listMyInvites } from "@/lib/data/invites";
import { ReadingSurface } from "@/components/ReadingSurface";

// Home = the reading surface with no document open: the library drawer starts
// open so you pick a text or add one. No separate catalog screen (the drawer is
// the catalog).
export default async function Home() {
  const user = await requireMember();
  const canInvite = canCreateInvites(user);
  const [docs, invites] = await Promise.all([
    listDocuments(),
    canInvite ? listMyInvites(user.id) : Promise.resolve([]),
  ]);
  return (
    <ReadingSurface
      canEdit
      docs={docs.map((d) => ({
        id: d.id,
        title: d.title,
        author: d.author,
        paragraphs: d.nodeCount,
        notes: d.highlightCount + d.noteCount,
      }))}
      canInvite={canInvite}
      invites={invites}
    />
  );
}
