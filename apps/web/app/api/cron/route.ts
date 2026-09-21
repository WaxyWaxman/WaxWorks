// The jobs drain (A-7) lands at M5 D with its table. Until then this segment
// exists so the tree has architecture §7's shape; it does no work.
export function GET() {
  return new Response(null, { status: 404 });
}
