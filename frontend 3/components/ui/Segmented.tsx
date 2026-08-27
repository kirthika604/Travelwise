export interface SegOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  name: string;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? null : o.value)}
            className={[
              "flex-1 rounded-xl px-3 py-2 text-sm transition-colors",
              active ? "bg-lagoon-gradient text-night-950" : "text-slate-300 hover:text-white",
            ].join(" ")}
          >
            <span className="flex flex-col items-center leading-tight">
              <span className="font-semibold">{o.label}</span>
              {o.hint && (
                <span className={active ? "text-[11px] text-night-900/70" : "text-[11px] text-slate-500"}>
                  {o.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
