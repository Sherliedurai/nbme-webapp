import { ExamData } from '@/types/exam';

const demoExam: ExamData = {
  exam_name: "NBME Demo Exam",
  total_questions: 10,
  questions: [
    {
      id: 1,
      stem: "A 55-year-old man presents to the emergency department with crushing substernal chest pain radiating to his left arm for the past 2 hours. He has a history of hypertension, hyperlipidemia, and type 2 diabetes mellitus. His blood pressure is 150/90 mmHg, pulse is 100/min, and respirations are 22/min. An ECG shows ST-segment elevation in leads II, III, and aVF.\n\nWhich of the following is the most likely diagnosis?",
      image: null,
      options: { A: "Unstable angina", B: "Acute pericarditis", C: "Inferior ST-elevation myocardial infarction", D: "Aortic dissection", E: "Pulmonary embolism" },
      correct: "C",
      topic: "Cardiology",
      explanation_structured: {
        bottom_line: "ST-segment elevation in leads II, III, and aVF indicates an inferior STEMI, typically caused by occlusion of the right coronary artery.",
        remember_as: "II, III, aVF = Inferior wall = RCA territory. Think \"floor of the heart.\"",
        watch_out: [
          "Unstable angina → no ST elevation on ECG",
          "Pericarditis → diffuse ST elevation, not localized to specific leads",
          "Aortic dissection → tearing pain radiating to the back, not arm"
        ],
        high_yield: ["Inferior STEMI", "RCA occlusion", "ST elevation II/III/aVF"]
      },
      explanation_full: "ST-segment elevation in leads II, III, and aVF indicates an inferior STEMI, typically caused by occlusion of the right coronary artery. The clinical presentation of crushing substernal chest pain radiating to the left arm with cardiovascular risk factors is classic for acute MI."
    },
    {
      id: 2,
      stem: "A 30-year-old woman presents with fatigue, weight gain, constipation, and cold intolerance over the past 6 months. Physical examination reveals dry skin, periorbital edema, and delayed relaxation of deep tendon reflexes. Laboratory studies show:\n\nTSH: 12.5 μU/mL (normal: 0.5-5.0)\nFree T4: 0.4 ng/dL (normal: 0.9-2.3)\n\nWhich of the following is the most appropriate treatment?",
      image: null,
      options: { A: "Propylthiouracil", B: "Methimazole", C: "Levothyroxine", D: "Radioactive iodine", E: "Surgical thyroidectomy" },
      correct: "C",
      topic: "Endocrinology",
      explanation_structured: {
        bottom_line: "This patient has primary hypothyroidism (elevated TSH, low free T4). Levothyroxine (synthetic T4) is the standard treatment.",
        remember_as: "High TSH + Low T4 = Hypo. Treat with Levo. PTU/Methimazole = Hyper.",
        watch_out: [
          "PTU and methimazole → used for hyperthyroidism, not hypothyroidism",
          "Radioactive iodine → hyperthyroidism or thyroid cancer treatment"
        ],
        high_yield: ["Primary hypothyroidism", "Levothyroxine", "Hashimoto thyroiditis"]
      },
      explanation_full: "This patient has primary hypothyroidism (elevated TSH, low free T4). Levothyroxine (synthetic T4) is the standard treatment for hypothyroidism."
    },
    {
      id: 3,
      stem: "A 65-year-old man with a 40-pack-year smoking history presents with a 3-month history of cough, hemoptysis, and unintentional weight loss of 15 pounds. Chest X-ray reveals a 4-cm hilar mass in the right lung. Biopsy shows small round blue cells with scant cytoplasm and nuclear molding.\n\nWhich of the following is the most likely diagnosis?",
      image: null,
      options: { A: "Adenocarcinoma", B: "Squamous cell carcinoma", C: "Small cell lung carcinoma", D: "Large cell carcinoma", E: "Carcinoid tumor" },
      correct: "C",
      topic: "Pulmonology",
      explanation_structured: {
        bottom_line: "Small cell lung carcinoma is characterized by small round blue cells with scant cytoplasm, nuclear molding, and a central/hilar location.",
        watch_out: [
          "Adenocarcinoma → peripheral location, gland-forming",
          "Squamous cell carcinoma → central but shows keratin pearls",
          "Carcinoid → low-grade neuroendocrine, less aggressive"
        ],
        high_yield: ["Small cell carcinoma", "Central/hilar mass", "Neuroendocrine markers"]
      },
      explanation_full: "Small cell lung carcinoma is characterized by small round blue cells with scant cytoplasm, nuclear molding, and a central/hilar location. It is strongly associated with smoking."
    },
    {
      id: 4,
      stem: "A 22-year-old college student presents with a 2-day history of fever, severe headache, neck stiffness, and photophobia. On examination, Kernig and Brudzinski signs are positive. Lumbar puncture reveals:\n\nOpening pressure: 300 mm H2O\nWBC: 2,000/μL (90% neutrophils)\nGlucose: 25 mg/dL\nProtein: 200 mg/dL\nGram stain: Gram-positive diplococci\n\nWhich of the following is the most likely causative organism?",
      image: null,
      options: { A: "Neisseria meningitidis", B: "Streptococcus pneumoniae", C: "Haemophilus influenzae", D: "Listeria monocytogenes", E: "Escherichia coli" },
      correct: "B",
      topic: "Infectious Disease",
      explanation_structured: {
        bottom_line: "Gram-positive diplococci in CSF with bacterial meningitis findings point to Streptococcus pneumoniae, the most common cause in adults.",
        watch_out: [
          "Neisseria meningitidis → gram-negative diplococci",
          "Listeria → gram-positive rods, common in neonates and elderly"
        ],
        high_yield: ["S. pneumoniae", "Gram-positive diplococci", "Bacterial meningitis"]
      },
      explanation_full: "Gram-positive diplococci in CSF with findings of bacterial meningitis point to Streptococcus pneumoniae, the most common cause of bacterial meningitis in adults."
    },
    {
      id: 5,
      stem: "A 45-year-old woman presents with episodic headaches, palpitations, and diaphoresis. Her blood pressure during an episode is 220/120 mmHg. 24-hour urine collection shows elevated metanephrines and catecholamines. CT scan of the abdomen reveals a 3-cm adrenal mass.\n\nWhich of the following is the most important initial step before surgical removal?",
      image: null,
      options: { A: "Beta-blocker therapy", B: "Alpha-blocker therapy", C: "Calcium channel blocker therapy", D: "ACE inhibitor therapy", E: "Immediate surgical excision" },
      correct: "B",
      topic: "Endocrinology",
      explanation_structured: {
        bottom_line: "Alpha-blockade (phenoxybenzamine) must be initiated before surgery to prevent hypertensive crisis during tumor manipulation.",
        remember_as: "Pheo = Alpha first, Beta second. Never beta alone. Phenoxybenzamine before pheo surgery.",
        watch_out: [
          "Beta-blockers alone → unopposed alpha stimulation, worsens hypertension",
          "Immediate surgery → risk of fatal hypertensive crisis"
        ],
        high_yield: ["Pheochromocytoma", "Alpha-blockade first", "Phenoxybenzamine"]
      },
      explanation_full: "This patient has a pheochromocytoma. Alpha-blockade (phenoxybenzamine) must be initiated before surgery to prevent hypertensive crisis. Beta-blockers should only be added AFTER adequate alpha-blockade."
    },
    {
      id: 6,
      stem: "A 3-year-old boy is brought to the clinic with periorbital edema and generalized swelling for the past week. Urinalysis shows 4+ protein, no blood, and oval fat bodies. Serum albumin is 1.8 g/dL (normal: 3.5-5.5) and serum cholesterol is 350 mg/dL.\n\nWhich of the following is the most likely diagnosis?",
      image: null,
      options: { A: "IgA nephropathy", B: "Membranous nephropathy", C: "Minimal change disease", D: "Focal segmental glomerulosclerosis", E: "Post-streptococcal glomerulonephritis" },
      correct: "C",
      topic: "Nephrology",
      explanation_structured: {
        bottom_line: "Minimal change disease is the most common cause of nephrotic syndrome in children, presenting with massive proteinuria, hypoalbuminemia, and hyperlipidemia.",
        watch_out: [
          "Membranous nephropathy → most common nephrotic cause in adults",
          "IgA nephropathy → nephritic syndrome (hematuria)",
          "PSGN → follows strep infection with nephritic features"
        ],
        high_yield: ["Minimal change disease", "Nephrotic syndrome", "Children"]
      },
      explanation_full: "Minimal change disease is the most common cause of nephrotic syndrome in children. Light microscopy appears normal; electron microscopy shows effacement of podocyte foot processes."
    },
    {
      id: 7,
      stem: "A 28-year-old woman presents with a butterfly-shaped rash on her face, joint pain, and fatigue. Laboratory studies show a positive ANA, positive anti-dsDNA antibodies, and low complement levels (C3 and C4). Urinalysis reveals proteinuria and red blood cell casts.\n\nWhich of the following is the most serious complication suggested by the urinalysis findings?",
      image: null,
      options: { A: "Lupus arthritis", B: "Lupus nephritis", C: "Lupus cerebritis", D: "Lupus dermatitis", E: "Lupus pleuritis" },
      correct: "B",
      topic: "Rheumatology",
      explanation_structured: {
        bottom_line: "Proteinuria and RBC casts indicate glomerular inflammation, consistent with lupus nephritis — the most serious complication of SLE.",
        watch_out: [
          "Lupus cerebritis → seizures or psychosis, not urinary findings",
          "Lupus arthritis → non-erosive, doesn't cause renal findings"
        ],
        high_yield: ["Lupus nephritis", "Anti-dsDNA", "RBC casts"]
      },
      explanation_full: "Proteinuria and RBC casts indicate glomerular inflammation, consistent with lupus nephritis, which is one of the most serious complications of SLE."
    },
    {
      id: 8,
      stem: "A 60-year-old man with chronic alcoholism presents with confusion, ataxia, and ophthalmoplegia. He appears malnourished. MRI of the brain shows mammillary body atrophy.\n\nWhich of the following is the most appropriate initial treatment?",
      image: null,
      options: { A: "Oral folate supplementation", B: "Intravenous thiamine (vitamin B1)", C: "Intravenous dextrose", D: "Oral niacin supplementation", E: "Intramuscular cyanocobalamin (vitamin B12)" },
      correct: "B",
      topic: "Neurology",
      explanation_structured: {
        bottom_line: "This is Wernicke encephalopathy (confusion, ataxia, ophthalmoplegia) caused by thiamine deficiency. IV thiamine must be given BEFORE glucose.",
        remember_as: "Wernicke triad: Confusion + Ataxia + Ophthalmoplegia. Give thiamine BEFORE dextrose — always!",
        watch_out: [
          "Giving glucose before thiamine → depletes remaining thiamine stores",
          "Folate deficiency → megaloblastic anemia, not this triad"
        ],
        high_yield: ["Wernicke encephalopathy", "Thiamine (B1)", "Mammillary bodies"]
      },
      explanation_full: "This patient has Wernicke encephalopathy caused by thiamine deficiency. IV thiamine must be given BEFORE glucose to prevent worsening."
    },
    {
      id: 9,
      stem: "A 35-year-old woman presents with a palpable thyroid nodule. Fine needle aspiration biopsy shows cells with \"Orphan Annie eye\" nuclei, nuclear grooves, and psammoma bodies.\n\nWhich of the following is the most likely diagnosis?",
      image: null,
      options: { A: "Follicular thyroid carcinoma", B: "Papillary thyroid carcinoma", C: "Medullary thyroid carcinoma", D: "Anaplastic thyroid carcinoma", E: "Thyroid lymphoma" },
      correct: "B",
      topic: "Endocrinology",
      explanation_structured: {
        bottom_line: "Papillary thyroid carcinoma is characterized by \"Orphan Annie eye\" nuclei, nuclear grooves, and psammoma bodies. It is the most common thyroid cancer.",
        watch_out: [
          "Follicular carcinoma → requires capsular/vascular invasion for diagnosis",
          "Medullary carcinoma → parafollicular C cells, produces calcitonin"
        ],
        high_yield: ["Papillary thyroid cancer", "Psammoma bodies", "Orphan Annie nuclei"]
      },
      explanation_full: "Papillary thyroid carcinoma is the most common thyroid cancer, characterized by \"Orphan Annie eye\" nuclei, nuclear grooves, and psammoma bodies. Excellent prognosis."
    },
    {
      id: 10,
      stem: "A 50-year-old man with a history of heavy alcohol use presents with hematemesis. On examination, he has jaundice, spider angiomata, ascites, and caput medusae. Endoscopy reveals actively bleeding esophageal varices.\n\nWhich of the following is the most appropriate initial pharmacologic treatment for the acute variceal bleeding?",
      image: null,
      options: { A: "Propranolol", B: "Octreotide", C: "Furosemide", D: "Spironolactone", E: "Lactulose" },
      correct: "B",
      topic: "Gastroenterology",
      explanation_structured: {
        bottom_line: "Octreotide (somatostatin analog) reduces splanchnic blood flow and is first-line for acute variceal bleeding along with endoscopic band ligation.",
        remember_as: "Acute variceal bleed = Octreotide + Band ligation. Propranolol = Prevention only.",
        watch_out: [
          "Propranolol → prophylaxis only, not acute management",
          "Lactulose → hepatic encephalopathy, not bleeding"
        ],
        high_yield: ["Variceal bleeding", "Octreotide", "Portal hypertension"]
      },
      explanation_full: "Octreotide reduces splanchnic blood flow and portal pressure, and is first-line for acute variceal bleeding along with endoscopic band ligation."
    }
  ]
};

export default demoExam;
