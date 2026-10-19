// NFL team colors, shared by pages that color things by team.
export type TeamStyle = { primary: string; secondary: string; text: string };

export const teamStyles: Record<string, TeamStyle> = {
  ARI: { primary: "#97233F", secondary: "#FFB612", text: "#ffffff" },
  ATL: { primary: "#A71930", secondary: "#000000", text: "#ffffff" },
  BAL: { primary: "#241773", secondary: "#9E7C0C", text: "#ffffff" },
  BUF: { primary: "#00338D", secondary: "#C60C30", text: "#ffffff" },
  CAR: { primary: "#0085CA", secondary: "#101820", text: "#ffffff" },
  CHI: { primary: "#0B162A", secondary: "#C83803", text: "#ffffff" },
  CIN: { primary: "#FB4F14", secondary: "#000000", text: "#ffffff" },
  CLE: { primary: "#311D00", secondary: "#FF3C00", text: "#ffffff" },
  DAL: { primary: "#041E42", secondary: "#869397", text: "#ffffff" },
  DEN: { primary: "#FB4F14", secondary: "#002244", text: "#ffffff" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC", text: "#ffffff" },
  GB: { primary: "#203731", secondary: "#FFB612", text: "#ffffff" },
  HOU: { primary: "#03202F", secondary: "#A71930", text: "#ffffff" },
  IND: { primary: "#002C5F", secondary: "#A2AAAD", text: "#ffffff" },
  JAX: { primary: "#006778", secondary: "#D7A22A", text: "#ffffff" },
  KC: { primary: "#E31837", secondary: "#FFB81C", text: "#ffffff" },
  LAC: { primary: "#0080C6", secondary: "#FFC20E", text: "#ffffff" },
  LAR: { primary: "#003594", secondary: "#FFA300", text: "#ffffff" },
  LV: { primary: "#000000", secondary: "#A5ACAF", text: "#ffffff" },
  MIA: { primary: "#008E97", secondary: "#FC4C02", text: "#ffffff" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F", text: "#ffffff" },
  NE: { primary: "#002244", secondary: "#C60C30", text: "#ffffff" },
  NO: { primary: "#D3BC8D", secondary: "#101820", text: "#000000" },
  NYG: { primary: "#0B2265", secondary: "#A71930", text: "#ffffff" },
  NYJ: { primary: "#125740", secondary: "#000000", text: "#ffffff" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF", text: "#ffffff" },
  PIT: { primary: "#FFB612", secondary: "#101820", text: "#000000" },
  SEA: { primary: "#002244", secondary: "#69BE28", text: "#ffffff" },
  SF: { primary: "#AA0000", secondary: "#B3995D", text: "#ffffff" },
  TB: { primary: "#D50A0A", secondary: "#34302B", text: "#ffffff" },
  TEN: { primary: "#4B92DB", secondary: "#C8102E", text: "#ffffff" },
  WAS: { primary: "#5A1414", secondary: "#FFB612", text: "#ffffff" },
};

export const getTeamStyle = (team?: string | null): TeamStyle =>
  (team && teamStyles[team]) || { primary: "#1e3a5f", secondary: "#142a47", text: "#ffffff" };
