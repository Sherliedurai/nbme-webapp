import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PREVIEW } from "@/lib/preview";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Exam from "@/pages/Exam";
import Practice from "@/pages/Practice";
import FullExam from "@/pages/FullExam";
import Analytics from "@/pages/Analytics";
import QueueReview from "@/pages/QueueReview";
import CustomBlock from "@/pages/CustomBlock";
import ReviewDeck from "@/pages/ReviewDeck";
import SetupNotice from "@/pages/SetupNotice";

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  }
  return session ? children : <Navigate to="/login" replace />;
}

export default function App() {
  if (!isSupabaseConfigured && !PREVIEW) return <SetupNotice />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/practice/:form/:blockNumber" element={<Protected><Practice /></Protected>} />
      <Route path="/exam/:form/:blockNumber" element={<Protected><Exam /></Protected>} />
      <Route path="/exam-full/:form" element={<Protected><FullExam /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/custom" element={<Protected><CustomBlock /></Protected>} />
      <Route path="/review/queue" element={<Protected><QueueReview /></Protected>} />
      <Route path="/review/deck" element={<Protected><ReviewDeck /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
