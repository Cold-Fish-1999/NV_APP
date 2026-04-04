import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    profile: null,
    message: "Mock: 无数据，后续接入 DB",
  });
}
