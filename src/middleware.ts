import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // oauth2-proxy with nginx auth_request sets X-Email (via --set-xauthrequest)
  const email = request.headers.get("x-email");

  // In dev mode, skip auth check if DEV_USER_ID is set
  if (!email && !process.env.DEV_USER_ID) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
