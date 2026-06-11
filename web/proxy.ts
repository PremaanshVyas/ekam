import { NextResponse, type NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Malformed share links get a true 404 status. The page's own notFound() can't set
// one: the root loading.tsx streams a 200 before the tile query resolves, so crawlers
// would index garbage URLs as soft 404s. Rewriting to an unmatched path renders the
// global not-found page with a real 404.
export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2] ?? "";
  if (!UUID.test(id)) return NextResponse.rewrite(new URL("/__404", request.url));
  return NextResponse.next();
}

export const config = { matcher: "/t/:id" };
