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

      if (!data.length) {
        const seededMatches = await seedDemoMatches();
        if (seededMatches.error) {
          setMessage(seededMatches.error.message);
          return;
        }

        const nextMatches = seededMatches.data ?? [];
        setMatches(nextMatches);
        setDrafts(Object.fromEntries(nextMatches.map((match) => [match.id, draftFromMatch(match)])));
        setMessage("Demo matches added automatically.");
        return;
      }

      const nextMatches = data;
      setMatches(nextMatches);
      setDrafts(Object.fromEntries(nextMatches.map((match) => [match.id, draftFromMatch(match)])));
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
      const { data, error } = await seedDemoMatches();

      if (error) {
        throw error;
      }
      const nextMatches = data ?? [];
      setMatches(nextMatches);
      setDrafts(Object.fromEntries(nextMatches.map((match) => [match.id, draftFromMatch(match)])));
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

    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("matches")
        .update({
          home_team: draft.home_team.trim(),
          away_team: draft.away_team.trim(),
          kickoff_time: fromLocalInputValue(draft.kickoff_time),
          status: draft.status,
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

  async function recalculatePoints() {
    if (!supabase) {
      setMessage("Connect Supabase before recalculating points.");
      return;
    }
    const client = supabase;

    setBusy(true);
    try {
      const [
        { data: matchData, error: matchError },
        { data: predictionData, error: predictionError },
        { data: playerData, error: playerError }
      ] = await Promise.all([
        client.from("matches").select("*"),
        client.from("predictions").select("*"),
        client.from("players").select("id")
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
        const { error } = await client.from("predictions").upsert(updates);
        if (error) {
          throw error;
        }
      }

      const totals = updates.reduce<Record<string, number>>((acc, prediction) => {
        acc[prediction.player_id] = (acc[prediction.player_id] ?? 0) + prediction.points;
        return acc;
      }, {});

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
          matches.map((match) => {
            const draft = drafts[match.id];
            if (!draft) {
              return null;
            }

            return (
              <article key={match.id} className="rounded-lg border-4 border-ink bg-white p-4 shadow-soft">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-black">
                    Home team
                    <input
                      className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, home_team: event.target.value }
                        }))
                      }
                      value={draft.home_team}
                    />
                  </label>
                  <label className="text-sm font-black">
                    Away team
                    <input
                      className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, away_team: event.target.value }
                        }))
                      }
                      value={draft.away_team}
                    />
                  </label>
                  <label className="text-sm font-black">
                    Kickoff
                    <input
                      className="mt-1 h-11 w-full rounded-md border-2 border-ink px-3 font-semibold"
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, kickoff_time: event.target.value }
                        }))
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
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, status: event.target.value as MatchDraft["status"] }
                        }))
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
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, home_score: event.target.value }
                        }))
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
          })
        )}
      </section>
    </main>
  );
}
