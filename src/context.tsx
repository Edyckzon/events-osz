import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoEvents, demoTypes, message, supabase } from "./lib";
import type { Event, TicketType } from "./lib";

type State = {
  session: Session | null;
  admin: boolean;
  staff: boolean;
  aal2: boolean;
  ready: boolean;
  events: Event[];
  types: TicketType[];
  error: string;
  reload: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [admin, setAdmin] = useState(false),
    [staff, setStaff] = useState(false),
    [aal2, setAal2] = useState(false);
  const [events, setEvents] = useState<Event[]>(supabase ? [] : demoEvents),
    [types, setTypes] = useState<TicketType[]>(supabase ? [] : demoTypes),
    [error, setError] = useState("");
  async function reload() {
    if (!supabase) return;
    try {
      const [e, t] = await Promise.all([
        supabase.from("events").select("*").order("starts_at"),
        supabase.from("ticket_types").select("*"),
      ]);
      if (e.error) throw e.error;
      if (t.error) throw t.error;
      setEvents(
        e.data.map((event) => ({
          ...event,
          cover_url: event.cover_url?.startsWith("storage:")
            ? supabase!.storage
                .from("event-images")
                .getPublicUrl(event.cover_url.slice(8)).data.publicUrl
            : event.cover_url,
        })),
      );
      setTypes(t.data);
      setError("");
    } catch (err) {
      setError(message(err));
    }
  }
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    void reload();
    if (!session || !supabase) {
      setAdmin(false);
      setStaff(false);
      setAal2(false);
      return;
    }
    Promise.all([
      supabase.from("app_roles").select("role").eq("user_id", session.user.id),
      supabase
        .from("event_staff")
        .select("role")
        .eq("user_id", session.user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([a, s, m]) => {
      if (!active) return;
      const isAdmin = !!a.data?.length;
      setAdmin(isAdmin);
      setStaff(isAdmin || !!s.data?.length);
      setAal2(m.data?.currentLevel === "aal2");
    });
    return () => {
      active = false;
    };
  }, [session]);
  return (
    <Context.Provider
      value={{
        session,
        admin,
        staff,
        aal2,
        ready,
        events,
        types,
        error,
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing provider");
  return state;
}
