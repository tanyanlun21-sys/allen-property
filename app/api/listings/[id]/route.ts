import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 先保证 build 过（如果你之后要在这里做真实 delete logic，再加）
  return NextResponse.json({ ok: true, id: params.id });
}
