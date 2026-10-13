/** Jul–Jun leave year window (no separate sessions table). */
export type LeaveSessionWindow = {
  name: string;
  startsOn: string;
  endsOn: string;
};

export function currentLeaveSession(now = new Date()): LeaveSessionWindow {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startsOn = month >= 7 ? `${year}-07-01` : `${year - 1}-07-01`;
  const endsOn = month >= 7 ? `${year + 1}-06-30` : `${year}-06-30`;
  return {
    name: `FY ${startsOn.slice(0, 4)}-${endsOn.slice(0, 4)}`,
    startsOn,
    endsOn,
  };
}
