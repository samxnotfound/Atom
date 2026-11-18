import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ImagePlus, Trash2 } from "lucide-react";
import { Segmented } from "../../ui/Segmented";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { useStandby, type StandbySettings } from "../standby/standbyStore";
import {
  addStandbyImages,
  listStandbyImages,
  removeStandbyImage,
  type ResolvedStandbyImage,
} from "../../data/standbyRepo";

const ROTATION_OPTIONS = [
  { value: "shuffle", label: "Shuffle" },
  { value: "in-order", label: "In order" },
  { value: "pinned", label: "Pin one" },
] as const;

const WEIGHT_OPTIONS = [
  { value: "thin", label: "Thin" },
  { value: "bold", label: "Bold" },
] as const;

/** Settings → Standby (SPEC §5.7): rotation, clock look, dim, image manager. */
export function StandbySection() {
  const settings = useStandby((s) => s.settings);
  const update = useStandby((s) => s.update);
  const queryClient = useQueryClient();

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Rotation" hint="Which image is shown each time Standby starts.">
        <Segmented
          options={ROTATION_OPTIONS}
          value={settings.rotation}
          onChange={(v) => update({ rotation: v as StandbySettings["rotation"] })}
          ariaLabel="Rotation mode"
        />
      </Field>

      {settings.rotation === "pinned" && (
        <Field label="Pinned image" hint="Shown every time Standby opens.">
          <PinnedPicker
            value={settings.pinnedId}
            onChange={(id) => update({ pinnedId: id })}
          />
        </Field>
      )}

      <Field label="Clock weight" hint="Ultra-thin numerals or a bolder look.">
        <Segmented
          options={WEIGHT_OPTIONS}
          value={settings.clockWeight}
          onChange={(v) => update({ clockWeight: v as StandbySettings["clockWeight"] })}
          ariaLabel="Clock weight"
        />
      </Field>

      <Field label="Clock size" hint={`${Math.round(settings.clockScale * 100)}%`}>
        <Slider.Root
          className="relative flex h-5 w-full touch-none items-center"
          value={[settings.clockScale]}
          min={0.6}
          max={1.6}
          step={0.05}
          onValueChange={([v]) => update({ clockScale: v })}
          aria-label="Clock size"
        >
          <Slider.Track className="relative h-1 w-full rounded-full bg-[var(--primary-500)]/20">
            <Slider.Range className="absolute h-full rounded-full bg-[image:var(--primary-grad)]" />
          </Slider.Track>
          <Slider.Thumb className="circle block size-4 bg-white shadow-md" />
        </Slider.Root>
      </Field>

      <Field label="Dim" hint={`${settings.dim}% black overlay over the photo.`}>
        <Slider.Root
          className="relative flex h-5 w-full touch-none items-center"
          value={[settings.dim]}
          min={0}
          max={50}
          step={1}
          onValueChange={([v]) => update({ dim: v })}
          aria-label="Dim strength"
        >
          <Slider.Track className="relative h-1 w-full rounded-full bg-[var(--primary-500)]/20">
            <Slider.Range className="absolute h-full rounded-full bg-[image:var(--primary-grad)]" />
          </Slider.Track>
          <Slider.Thumb className="circle block size-4 bg-white shadow-md" />
        </Slider.Root>
      </Field>

      <Field
        label="Images"
        hint="16:9 landscape recommended, 2560×1440+, under ~3 MB. JPG, WebP, PNG, AVIF."
      >
        <ImageManager onAdded={() => queryClient.invalidateQueries()} />
      </Field>
    </div>
  );
}

function PinnedPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: images = [] } = useQuery({
    queryKey: ["standbyImages"],
    queryFn: listStandbyImages,
  });
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Pinned image"
      className="w-full max-w-[280px] rounded-xl border border-[var(--surface-border)] bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-[var(--primary-400)]"
    >
      <option value="">None</option>
      {images.map((i) => (
        <option key={i.id} value={i.id}>
          {i.file_name}
        </option>
      ))}
    </select>
  );
}

function ImageManager({ onAdded }: { onAdded: () => void }) {
  const [removed, setRemoved] = useState<ResolvedStandbyImage | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: images = [], refetch } = useQuery({
    queryKey: ["standbyImages"],
    queryFn: listStandbyImages,
  });

  const add = async () => {
    const picked = await openDialog({
      multiple: true,
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "avif"] },
      ],
    });
    if (!picked) return;
    setBusy(true);
    const paths = Array.isArray(picked) ? picked : [picked];
    await addStandbyImages(paths).catch(() => undefined);
    await refetch();
    onAdded();
    setBusy(false);
  };

  const confirmRemove = async () => {
    if (!removed) return;
    await removeStandbyImage(removed.id, removed.file_name);
    setRemoved(null);
    await refetch();
    onAdded();
  };

  return (
    <div>
      <button
        onClick={() => void add()}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-white/80 px-3.5 py-2 text-[13px] font-semibold shadow-sm transition hover:bg-white disabled:opacity-50"
      >
        <ImagePlus size={15} />
        Add images…
      </button>

      {images.length === 0 ? (
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          No images yet — Standby uses the Sky gradient until you add some.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl">
              <img
                src={img.url}
                alt={img.file_name}
                className="h-16 w-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => setRemoved(img)}
                aria-label={`Remove ${img.file_name}`}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removed !== null}
        title="Remove this image?"
        body="Only the copy Atom keeps is deleted. Your original file stays untouched."
        confirmLabel="Remove"
        cancelLabel="Keep"
        danger
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoved(null)}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/45 p-3.5">
      <p className="text-[13px] font-semibold">{label}</p>
      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
