"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { demoMatches } from "@/lib/demo-data";
import { calculatePoints } from "@/lib/scoring";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Match, Prediction } from "@/lib/types";

type MatchDraft = {
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: "scheduled" | "finished";
  home_score: string;
  away_score: string;
};

type PlayerIdRow = {
  id: string;
};

function toLocalInputValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
  return new Date(value).toISOString();
}

function draftFromMatch(match: Match): MatchDraft {
  return {
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_time: toLocalInputValue(match.kickoff_time),
    status: match.status,
    home_score: match.home_score === null ? "" : String(match.home_score),
    away_score: match.away_score === null ? "" : String(match.away_score)
  };
}

export default function AdminPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MatchDraft>>({});
  const [message, setMessage] = useState("Admin controls for match results.");
  const [busy, setBusy] = useState(false);
  const [showFinishedAdmin, setShowFinishedAdmin] = useState(false);

  useEffect(() => {
    async function loadMatches() {
      if (!supabase) {
        setMatches(demoMatches);
        setDrafts(Object.fromEntries(demoMatches.map((match) => [match.id, draftFromMatch(match)])));
        setMessage("Supabase is not connected yet. Add keys to .env.local to use admin saves.");
        return;
      }

      const { data, error } = await supabase.from("matches").select("*").order("kickoff_time", { ascending: true });
      if (error) {
        setMessage(error.message);
        return;
      }

      const nextMatches = data.length ? data : [];
      setMatches(nextMatches);
      setDrafts(Object.fromEntries(nextMatches.map((match) => [match.id, draftFromMatch(match)])));
      if (!data.length) {
        setMessage("No matches yet. Seed demo matches to get started.");
      }
    }

    loadMatches();
  }, []);

  async function seedMatches() {
    if (!supabase) {
      setMessage("Connect Supabase before seeding matches.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase
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
        .order("kickoff_time", { ascending: false });

      if (error) {
        throw error;
      }
      setMatches(data);
      setDrafts(Object.fromEntries(data.map((match) => [match.id, draftFromMatch(match)])));
      setMessage("Demo matches synced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not seed matches.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMatch(match: Match) {
    if (!supabase) {
      setMessage("Connect Supabase before saving match results.");
      return;
    }

    const draft = drafts[match.id];
    if (!draft.home_team.trim() || !draft.away_team.trim()) {
      setMessage("Both teams need names.");
      return;
    }
    if (!draft.kickoff_time) {
      setMessage("Kickoff time is required.");
      return;
    }

    const homeScore = draft.home_score === "" ? null : Number(draft.home_score);
    const awayScore = draft.away_score === "" ? null : Number(draft.away_score);
    if (
      (homeScore !== null && (!Number.isInteger(homeScore) || homeScore < 0)) ||
      (awayScore !== null && (!Number.isInteger(awayScore) || awayScore < 0))
    ) {
      setMessage("Scores must be whole numbers.");
      return;
    }
    if (draft.status === "finished" && (homeScore === null || awayScore === null)) {
      setMessage("Finished matches need both final scores.");
      return;
    }

    // Auto-finish past matches that have scores
    const isPast = new Date(fromLocalInputValue(draft.kickoff_time)).getTime() <= Date.now();
    const effectiveStatus = isPast && homeScore !== null && awayScore !== null ? "finished" : draft.status;

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("matches")
        .update({
          home_team: draft.home_team.trim(),
          away_team: draft.away_team.trim(),
          kickoff_time: fromLocalInputValue(draft.kickoff_time),
          status: effectiveStatus,
          home_score: homeScore,
          away_score: awayScore
        })
        .eq("id", match.id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      setMatches((current) => current.map((item) => (item.id === match.id ? data : item)));
      setDrafts((current) => ({ ...current, [match.id]: draftFromMatch(data) }));
      setMessage("Match saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save match.");
    } finally {
      setBusy(false);
    }
  }

  async function fetchResults() {
    if (!supabase) {
      setMessage("Connect Supabase before fetching results.");
      return;
    }

    setBusy(true);
    try {
      const espnResults: Record<string, { homeScore: number; awayScore: number }> = {};
      const today = new Date();

      for (let i = 0; i < 20; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`
        );
        const data = await res.json();
        if (!data.events) continue;

        for (const event of data.events) {
          if (event.status?.type?.state !== "post") continue;
          const comp = event.competitions?.[0];
          if (!comp) continue;
          const homeC = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
          const awayC = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");
          if (!homeC || !awayC) continue;
          const key = `${homeC.team.displayName}|${awayC.team.displayName}`;
          espnResults[key] = {
            homeScore: parseInt(homeC.score) || 0,
            awayScore: parseInt(awayC.score) || 0
          };
        }
      }

      if (Object.keys(espnResults).length === 0) {
        setMessage("No finished matches found from ESPN.");
        return;
      }

      let updated = 0;
      const updatedMatches: Match[] = [];

      for (const match of matches) {
        if (match.home_score !== null) continue; // already has scores

        const key1 = `${match.home_team}|${match.away_team}`;
        const key2 = `${match.away_team}|${match.home_team}`;

        let homeScore: number | null = null;
        let awayScore: number | null = null;

        if (espnResults[key1]) {
          homeScore = espnResults[key1].homeScore;
          awayScore = espnResults[key1].awayScore;
        } else if (espnResults[key2]) {
          homeScore = espnResults[key2].awayScore;
          awayScore = espnResults[key2].homeScore;
        }

        if (homeScore === null) continue;

        const { data, error } = await supabase
          .from("matches")
          .update({ home_score: homeScore, away_score: awayScore, status: "finished" })
          .eq("id", match.id)
          .select()
          .single();

        if (!error && data) {
          updatedMatches.push(data);
          updated++;
        }
      }

      if (updated > 0) {
        setMatches((current) =>
          current
            .map((m) => updatedMatches.find((u) => u.id === m.id) || m)
            .sort((a, b) => b.kickoff_time.localeCompare(a.kickoff_time))
        );
        setDrafts((current) => {
          const next = { ...current };
          for (const m of updatedMatches) next[m.id] = draftFromMatch(m);
          return next;
        });
        setMessage(`Updated ${updated} match${updated === 1 ? "" : "es"} from ESPN.`);
      } else {
        setMessage("No new results to update — all matches may already have scores.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not fetch results from ESPN.");
    } finally {
      setBusy(false);
    }
  }

  async function recalculatePoints() {
    if (!supabase) {
      setMessage("Connect Supabase before recalculating points.");
      return;
    }

    setBusy(true);
    try {
      const [
        { data: matchData, error: matchError },
        { data: predictionData, error: predictionError },
        { data: playerData, error: playerError }
      ] = await Promise.all([
        supabase.from("matches").select("*"),
        supabase.from("predictions").select("*"),
        supabase.from("players").select("id")
      ]);

      if (matchError) {
        throw matchError;
      }
      if (predictionError) {
        throw predictionError;
      }
      if (playerError) {
        throw playerError;
      }

      const updates = (predictionData as Prediction[]).map((prediction) => {
        const match = (matchData as Match[]).find((item) => item.id === prediction.match_id);
        return {
          id: prediction.id,
          player_id: prediction.player_id,
          match_id: prediction.match_id,
          home_score: prediction.home_score,
          away_score: prediction.away_score,
          points: match
            ? calculatePoints(prediction.home_score, prediction.away_score, match.home_score, match.away_score)
            : prediction.points
        };
      });

      if (updates.length) {
        const { error } = await supabase.from("predictions").upsert(updates);
        if (error) {
          throw error;
        }
      }

      const totals = updates.reduce<Record<string, number>>((acc, prediction) => {
        acc[prediction.player_id] = (acc[prediction.player_id] ?? 0) + prediction.points;
        return acc;
      }, {});

      const client = supabase;
      const playerUpdates = await Promise.all(
        (playerData as PlayerIdRow[]).map((player) =>
          client.from("players").update({ total_points: totals[player.id] ?? 0 }).eq("id", player.id)
        )
      );
      const playerUpdateError = playerUpdates.find((result) => result.error)?.error;
      if (playerUpdateError) {
        throw playerUpdateError;
      }

      const sortedMatches = (matchData as Match[]).sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
      setMatches(sortedMatches);
      setDrafts(Object.fromEntries(sortedMatches.map((match) => [match.id, draftFromMatch(match)])));
      setMessage(`Recalculated ${updates.length} predictions.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not recalculate points.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="rounded-lg border-4 border-ink bg-white p-5 shadow-soft">
        <Link className="text-sm font-black text-ocean" href="/">
          Back to game
        </Link>
        <h1 className="mt-2 text-4xl font-black">Admin</h1>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Add demo matches, enter final scores, and refresh prediction points.
        </p>
      </header>

      <section className="rounded-lg border-4 border-ink bg-sun p-4 text-sm font-black text-ink">{message}</section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className="h-12 rounded-md bg-ocean px-4 font-black text-white disabled:bg-slate-400"
          disabled={busy || !isSupabaseConfigured}
          onClick={seedMatches}
          type="button"
        >
          Seed demo matches
        </button>
        <button
          className="h-12 rounded-md bg-grass px-4 font-black text-white disabled:bg-slate-400"
          disabled={busy || !isSupabaseConfigured}
          onClick={fetchResults}
          type="button"
        >
          Fetch results from ESPN
        </button>
        <button
          className="h-12 rounded-md bg-berry px-4 font-black text-white disabled:bg-slate-400"
          disabled={busy || !isSupabaseConfigured}
          onClick={recalculatePoints}
          type="button"
        >
          Recalculate points
        </button>
      </div>

      <section className="grid gap-4">
        {matches.length === 0 ? (
          <div className="rounded-lg border-4 border-ink bg-white p-5 font-bold shadow-soft">
            No matches yet. Seed the demo schedule first.
          </div>
        ) : (
          <>
            {/* Pending matches — kickoff in the future */}
            {matches
              .filter((m) => new Date(m.kickoff_time).getTime() > Date.now())
              .map((match) => {
                const draft = drafts[match.id];
                if (!draft) return null;
                return (
                  <article key={match.id} className="rounded-lg border-4 border-ink bg-white p-4 shadow-soft">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-black">
                        Home team
                        <input
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, home_team: event.target.value } }))
                          }
                          value={draft.home_team}
                        />
                      </label>
                      <label className="text-sm font-black">
                        Away team
                        <input
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, away_team: event.target.value } }))
                          }
                          value={draft.away_team}
                        />
                      </label>
                      <label className="text-sm font-black">
                        Kickoff
                        <input
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, kickoff_time: event.target.value } }))
                          }
                          type="datetime-local"
                          value={draft.kickoff_time}
                        />
                      </label>
                      <label className="text-sm font-black">
                        Status
                        <select
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink bg-white px-3 font-semibold"
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, status: event.target.value as MatchDraft["status"] } }))
                          }
                          value={draft.status}
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="finished">Finished</option>
                        </select>
                      </label>
                      <label className="text-sm font-black">
                        Home score
                        <input
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                          min={0}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, home_score: event.target.value } }))
                          }
                          type="number"
                          value={draft.home_score}
                        />
                      </label>
                      <label className="text-sm font-black">
                        Away score
                        <input
                          className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                          min={0}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [match.id]: { ...draft, away_score: event.target.value } }))
                          }
                          type="number"
                          value={draft.away_score}
                        />
                      </label>
                    </div>
                    <button
                      className="mt-4 h-11 rounded-md bg-grass px-4 font-black text-white disabled:bg-slate-400"
                      disabled={busy || !isSupabaseConfigured}
                      onClick={() => saveMatch(match)}
                      type="button"
                    >
                      Save match
                    </button>
                  </article>
                );
              })}

            {/* Past matches — collapsible */}
            {matches.filter((m) => new Date(m.kickoff_time).getTime() <= Date.now()).length > 0 && (
              <div className="mt-2">
                <button
                  className="w-full rounded-md border-2 border-ink bg-slate-100 px-4 py-3 text-sm font-black text-ink hover:bg-slate-200"
                  onClick={() => setShowFinishedAdmin((v) => !v)}
                  type="button"
                >
                  {showFinishedAdmin
                    ? "▲ Fela lokna leiki"
                    : `▼ Sýna lokna leiki (${matches.filter((m) => new Date(m.kickoff_time).getTime() <= Date.now()).length})`}
                </button>
                {showFinishedAdmin && (
                  <div className="mt-3 grid gap-3">
                    {matches
                      .filter((m) => new Date(m.kickoff_time).getTime() <= Date.now())
                      .map((match) => {
                        const draft = drafts[match.id];
                        if (!draft) return null;
                        return (
                          <article key={match.id} className="rounded-lg border-4 border-slate-300 bg-slate-50 p-4 opacity-80 shadow-soft">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-sm font-black">
                                Home team
                                <input
                                  className="mt-1 h-11 w-full rounded-md border-2 border-slate-300 px-3 font-semibold"
                                  onChange={(event) =>
                                    setDrafts((current) => ({ ...current, [match.id]: { ...draft, home_team: event.target.value } }))
                                  }
                                  value={draft.home_team}
                                />
                              </label>
                              <label className="text-sm font-black">
                                Away team
                                <input
                                  className="mt-1 h-11 w-full rounded-md border-2 border-slate-300 px-3 font-semibold"
                                  onChange={(event) =>
                                    setDrafts((current) => ({ ...current, [match.id]: { ...draft, away_team: event.target.value } }))
                                  }
                                  value={draft.away_team}
                                />
                              </label>
                              <label className="text-sm font-black">
                                Home score
                                <input
                                  className="mt-1 h-11 w-full rounded-md border-2 border-slate-300 px-3 font-semibold"
                                  min={0}
                                  onChange={(event) =>
                                    setDrafts((current) => ({ ...current, [match.id]: { ...draft, home_score: event.target.value } }))
                                  }
                                  type="number"
                                  value={draft.home_score}
                                />
                              </label>
                              <label className="text-sm font-black">
                                Away score
                                <input
                                  className="mt-1 h-11 w-full rounded-md border-2 border-slate-300 px-3 font-semibold"
                                  min={0}
                                  onChange={(event) =>
                                    setDrafts((current) => ({ ...current, [match.id]: { ...draft, away_score: event.target.value } }))
                                  }
                                  type="number"
                                  value={draft.away_score}
                                />
                              </label>
                            </div>
                            <button
                              className="mt-4 h-11 rounded-md bg-slate-500 px-4 font-black text-white disabled:bg-slate-400"
                              disabled={busy || !isSupabaseConfigured}
                              onClick={() => saveMatch(match)}
                              type="button"
                            >
                              Update match
                            </button>
                          </article>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
