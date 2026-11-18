import { ACCENTS, useAppearance } from "../../app/appearanceStore";

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;

/** Settings → Appearance (SPEC §5.7): accent, motion, density, Mica. */
export function AppearanceSection() {
  const settings = useAppearance((s) => s.settings);
  const update = useAppearance((s) => s.update);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Accent" hint="Colors buttons, charts and highlights.">
        <div className="flex items-center gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => update({ accent: a.id })}
              aria-label={a.label}
              aria-pressed={settings.accent === a.id}
              title={a.label}
              className={`circle size-9 transition-transform hover:scale-105 ${
                settings.accent === a.id
                  ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[#F4F9FF]"
                  : ""
              }`}
              style={{ background: `linear-gradient(180deg,${a.c[1]} 0%,${a.c[2]} 100%)` }}
            />
          ))}
        </div>
      </Field>

      <Field label="Reduce motion" hint="Trims page transitions and entrance animations.">
        <Switch
          checked={settings.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
          label="Reduce motion"
        />
      </Field>

      <Field label="Density" hint="Compact tightens paddings and rows.">
        <SegmentedSimple
          options={DENSITY_OPTIONS}
          value={settings.density}
          onChange={(v) => update({ density: v as "comfortable" | "compact" })}
        />
      </Field>

      <Field
        label="Mica backdrop"
        hint="Windows 11 Mica behind the window instead of the Sky gradient."
      >
        <Switch
          checked={settings.mica}
          onChange={(v) => update({ mica: v })}
          label="Mica backdrop"
        />
      </Field>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-[var(--primary-500)]" : "bg-[var(--primary-500)]/25"
      }`}
    >
      <span
        className={`circle absolute top-1 block size-4 bg-white shadow transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function SegmentedSimple({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="glass inline-flex rounded-full p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
            value === o.value
              ? "bg-white shadow-sm text-[var(--text)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/45 p-3.5">
      <p className="text-[13px] font-semibold">{label}</p>
      {hint && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
