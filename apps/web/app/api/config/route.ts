export async function GET() {
  return Response.json({
    gameServiceUrl: process.env['GAME_SERVICE_URL'] ?? 'http://localhost:3002',
  });
}
