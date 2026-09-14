import { handlePreflight } from '@/lib/server/marketing-round2-preflight';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handlePreflight;
export const POST = handlePreflight;
