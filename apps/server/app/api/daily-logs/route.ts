import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  return NextResponse.json({
    logs: [],
    message: "Mock: 无数据，后续接入 DB",
    params: { startDate, endDate },
  });
}
