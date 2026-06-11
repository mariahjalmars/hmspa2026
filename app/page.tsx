"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoMatches } from "@/lib/demo-data";
import { calculatePoints } from "@/lib/scoring";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Match, Player, Prediction } from "@/lib/types";

type PredictionDraft = {
  home_score: string;
  away_score: string;
};

const avatarBucket = "avatars";
const officialScheduleKey = demoMatches.map((match) => `${match.home_team}|${match.away_team}|${match.kickoff_time}`).join("~~");

const teamFlagCodes: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia and Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  Curacao: "cw",
  Czechia: "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  "Korea Republic": "kr",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkiye: "tr",
  "United States": "us",
  Uruguay: "uy",
  Uzbekistan: "uz"
};

async function seedDemoMatches() {
  if (!supabase) {
    return { data: null, error: null };
  }

  return supabase
    .from("matches")
    .upsert(
      demoMatches.map(({ home_team, away_team, kickoff_time, status, home_score, away_score }) => ({
        home_team,
        away_team,
        kickoff_time,
        status,
        home_score,
        away_score
      })),
      { onConflict: "home_team,away_team,kickoff_time" }
    )
    .select()
    .order("kickoff_time", { ascending: true });
}

async function resetOfficialSchedule() {
  if (!supabase) {
    return { data: null, error: null };
  }

  const { error: predictionDeleteError } = await supabase
    .from("predictions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (predictionDeleteError) {
    return { data: null, error: predictionDeleteError };
  }

  const { error: matchDeleteError } = await supabase
    .from("matches")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (matchDeleteError) {
    return { data: null, error: matchDeleteError };
  }

  return seedDemoMatches();
}

function scheduleKey(matches: Match[]) {
  return matches.map((match) => `${match.home_team}|${match.away_team}|${match.kickoff_time}`).join("~~");
}

function hasOfficialSchedule(matches: Match[]) {
  return matches.length === demoMatches.length && scheduleKey(matches) === officialScheduleKey;
}

function kickoffLabel(value: string) {
  return new Intl.DateTimeFormat("is-IS", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Atlantic/Reykjavik"
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function TeamBadge({ name }: { name: string }) {
  const code = teamFlagCodes[name];

  return (
    <span className="flex min-w-0 items-center gap-3">
      {code ? (
        <span className="h-7 w-10 shrink-0 overflow-hidden rounded-sm border border-slate-300 bg-white shadow-sm">
          <span className={`fi fi-${code} block h-full w-full`} />
        </span>
      ) : (
        <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-slate-100 text-xs font-black">
          ?
        </span>
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>(demoMatches);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PredictionDraft>>({});
  const [message, setMessage] = useState("Add your player to join the game.");
  const [busy, setBusy] = useState(false);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId);

  const leaderboard = useMemo(() => {
    return players
      .map((player) => ({
        ...player,
        total_points: predictions
          .filter((prediction) => prediction.player_id === player.id)
          .reduce((sum, prediction) => sum + prediction.points, 0)
      }))
      .sort((a, b) => b.total_points - a.total_points || a.name.localeCompare(b.name));
  }, [players, predictions]);

  useEffect(() => {
    async function loadGame() {
      if (!supabase) {
        setMessage("Supabase is not connected yet. Add keys to .env.local to save the game.");
        return;
      }

      const [playersResult, matchesResult, predictionsResult] = await Promise.all([
        supabase.from("players").select("*").order("created_at", { ascending: true }),
        supabase.from("matches").select("*").order("kickoff_time", { ascending: true }),
        supabase.from("predictions").select("*")
      ]);

      const loadError = playersResult.error || matchesResult.error || predictionsResult.error;
      if (loadError) {
        setMessage(loadError.message);
        return;
      }

      if (playersResult.data) {
        setPlayers(playersResult.data);
        setSelectedPlayerId(playersResult.data[0]?.id ?? "");
      }

      if (matchesResult.data) {
        if (!matchesResult.data.length || !hasOfficialSchedule(matchesResult.data)) {
          setMessage("Updating match schedule...");
          const seededMatches = await resetOfficialSchedule();
          if (seededMatches.error) {
            setMessage(seededMatches.error.message);
            return;
          }
          const nextMatches = seededMatches.data ?? [];
          setMatches(nextMatches);
          setPredictions([]);
          setMessage("Match schedule updated with the right teams.");
        } else {
          setMatches(matchesResult.data);
          if (predictionsResult.data) {
            setPredictions(predictionsResult.data);
          }
        }
      }
    }

    loadGame();
  }, []);

  useEffect(() => {
    if (!selectedPlayerId) {
      setDrafts({});
      return;
    }

    const nextDrafts: Record<string, PredictionDraft> = {};
    for (const prediction of predictions.filter((item) => item.player_id === selectedPlayerId)) {
      nextDrafts[prediction.match_id] = {
        home_score: String(prediction.home_score),
        away_score: String(prediction.away_score)
      };
    }
    setDrafts(nextDrafts);
  }, [predictions, selectedPlayerId]);

  async function createPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playerName.trim()) {
      setMessage("A player needs a name.");
      return;
    }
    if (!supabase) {
      setMessage("Connect Supabase first, then player profiles can be saved.");
      return;
    }

    setBusy(true);
    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop() || "png";
        const filePath = `${crypto.randomUUID()}.${fileExt}`;
        const upload = await supabase.storage.from(avatarBucket).upload(filePath, avatarFile);
        if (upload.error) {
          throw upload.error;
        }
        avatarUrl = supabase.storage.from(avatarBucket).getPublicUrl(filePath).data.publicUrl;
      }

      const { data, error } = await supabase
        .from("players")
        .insert({ name: playerName.trim(), avatar_url: avatarUrl })
        .select()
        .single();

      if (error) {
        throw error;
      }

      setPlayers((current) => [...current, data]);
      setSelectedPlayerId(data.id);
      setPlayerName("");
      setAvatarFile(null);
      setMessage(`${data.name} is ready to predict.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create player.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrediction(match: Match) {
    if (!selectedPlayerId) {
      setMessage("Choose or create a player first.");
      return;
    }
    if (new Date(match.kickoff_time).getTime() <= Date.now()) {
      setMessage("This prediction is locked because kickoff has passed.");
      return;
    }
    if (!supabase) {
      setMessage("Connect Supabase first, then predictions can be saved.");
      return;
    }

    const draft = drafts[match.id];
    if (!draft || draft.home_score === "" || draft.away_score === "") {
      setMessage("Add both scores before saving.");
      return;
    }

    const homeScore = Number(draft?.home_score);
    const awayScore = Number(draft?.away_score);
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      setMessage("Use whole numbers for both scores.");
      return;
    }

    const points = calculatePoints(homeScore, awayScore, match.home_score, match.away_score);
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("predictions")
        .upsert(
          {
            player_id: selectedPlayerId,
            match_id: match.id,
            home_score: homeScore,
            away_score: awayScore,
            points
          },
          { onConflict: "player_id,match_id" }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      setPredictions((current) => [
        ...current.filter(
          (prediction) => !(prediction.player_id === selectedPlayerId && prediction.match_id === match.id)
        ),
        data
      ]);
      setMessage("Prediction saved. Tiny trophy energy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save prediction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border-4 border-ink bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-berry">Private World Cup 2026</p>
          <h1 className="mt-1 text-4xl font-black text-ink sm:text-5xl">HM Spaa</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-slate-700">
            Pick scores, lock them before kickoff, and climb the family leaderboard.
          </p>
        </div>
        <a
          className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-4 text-sm font-black text-white"
          href="/admin"
        >
          Admin
        </a>
      </header>

      <section className="rounded-lg border-4 border-ink bg-sun p-4 text-sm font-black text-ink">{message}</section>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="flex flex-col gap-5">
          <section className="rounded-lg border-4 border-ink bg-white p-4 shadow-soft">
            <h2 className="text-2xl font-black">Player</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={createPlayer}>
              <label className="text-sm font-black">
                Name
                <input
                  className="mt-1 h-12 w-full rounded-md border-2 border-ink px-3 font-semibold"
                  maxLength={40}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Alex"
                  value={playerName}
                />
              </label>
              <label className="text-sm font-black">
                Avatar
                <input
                  accept="image/*"
                  className="mt-1 w-full rounded-md border-2 border-dashed border-ink bg-slate-50 p-3 text-sm"
                  onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              <button
                className="h-12 rounded-md bg-berry px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={busy || !isSupabaseConfigured}
                type="submit"
              >
                Create player
              </button>
            </form>

            <label className="mt-5 block text-sm font-black">
              Playing as
              <select
                className="mt-1 h-12 w-full rounded-md border-2 border-ink bg-white px-3 font-semibold"
                onChange={(event) => setSelectedPlayerId(event.target.value)}
                value={selectedPlayerId}
              >
                <option value="">Choose player</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="rounded-lg border-4 border-ink bg-white p-4 shadow-soft">
            <h2 className="text-2xl font-black">Leaderboard</h2>
            <div className="mt-4 flex flex-col gap-3">
              {leaderboard.length === 0 ? (
                <p className="text-sm font-semibold text-slate-600">No players yet.</p>
              ) : (
                leaderboard.map((player, index) => (
                  <div key={player.id} className="flex items-center gap-3 rounded-md bg-slate-100 p-3">
                    <span className="w-6 text-center text-lg font-black">{index + 1}</span>
                    {player.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="h-12 w-12 rounded-full object-cover" src={player.avatar_url} />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ocean font-black text-white">
                        {initials(player.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{player.name}</p>
                      <p className="text-sm font-semibold text-slate-600">{player.total_points} points</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="rounded-lg border-4 border-ink bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">Matches</h2>
              <p className="text-sm font-semibold text-slate-600">
                {selectedPlayer ? `Predictions for ${selectedPlayer.name}` : "Choose a player to start predicting."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {matches.length === 0 ? (
              <div className="rounded-lg border-2 border-ink bg-[#f8fbff] p-5 font-bold text-slate-700">
                No matches have been seeded yet.
              </div>
            ) : (
              matches.map((match) => {
                const locked = new Date(match.kickoff_time).getTime() <= Date.now();
                const draft = drafts[match.id] ?? { home_score: "", away_score: "" };

                return (
                  <article key={match.id} className="rounded-md border-2 border-ink bg-white p-3">
                    <div className="grid gap-3 lg:grid-cols-[135px_minmax(0,1fr)_190px_78px] lg:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-ocean">
                          {kickoffLabel(match.kickoff_time)}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">Iceland time</p>
                      </div>

                      <div className="grid gap-1.5">
                        <div className="rounded-md bg-slate-50 px-3 py-2 text-base font-black">
                          <TeamBadge name={match.home_team} />
                        </div>
                        <div className="rounded-md bg-slate-50 px-3 py-2 text-base font-black">
                          <TeamBadge name={match.away_team} />
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <input
                          aria-label={`${match.home_team} score`}
                          className="h-11 w-full rounded-md border-2 border-ink px-2 text-center text-xl font-black"
                          disabled={locked || !selectedPlayerId}
                          min={0}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [match.id]: { ...draft, home_score: event.target.value }
                            }))
                          }
                          placeholder="0"
                          type="number"
                          value={draft.home_score}
                        />
                        <span className="text-lg font-black">-</span>
                        <input
                          aria-label={`${match.away_team} score`}
                          className="h-11 w-full rounded-md border-2 border-ink px-2 text-center text-xl font-black"
                          disabled={locked || !selectedPlayerId}
                          min={0}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [match.id]: { ...draft, away_score: event.target.value }
                            }))
                          }
                          placeholder="0"
                          type="number"
                          value={draft.away_score}
                        />
                      </div>

                      <button
                        className="h-10 rounded-md bg-grass px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={busy || locked || !selectedPlayerId}
                        onClick={() => savePrediction(match)}
                        type="button"
                      >
                        Save
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
