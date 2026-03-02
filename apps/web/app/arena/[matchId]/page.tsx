import { Arena } from '../../../components/arena/Arena.js';

interface Props {
  params: Promise<{ matchId: string }>;
}

export default async function ArenaPage({ params }: Props) {
  const { matchId } = await params;
  return <Arena matchId={matchId} />;
}
