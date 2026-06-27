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

function kickoffLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
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

const COUNTRY_CODE: Record<string, string> = {
  "Algeria": "dz", "Argentina": "ar", "Australia": "au", "Austria": "at",
  "Belgium": "be", "Bolivia": "bo", "Bosnia and Herzegovina": "ba",
  "Brazil": "br", "Cameroon": "cm", "Canada": "ca", "Cape Verde": "cv",
  "Chile": "cl", "Colombia": "co", "Costa Rica": "cr", "Croatia": "hr",
  "Cuba": "cu", "DR Congo": "cd", "Ecuador": "ec", "Egypt": "eg",
  "El Salvador": "sv", "England": "gb", "France": "fr", "Germany": "de",
  "Ghana": "gh", "Guatemala": "gt", "Honduras": "hn", "Iran": "ir",
  "Ivory Coast": "ci", "Jamaica": "jm", "Japan": "jp", "Jordan": "jo",
  "Kenya": "ke", "Mali": "ml", "Mexico": "mx", "Morocco": "ma",
  "Netherlands": "nl", "New Zealand": "nz", "Nigeria": "ng", "Norway": "no",
  "Panama": "pa", "Paraguay": "py", "Peru": "pe", "Portugal": "pt",
  "Qatar": "qa", "Saudi Arabia": "sa", "Senegal": "sn", "Serbia": "rs",
  "Slovenia": "si", "South Africa": "za", "South Korea": "kr", "Spain": "es",
  "Sweden": "se", "Switzerland": "ch", "Tanzania": "tz", "Togo": "tg",
  "Trinidad and Tobago": "tt", "Turkey": "tr", "Turkiye": "tr",
  "Ukraine": "ua", "United States": "us", "Uruguay": "uy",
  "Uzbekistan": "uz", "Venezuela": "ve",
};

function FlagIcon({ team }: { team: string }) {
  const code = COUNTRY_CODE[team];
  if (!code) return null;
  return <span className={`fi fi-${code}`} style={{ borderRadius: "2px", marginRight: "4px" }} />;
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
  const [showFinished, setShowFinished] = useState(false);

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
      }
      if (matchesResult.data) {
        const sorted = [...matchesResult.data].sort((a, b) => {
          if (a.status === "finished" && b.status !== "finished") return 1;
          if (a.status !== "finished" && b.status === "finished") return -1;
          return a.kickoff_time.localeCompare(b.kickoff_time);
        });
        setMatches(sorted);
        if (!matchesResult.data.length) {
          setMessage("Go to Admin and seed demo matches before saving predictions.");
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
              <>
                {matches
                  .filter((m) => m.status !== "finished")
                  .map((match) => {
                    const draft = drafts[match.id] ?? { home_score: "", away_score: "" };
                    const isSaved = selectedPlayerId
                      ? predictions.some((p) => p.player_id === selectedPlayerId && p.match_id === match.id)
                      : false;
                    return (
                      <article key={match.id} className={`rounded-lg border-2 bg-[#f8fbff] p-4 ${isSaved ? "border-grass" : "border-ink"}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-ocean">
                              {kickoffLabel(match.kickoff_time)}
                            </p>
                            <h3 className="mt-1 text-xl font-black">
                              <FlagIcon team={match.home_team} />{match.home_team} vs <FlagIcon team={match.away_team} />{match.away_team}
                            </h3>
                            <p className="text-sm font-semibold text-slate-600">
                              {isSaved ? "✓ Spá vistuð" : "Opið fyrir spár"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              aria-label={match.home_team}
                              className="h-16 w-24 rounded-md border-2 border-ink px-2 text-center text-2xl font-black"
                              disabled={!selectedPlayerId}
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
                            <span className="text-2xl font-black">–</span>
                            <input
                              aria-label={match.away_team}
                              className="h-16 w-24 rounded-md border-2 border-ink px-2 text-center text-2xl font-black"
                              disabled={!selectedPlayerId}
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
                          </div>
                        </div>
                        <button
                          className="mt-4 h-11 w-full rounded-md bg-grass px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
                          disabled={busy || !selectedPlayerId}
                          onClick={() => savePrediction(match)}
                          type="button"
                        >
                          {isSaved ? "Uppfæra spá" : "Vista spá"}
                        </button>
                      </article>
                    );
                  })}

                {matches.filter((m) => m.status === "finished").length > 0 && (
                  <div className="mt-2">
                    <button
                      className="w-full rounded-md border-2 border-ink bg-slate-100 px-4 py-3 text-sm font-black text-ink hover:bg-slate-200"
                      onClick={() => setShowFinished((v) => !v)}
                      type="button"
                    >
                      {showFinished ? "▲ Fela lokna leiki" : `▼ Sjá lokna leiki (${matches.filter((m) => m.status === "finished").length})`}
                    </button>
                    {showFinished && (
                      <div className="mt-3 grid gap-3">
                        {matches
                          .filter((m) => m.status === "finished")
                          .map((match) => {
                            const draft = drafts[match.id];
                            return (
                              <article key={match.id} className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 opacity-75">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                                      {kickoffLabel(match.kickoff_time)}
                                    </p>
                                    <h3 className="mt-1 text-lg font-black">
                                      <FlagIcon team={match.home_team} />{match.home_team} vs <FlagIcon team={match.away_team} />{match.away_team}
                                    </h3>
                                    <p className="text-sm font-semibold text-slate-600">
                                      {match.status === "finished"
                                        ? `Lokaniðurstaða: ${match.home_score}–${match.away_score}${draft ? ` · Spá þín: ${draft.home_score}–${draft.away_score}` : " · Engin spá"}`
                                        : draft
                                          ? `Í gangi · Spá þín: ${draft.home_score}–${draft.away_score}`
                                          : "Í gangi · Engin spá"}
                                    </p>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
