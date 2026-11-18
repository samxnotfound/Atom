import { usePrefs } from "../../app/prefsStore";
import { Switch } from "./AppearanceSection";
import { Field } from "./TimerSection";

/** Settings → System (SPEC §5.7): confirm-on-close during a session. */
export function SystemSection() {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field
        label="Confirm on close"
        hint="When a session is running, closing the window asks to keep it running or end and save."
      >
        <Switch
          checked={prefs.confirmClose}
          onChange={(v) => update({ confirmClose: v })}
          label="Confirm on close during a session"
        />
      </Field>
    </div>
  );
}
