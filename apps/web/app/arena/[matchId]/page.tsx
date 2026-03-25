import { Arena } from '../../../components/arena/Arena';

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ spectate?: string }>;
}

export default async function ArenaPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const { spectate } = await searchParams;
  return <Arena matchId={matchId} spectate={spectate === 'true'} />;
}
