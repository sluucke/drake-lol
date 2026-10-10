import type { ChampSelectSession } from './champSelect';

export interface MapSideInfo {
  side: string;
  label: string;
  color: string;
}

export function readMapSide(session: ChampSelectSession | null | undefined): MapSideInfo {
  const empty: MapSideInfo = { side: '', label: '', color: '' };
  if (!session || !Array.isArray(session.myTeam) || !session.myTeam.length) {
    return empty;
  }

  for (const player of session.myTeam) {
    const team = Number(player?.team);
    if (team === 1 || team === 100) {
      return { side: 'BLUE', label: 'Blue Side', color: 'blue' };
    }
    if (team === 2 || team === 200) {
      return { side: 'RED', label: 'Red Side', color: 'red' };
    }
  }

  const firstCell: unknown = session.myTeam[0]?.cellId;
  if (firstCell !== undefined && firstCell !== null && firstCell !== '') {
    const cellId = Number(firstCell);
    if (cellId >= 0 && cellId < 5) {
      return { side: 'BLUE', label: 'Blue Side', color: 'blue' };
    }
    if (cellId >= 5 && cellId < 10) {
      return { side: 'RED', label: 'Red Side', color: 'red' };
    }
  }

  return empty;
}

export function formatMapSideBadge(sideInfo: MapSideInfo | null | undefined): string {
  if (!sideInfo || !sideInfo.side || !sideInfo.label || !sideInfo.color) {
    return '';
  }
  return `<span class="drake-map-side is-${sideInfo.color}">${sideInfo.label}</span>`;
}
