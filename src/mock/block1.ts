// Real block-1 content for dev preview only. Imports the gitignored extracted
// JSON so nothing licensed is committed; only loaded when VITE_PREVIEW=1.
import raw from "../../import/out/block1.merged.json";
import enrichRaw from "../../import/out/enrich_block1_full.json";
import type { EnrichedExplanation, ExamQuestion, FullQuestion, QuestionOption } from "@/lib/types";

// Dev-only: serve the cropped figure via Vite's /@fs (NOT a bundler asset import,
// which would emit the licensed image into a production build). Preview is dev-only.
const q0016url = "/@fs/Users/sherlie/Desktop/nbme-app/import/images/block-01/q0016.png";

interface RawItem {
  block_number: number;
  q_number: number;
  vignette_text: string;
  options: QuestionOption[];
  correct_letter: string;
  clinical_image_url: string | null;
  source_explanation: string;
  system_tag: string;
  discipline_tag: string;
  question_type: string;
}

const items = (raw as { items: RawItem[] }).items;
const enrichByQ = new Map<number, EnrichedExplanation>(
  (enrichRaw as { enrichments: (EnrichedExplanation & { q_number: number })[] }).enrichments.map(
    (e) => [e.q_number, e]
  )
);

// Exam-safe projection (no correct_letter / explanations) — mirrors production.
export const previewExamQuestions: ExamQuestion[] = items.map((it) => ({
  id: `preview-${it.q_number}`,
  nbme_form: 31,
  block_number: it.block_number,
  q_number: it.q_number,
  vignette_text: it.vignette_text,
  options: it.options,
  clinical_image_url: it.clinical_image_url,
  system_tag: it.system_tag,
  discipline_tag: it.discipline_tag,
  question_type: it.question_type,
}));

export const previewAnswerKey = new Map<string, string>(
  items.map((it) => [`preview-${it.q_number}`, it.correct_letter])
);

// Full questions (answer + explanation + enrichment) for Practice / Review preview.
export const previewFullQuestions: FullQuestion[] = items.map((it) => ({
  id: `preview-${it.q_number}`,
  nbme_form: 31,
  block_number: it.block_number,
  q_number: it.q_number,
  vignette_text: it.vignette_text,
  options: it.options,
  clinical_image_url: it.clinical_image_url,
  system_tag: it.system_tag,
  discipline_tag: it.discipline_tag,
  question_type: it.question_type,
  correct_letter: it.correct_letter,
  source_explanation: it.source_explanation,
  enriched_explanation: enrichByQ.get(it.q_number) ?? null,
}));

// Map the private-bucket object path to the locally-served cropped figure.
export const previewImageUrls: Record<string, string> = {
  "block-01/q0016.png": q0016url,
};
