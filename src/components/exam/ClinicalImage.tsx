import { useEffect, useState } from "react";
import { getSignedImageUrl } from "@/lib/queries";
import { ImageOff } from "lucide-react";

/** Loads a private clinical figure via a short-lived signed URL. */
export default function ClinicalImage({ objectPath }: { objectPath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    getSignedImageUrl(objectPath)
      .then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [objectPath]);

  if (failed) {
    return (
      <div className="my-5 flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        <ImageOff className="size-4" /> Image unavailable
      </div>
    );
  }

  return (
    <figure className="my-5 flex justify-center">
      {url ? (
        <img
          src={url}
          alt="Clinical figure"
          className="max-h-[420px] w-auto rounded-lg border bg-white object-contain shadow-sm"
        />
      ) : (
        <div className="grid h-48 w-full max-w-md place-items-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
          Loading image…
        </div>
      )}
    </figure>
  );
}
