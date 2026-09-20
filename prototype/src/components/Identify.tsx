import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../data/types";
import { resolveInitials, resolutionHint } from "../lib/identify";
import { useApp } from "../store/AppStore";

// E-01 identification, built for the counter.
//
// The whole design brief is speed. Opening a Sale, recording a pay-out,
// adjusting on hand and voiding prompt EVERY time, session or not (d12, d15),
// so this runs many times an hour and has to cost a keystroke or two.
//
//   - No Enter, no OK button. The moment what is typed IS an active person's
//     initials, the action proceeds. Full initials, not a prefix — see
//     lib/identify.ts for why the keystroke saved was not worth it.
//   - Escape cancels THE ACTION, not just the dialog. Nothing half-happens.
//   - Anything short of a full match resolves to nobody and waits, so the
//     failure mode is a keystroke and never a misattribution.
//
// A deliberate non-feature: there is no list of names to click. A picker would
// put every prompt behind a read-and-aim, and would show the whole staff list
// to whoever is standing at the counter.

type Request = {
  reason: string;
  // Why the prompt appeared even though a session is open, where that applies
  // — so the person typing can see it is not a bug.
  always?: boolean;
  onOk: (user: User) => void;
  onCancel?: () => void;
};

const IdentifyCtx = createContext<{ request: (r: Request) => void } | null>(null);

export function useIdentify() {
  const v = useContext(IdentifyCtx);
  if (!v) throw new Error("useIdentify must be used inside IdentifyProvider");
  return v;
}

// Tier 2, card-scoped (E-01 d20).
//
// The Customer and Supplier cards have no Save button — every field commits on
// blur (E-07 d13, M-01 d13). Read literally, d5 would prompt once per FIELD,
// which is the behaviour d12 says trains people to type initials without
// reading the screen.
//
// So the unit of attribution is THE CARD, not the keystroke: the first edit
// asks, and that answer covers the rest of that card until you leave it.
// Moving to a different card asks again, because it may well be a different
// person. Still not a session — close the card and it is forgotten.
export function useScopedActor(scopeKey: string) {
  const { request } = useIdentify();
  const app = useApp();
  const [held, setHeld] = useState<{ key: string; actor: string } | null>(null);

  // Leaving the card drops the actor. Without this the answer given for one
  // Supplier would quietly attribute edits to the next one opened.
  useEffect(() => {
    setHeld((h) => (h && h.key === scopeKey ? h : null));
  }, [scopeKey]);

  return useCallback(
    (reason: string, run: (actorName: string) => void) => {
      if (app.sessionUser) {
        run(`${app.sessionUser.name} (${app.sessionUser.role})`);
        return;
      }
      if (held && held.key === scopeKey) {
        run(held.actor);
        return;
      }
      request({
        reason,
        onOk: (u) => {
          const actor = `${u.name} (${u.role})`;
          setHeld({ key: scopeKey, actor });
          run(actor);
        },
      });
    },
    [app.sessionUser, held, scopeKey, request],
  );
}

// Tier 2 — the ordinary case, and the one the prototype was missing.
//
// d5 and step 5: with NO session open, any action requiring attribution
// prompts inline. With a session open it does not, because d12 deliberately
// covers receiving, order processing and the back office by the session —
// somebody sitting down to receive a carton is the same person for an hour,
// and prompting them per action trains them to type initials without reading
// the screen.
//
// So this is the helper every attributed back-office action goes through:
// silent when somebody is signed in, a prompt when nobody is.
//
// It does NOT open a session on success. d5 says "proceeds without opening a
// full session" in those words — signing in is something you do on purpose.
export function useActor() {
  const { request } = useIdentify();
  const app = useApp();
  return useCallback(
    (reason: string, run: (actorName: string) => void) => {
      if (app.sessionUser) {
        run(`${app.sessionUser.name} (${app.sessionUser.role})`);
        return;
      }
      request({ reason, onOk: (u) => run(`${u.name} (${u.role})`) });
    },
    [app.sessionUser, request],
  );
}

export function IdentifyProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [req, setReq] = useState<Request | null>(null);
  // E-01 d27 — ON A PERSONAL SESSION NOTHING ASKS FOR INITIALS. The Manager or
  // Owner signed in as themselves; the session is the actor and cannot change,
  // so d12's every-time prompts do not fire and neither does d5's inline one.
  // Answered here, at the one place every prompt passes through, rather than
  // at each of the dozen call sites.
  const personal = app.isPersonalSession ? app.sessionUser : null;
  const request = useCallback(
    (r: Request) => {
      if (personal) {
        r.onOk(personal);
        return;
      }
      setReq(r);
    },
    [personal],
  );
  return (
    <IdentifyCtx.Provider value={{ request }}>
      {children}
      {req && (
        <IdentifyPrompt
          req={req}
          onDone={(user) => {
            setReq(null);
            req.onOk(user);
          }}
          onCancel={() => {
            setReq(null);
            req.onCancel?.();
          }}
        />
      )}
    </IdentifyCtx.Provider>
  );
}

function IdentifyPrompt({
  req,
  onDone,
  onCancel,
}: {
  req: Request;
  onDone: (u: User) => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // E-01 d25 — resolve among the people ASSIGNED to the Store in session.
  const res = resolveInitials(app.users, typed, app.currentStoreId ?? undefined);

  useEffect(() => inputRef.current?.focus(), []);

  // Resolve in an effect rather than in the change handler so the resolved
  // name is painted before the dialog closes. Typing the last character of
  // your initials and seeing the screen change with no idea what it resolved
  // to is how people stop reading prompts.
  useEffect(() => {
    if (res.kind !== "one") return;
    const user = res.user;
    const t = setTimeout(() => onDone(user), 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.kind, res.kind === "one" ? res.user.id : null]);

  // Subscribed ONCE. The shell's activity listener fires on the same keydown
  // (App.tsx — any key is activity) and its state update re-renders the
  // provider, which hands this prompt a new `onCancel`; a subscription keyed
  // on it would unsubscribe and resubscribe mid-dispatch and never see the
  // Escape that caused it. E-01 d19: Escape cancels the action.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="idy-scrim" onPointerDown={onCancel}>
      <div
        className="idy"
        role="dialog"
        aria-label="Enter your initials"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="idy-reason">{req.reason}</div>
        <input
          ref={inputRef}
          // A partial is somebody mid-keystroke, not a mistake, so it is not
          // drawn as one.
          className={"idy-input" + (res.kind === "none" && !res.partial ? " bad" : "")}
          value={typed}
          maxLength={4}
          autoComplete="off"
          spellCheck={false}
          aria-label="Initials"
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className={"idy-hint" + (res.kind === "one" ? " ok" : "")}>{resolutionHint(res)}</div>
        <div className="idy-foot">
          {req.always ? (
            <span>
              Asked every time on a store session — this action is worth attributing on its own
              (E-01 d12, d15).
            </span>
          ) : (
            <span>Puts your initials on this store session (E-01 d24, d25).</span>
          )}
          <span className="idy-esc">Esc cancels</span>
        </div>
      </div>
    </div>
  );
}
