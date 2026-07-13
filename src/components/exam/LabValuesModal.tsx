import { Modal } from "@/components/ui/modal";

// Abbreviated NBME-style reference. Extend as needed.
const LABS: { section: string; rows: [string, string][] }[] = [
  {
    section: "Serum",
    rows: [
      ["Sodium", "136–145 mEq/L"],
      ["Potassium", "3.5–5.0 mEq/L"],
      ["Chloride", "95–105 mEq/L"],
      ["Bicarbonate", "22–28 mEq/L"],
      ["Urea nitrogen (BUN)", "7–18 mg/dL"],
      ["Creatinine", "0.6–1.2 mg/dL"],
      ["Glucose (fasting)", "70–100 mg/dL"],
      ["Calcium", "8.4–10.2 mg/dL"],
      ["Ca (ionized)", "4.6–5.3 mg/dL"],
    ],
  },
  {
    section: "Arterial blood gas",
    rows: [
      ["pH", "7.35–7.45"],
      ["Pco₂", "33–45 mm Hg"],
      ["Po₂", "75–105 mm Hg"],
      ["HCO₃⁻", "22–28 mEq/L"],
    ],
  },
  {
    section: "Hematologic",
    rows: [
      ["Hemoglobin (M)", "13.5–17.5 g/dL"],
      ["Hemoglobin (F)", "12.0–16.0 g/dL"],
      ["Leukocytes", "4,500–11,000/mm³"],
      ["Platelets", "150,000–400,000/mm³"],
      ["MCV", "80–100 µm³"],
    ],
  },
];

export default function LabValuesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Lab Values" onClose={onClose} className="max-w-lg">
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {LABS.map((group) => (
          <div key={group.section}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {group.section}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {group.rows.map(([name, range]) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="py-1.5 pr-4 text-slate-700">{name}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-600">
                      {range}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}
