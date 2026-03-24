import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const email = request.headers.get("x-forwarded-email");

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
