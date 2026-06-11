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

function flag(code: string) {
  return code
    .toUpperCase()
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

const teamFlags: Record<string, string> = {
  Algeria: flag("DZ"),
  Argentina: flag("AR"),
  Australia: flag("AU"),
  Austria: flag("AT"),
  Belgium: flag("BE"),
  "Bosnia and Herzegovina": flag("BA"),
  Brazil: flag("BR"),
  Canada: flag("CA"),
  "Cape Verde": flag("CV"),
  Colombia: flag("CO"),
  Croatia: flag("HR"),
  Curacao: flag("CW"),
  Czechia: flag("CZ"),
  "DR Congo": flag("CD"),
  Ecuador: flag("EC"),
  Egypt: flag("EG"),
  England: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  France: flag("FR"),
  Germany: flag("DE"),
  Ghana: flag("GH"),
  Haiti: flag("HT"),
  Iran: flag("IR"),
  Iraq: flag("IQ"),
  "Ivory Coast": flag("CI"),
  Japan: flag("JP"),
  Jordan: flag("JO"),
  "Korea Republic": flag("KR"),
  Mexico: flag("MX"),
  Morocco: flag("MA"),
  Netherlands: flag("NL"),
  "New Zealand": flag("NZ"),
  Norway: flag("NO"),
  Panama: flag("PA"),
  Paraguay: flag("PY"),
  Portugal: flag("PT"),
  Qatar: flag("QA"),
  "Saudi Arabia": flag("SA"),
  Scotland: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  Senegal: flag("SN"),
  "South Africa": flag("ZA"),
  Spain: flag("ES"),
  Sweden: flag("SE"),
  Switzerland: flag("CH"),
  Tunisia: flag("TN"),
  Turkiye: flag("TR"),
  "United States": flag("US"),
  Uruguay: flag("UY"),
  Uzbekistan: flag("UZ")
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
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-3xl leading-none" aria-hidden="true">
        {teamFlags[name] ?? "\u{1F3F3}\uFE0F"}
      </span>
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
        if (matchesResult.data.length) {
          setMatches(matchesResult.data);
        } else {
          const seededMatches = await seedDemoMatches();
          if (seededMatches.error) {
            setMessage(seededMatches.error.message);
            return;
          }
          if (seededMatches.data) {
            setMatches(seededMatches.data);
            setMessage("Demo matches were added automatically.");
          }
        }
      }
      if (predictionsResult.data) {
        setPredictions(predictionsResult.data);
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

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
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

          <div className="mt-4 grid gap-4">
            {matches.length === 0 ? (
              <div className="rounded-lg border-2 border-ink bg-[#f8fbff] p-5 font-bold text-slate-700">
                No matches have been seeded yet.
              </div>
            ) : (
              matches.map((match) => {
                const locked = new Date(match.kickoff_time).getTime() <= Date.now();
                const draft = drafts[match.id] ?? { home_score: "", away_score: "" };

                return (
                  <article key={match.id} className="overflow-hidden rounded-lg border-2 border-ink bg-[#f8fbff]">
                    <div className="border-b-2 border-ink bg-white px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-wide text-ocean">
                        {kickoffLabel(match.kickoff_time)} - Iceland time
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        {match.status === "finished" && match.home_score !== null && match.away_score !== null
                          ? `Final score: ${match.home_score}-${match.away_score}`
                          : locked
                            ? "Locked"
                            : "Open for predictions"}
                      </p>
                    </div>
                    <div className="grid gap-4 p-4">
                      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                        <div className="min-w-0 rounded-md bg-white p-3 shadow-soft">
                          <p className="text-lg font-black">
                            <TeamBadge name={match.home_team} />
                          </p>
                        </div>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-sun text-sm font-black">
                          VS
                        </div>
                        <div className="min-w-0 rounded-md bg-white p-3 shadow-soft">
                          <p className="text-lg font-black">
                            <TeamBadge name={match.away_team} />
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                        <label className="text-xs font-black">
                          {match.home_team}
                          <input
                            className="mt-1 h-14 w-full rounded-md border-2 border-ink px-2 text-center text-2xl font-black"
                            disabled={locked || !selectedPlayerId}
                            min={0}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [match.id]: { ...draft, home_score: event.target.value }
                              }))
                            }
                            type="number"
                            value={draft.home_score}
                          />
                        </label>
                        <span className="pb-4 text-xl font-black">-</span>
                        <label className="text-xs font-black">
                          {match.away_team}
                          <input
                            className="mt-1 h-14 w-full rounded-md border-2 border-ink px-2 text-center text-2xl font-black"
                            disabled={locked || !selectedPlayerId}
                            min={0}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [match.id]: { ...draft, away_score: event.target.value }
                              }))
                            }
                            type="number"
                            value={draft.away_score}
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      className="mx-4 mb-4 h-11 w-[calc(100%-2rem)] rounded-md bg-grass px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
                      disabled={busy || locked || !selectedPlayerId}
                      onClick={() => savePrediction(match)}
                      type="button"
                    >
                      Save prediction
                    </button>
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
