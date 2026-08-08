import { useEffect, useState } from "react";
import { getFormModes } from "@/lib/queries";
import type { FormModesMap } from "@/lib/formModes";

// form_modes is tiny and effectively static for a session — fetch it once and
// share across every component that needs gating or key-trust info. A module-level
// cache avoids a refetch per mount; a failed fetch clears the in-flight promise so
// a later mount can retry.
let cache: FormModesMap | null = null;
let inflight: Promise<FormModesMap> | null = null;

export function loadFormModes(): Promise<FormModesMap> {
  if (cache) return Promise.resolve(cache);
  if (!inflight)
    inflight = getFormModes()
      .then((m) => { cache = m; return m; })
      .catch((e) => { inflight = null; throw e; });
  return inflight;
}

/** The form_modes map, or null until loaded. Fails soft (stays null) on error. */
export function useFormModes(): FormModesMap | null {
  const [modes, setModes] = useState<FormModesMap | null>(cache);
  useEffect(() => {
    if (cache) { setModes(cache); return; }
    let live = true;
    loadFormModes().then((m) => { if (live) setModes(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return modes;
}
