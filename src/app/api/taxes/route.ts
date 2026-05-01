import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const TAX_FILE_PATH = path.join(process.cwd(), 'src/lib/taxData.json');

export async function GET() {
  try {
    if (!fs.existsSync(TAX_FILE_PATH)) {
      return NextResponse.json([]);
    }
    const data = fs.readFileSync(TAX_FILE_PATH, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read tax data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    fs.writeFileSync(TAX_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to write tax data' }, { status: 500 });
  }
}
