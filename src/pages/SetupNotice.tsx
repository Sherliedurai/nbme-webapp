import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupNotice() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">Finish Supabase setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The app can’t reach the database yet. Add your project URL and anon key to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">.env.local</code>:
          </p>
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
          </pre>
          <p>
            Find both in <strong>Supabase → Project Settings → API</strong>, then restart{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">npm run dev</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
