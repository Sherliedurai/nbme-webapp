import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const labData = [
  {
    category: 'Serum Electrolytes',
    values: [
      { name: 'Sodium (Na+)', range: '136-145 mEq/L' },
      { name: 'Potassium (K+)', range: '3.5-5.0 mEq/L' },
      { name: 'Chloride (Cl-)', range: '98-106 mEq/L' },
      { name: 'Bicarbonate (HCO3-)', range: '23-28 mEq/L' },
      { name: 'BUN', range: '7-20 mg/dL' },
      { name: 'Creatinine', range: '0.6-1.2 mg/dL' },
      { name: 'Glucose (fasting)', range: '70-100 mg/dL' },
      { name: 'Calcium (Ca2+)', range: '8.4-10.2 mg/dL' },
      { name: 'Magnesium (Mg2+)', range: '1.5-2.0 mEq/L' },
      { name: 'Phosphate', range: '3.0-4.5 mg/dL' },
    ],
  },
  {
    category: 'CBC',
    values: [
      { name: 'WBC', range: '4,500-11,000/μL' },
      { name: 'RBC (male)', range: '4.7-6.1 million/μL' },
      { name: 'RBC (female)', range: '4.2-5.4 million/μL' },
      { name: 'Hemoglobin (male)', range: '13.5-17.5 g/dL' },
      { name: 'Hemoglobin (female)', range: '12.0-16.0 g/dL' },
      { name: 'Hematocrit (male)', range: '41-53%' },
      { name: 'Hematocrit (female)', range: '36-46%' },
      { name: 'Platelets', range: '150,000-400,000/μL' },
      { name: 'MCV', range: '80-100 fL' },
      { name: 'Reticulocyte count', range: '0.5-2.5%' },
    ],
  },
  {
    category: 'Liver Function',
    values: [
      { name: 'AST (SGOT)', range: '10-40 U/L' },
      { name: 'ALT (SGPT)', range: '7-56 U/L' },
      { name: 'Alkaline Phosphatase', range: '44-147 U/L' },
      { name: 'Total Bilirubin', range: '0.1-1.0 mg/dL' },
      { name: 'Direct Bilirubin', range: '0.0-0.3 mg/dL' },
      { name: 'Albumin', range: '3.5-5.5 g/dL' },
      { name: 'Total Protein', range: '6.0-8.3 g/dL' },
    ],
  },
  {
    category: 'Coagulation',
    values: [
      { name: 'PT', range: '11-15 seconds' },
      { name: 'INR', range: '0.8-1.1' },
      { name: 'PTT', range: '25-40 seconds' },
      { name: 'Bleeding time', range: '2-7 minutes' },
    ],
  },
  {
    category: 'Lipid Panel',
    values: [
      { name: 'Total Cholesterol', range: '<200 mg/dL desirable' },
      { name: 'LDL', range: '<100 mg/dL optimal' },
      { name: 'HDL', range: '>60 mg/dL desirable' },
      { name: 'Triglycerides', range: '<150 mg/dL' },
    ],
  },
  {
    category: 'Cardiac Markers',
    values: [
      { name: 'Troponin I', range: '<0.04 ng/mL' },
      { name: 'CK-MB', range: '0-5 ng/mL' },
      { name: 'BNP', range: '<100 pg/mL' },
      { name: 'LDH', range: '140-280 U/L' },
    ],
  },
  {
    category: 'Thyroid',
    values: [
      { name: 'TSH', range: '0.5-5.0 μU/mL' },
      { name: 'Free T4', range: '0.9-2.3 ng/dL' },
      { name: 'Free T3', range: '2.3-4.2 pg/mL' },
    ],
  },
  {
    category: 'ABG (Arterial Blood Gas)',
    values: [
      { name: 'pH', range: '7.35-7.45' },
      { name: 'PaCO2', range: '35-45 mmHg' },
      { name: 'PaO2', range: '80-100 mmHg' },
      { name: 'HCO3-', range: '22-26 mEq/L' },
      { name: 'O2 Saturation', range: '95-100%' },
    ],
  },
  {
    category: 'CSF',
    values: [
      { name: 'Pressure', range: '70-180 mm H2O' },
      { name: 'Cell count', range: '0-5 WBC/μL' },
      { name: 'Glucose', range: '40-70 mg/dL' },
      { name: 'Protein', range: '15-60 mg/dL' },
    ],
  },
  {
    category: 'Urine',
    values: [
      { name: 'pH', range: '4.5-8.0' },
      { name: 'Specific gravity', range: '1.001-1.035' },
      { name: 'Osmolality', range: '50-1200 mOsm/kg' },
      { name: 'Protein', range: '<150 mg/day' },
      { name: 'Creatinine clearance', range: '97-137 mL/min (male)' },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const LabValuesModal: React.FC<Props> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Laboratory Reference Values</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {labData.map((section) => (
              <div key={section.category}>
                <h3 className="font-semibold text-sm bg-navy text-navy-foreground px-3 py-1.5 rounded">
                  {section.category}
                </h3>
                <div className="mt-1">
                  {section.values.map((v) => (
                    <div
                      key={v.name}
                      className="flex justify-between px-3 py-1 text-sm border-b last:border-0"
                    >
                      <span>{v.name}</span>
                      <span className="font-mono text-muted-foreground">{v.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default LabValuesModal;
