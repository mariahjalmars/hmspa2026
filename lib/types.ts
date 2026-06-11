export type MatchStatus = "scheduled" | "finished";

export type Player = {
  id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
  created_at?: string;
};

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
};

export type Prediction = {
  id: string;
  player_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  points: number;
};
