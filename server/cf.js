// make_bc_category_matrix_tsv.js
// Usage: node make_bc_category_matrix_tsv.js > out.tsv
// Then you can paste out.tsv content into your code as BC_CATEGORY_MATRIX_TSV if needed.

const RAW = String.raw`Name	Master Category	Category	Sub Category
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR231, Dry Magnetic Powder - Grey (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR62, Penetrant - Red; Solvent Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70, Developer - White, Non Aqueous  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR70I, Developer - White, Non Aqueous (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR79, Special Remover  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR85, Remover  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70I (HD), Developer - White, Non Aqueous (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR76S, Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR76F, Magnetic Powder Suspension - Fluorescent  (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR761F, ECOLINE Magnetic Powder Suspension - Fluorescent  (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR72 OR, White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR71, Paint Remover (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Cleaner
MR72 EZ, White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR72 HD, White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR72 AU, White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR72 IN, White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR233, Dry Magnetic Powder - Yellow (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR234, Dry Magnetic Powder - Blue (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR683F, Penetrant - Flourescent Level 3; Solvent Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR110, ECOLINE Magnetic Powder - Fluorescent  (1/2Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent  (1/2Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR112, ECOLINE Magnetic Powder - Fluorescent  (1/2Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR222, ECOLINE Magnetic Powder - Red & Fluorescent (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR81T-R, Dry Developer Powder (1Kg)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR210, ECOLINE Magnetic Powder - Black (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR214, Magnetic Powder Concentrate - Black (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR114HB, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR110, ECOLINE Magnetic Powder - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR230, Dry Magnetic Powder - Red (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR112, ECOLINE Magnetic Powder - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR232, Dry Magnetic Powder - Green (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR115, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR118, Magnetic Powder Composition - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR304, Water Conditioner (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Additives
MR913-Y, Leak Detector concentrate, oil based (fluorescent - yellow) (1L)	Non Destructive Testing	Leak Detection Systems	Leak Detection Dye
MR62, Penetrant - Red; Solvent Removable  (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR67, ECOLINE Penetrant - Red; Solvent & Water Removable  (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable  (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70, Developer - White, Non Aqueous  (1L)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR70I, Developer - White, Non Aqueous (1L)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR79, Special Remover  (1L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR85, Remover  (1L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable  (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR221, ECOLINE Magnetic Powder Concentrate - Black (1L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR222LC, ECOLINE Magnetic Powder Concentrate - Red & Fluorescent (1L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR153, ECOLINE Magnetic Powder Concentrate - Fluorescent  (1L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR158-R, ECOLINE Magnetic Powder Concentrate - Fluorescent  (1L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR302, Corrosion Inhibitor Concentrate (1L)	Non Destructive Testing	Magnetic Particle Testing	Additives
MR71, Paint Remover (1L)	Non Destructive Testing	Magnetic Particle Testing	Cleaner
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable  (205L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR691F, Penetrant - Flourescent Level 1; Solvent & Water Removable  (205L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (200L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR682F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (205L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR683F, Penetrant - Flourescent Level 3; Solvent Removable  (205L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR82, Flux Oil (AMS) (205L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR82-R, ECOLINE Flux Oil (205L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR82, Flux Oil (AMS) (25L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR691F, Penetrant - Flourescent Level 1; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR682F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR683F, Penetrant - Flourescent Level 3; Solvent Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR62, Penetrant - Red; Solvent Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR67, ECOLINE Penetrant - Red; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR311-R AMS, Penetrant - Red; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70, Developer - White, Non Aqueous  (5L)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR70I, Developer - White, Non Aqueous (5L)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR79, Special Remover  (5L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR85, Remover  (5L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR311-R (Non AMS), Penetrant - Red; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR153, ECOLINE Magnetic Powder Concentrate - Fluorescent  (5L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR158-R, ECOLINE Magnetic Powder Concentrate - Fluorescent  (5L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR82-R, ECOLINE Flux Oil (25L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR302, Corrosion Inhibitor Concentrate (5L)	Non Destructive Testing	Magnetic Particle Testing	Additives
MR71, Paint Remover (5L)	Non Destructive Testing	Magnetic Particle Testing	Cleaner
MR - SmartChoice, SC20 - Solvent Cleaner (280ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (280ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR115, Magnetic Powder Composition - Fluorescent 'high brilliance' (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR913-B, Leak Detector concentrate, oil based (fluorescent - blue) (1L)	Non Destructive Testing	Leak Detection Systems	Leak Detection Dye
MR913-G, Leak Detector concentrate, oil based (fluorescent - green) (1L)	Non Destructive Testing	Leak Detection Systems	Leak Detection Dye
MR - SmartChoice, SD30 - Non-Aqueous Developer (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
Klyde Rubber Insulation Coating - Blue (500ml)	MRO Consumables	Coatings	NA
EF-6Y AC Magnetic Yoke 230V 50-60 Hz, 1 Phase	Non Destructive Testing	Equipment & Accessories	Yokes
Klyde Rubber Insulation Coating - Yellow (500ml)	MRO Consumables	Coatings	NA
Klyde Flaky Zinc Spray 'Bright Grade' (500ml)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
MR311-R, Penetrant - Red; Solvent & Water Removable  (25L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR114, Magnetic Powder Composition - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR111, ECOLINE Magnetic Powder - Fluorescent  (1/2Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR111, ECOLINE Magnetic Powder - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR117, Magnetic Powder Composition - Fluorescent  (1Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
Klyde Aquakleen Concentrate (20L)	MRO Consumables	Cleaning and Degreasing	Concentrates
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (500ml)	MRO Consumables	Lubricants and Penetrating Oils	NA
MR312, Penetrant - Red & Fluorescent; Solvent & Water Removable (Low temperature upto -30°C) (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR76SH, Magnetic Powder Suspension - Black (High Temperature) (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
Klyde Flaky Zinc Spray 'Bright Grade' (400ml)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
ASTM Test Block	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable  (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR652F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Klyde - Smoke Detector Spray (280 ml)	MRO Consumables	Special Sprays & Liquids	NA
MR232, Dry Magnetic Powder - Green (30 Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (Piccolo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR765RF, Magnetic Powder suspension - Red & Fluorescent (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR72 IN - White Contrast Paint (5L)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
Klyde Rubber Insulation Coating - Black (500ml)	MRO Consumables	Coatings	NA
Klyde Aquakleen Concentrate (5L)	MRO Consumables	Cleaning and Degreasing	Concentrates
Klyde Cement Remover Concentrate (1L)	MRO Consumables	Cleaning and Degreasing	Concentrates
Bird Repellent Gel (Bio-Degradable) (5kg)	MRO Consumables	Animal Control	Bird
Klyde Flaky Zinc Spray 'Chrome Finish' (400ml)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (280ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC-20 (FD) - Solvent Cleaner (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, WCP40 White Contrast Paint (400 ml)	Non Destructive Testing	SmartChoice	Magnetic Particle Testing
MR76S (TS), Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR - SmartChoice, MIK80 Magnetic Ink Black (400 ml)	Non Destructive Testing	SmartChoice	Magnetic Particle Testing
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR79, Special Remover (20L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR82, Flux Oil (AMS) (210L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR85, Remover (20L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR - SmartChoice, PP25 - Solvent Removable Penetrant - Red (280ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
Klyde Rubber Insulation Coating - Red (500ml)	MRO Consumables	Coatings	NA
Klyde Cement Remover Concentrate (5L)	MRO Consumables	Cleaning and Degreasing	Concentrates
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
Klyde Water Soluble Degreaser for Degreasing of Both Ferrous And Non-Ferrous Alloy Components (30L)	MRO Consumables	Cleaning and Degreasing	NA
MR85, Remover (25L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR - SmartChoice, SP10 - Solvent Removable Penetrant - Red (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SC20 - Solvent Cleaner (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, WP15 - Water Washale Penetrant - Red (5L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
D-Shield Rodent Stopper (400ml)	MRO Consumables	Animal Control	NA
LUMOX YELLOW 101-1 (20 kg)	Speciality Chemicals	Pigments	NA
LUMOX YELLOW 101-2 (20 kg)	Speciality Chemicals	Pigments	NA
Klyde Aquakleen Concentrate (1L)	MRO Consumables	Cleaning and Degreasing	Concentrates
MR - SmartChoice, SD30 - Non-Aqueous Developer (400ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
MR - SmartChoice, SD30 - Non-Aqueous Developer (1L)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
Klyde Cement Remover Concentrate (20L)	MRO Consumables	Cleaning and Degreasing	Concentrates
MR68H, High Temperature Penetrant (400ml)	Non Destructive Testing	Dye Penetrant Testing	High Temperature Testing
MR70H, High Temperature Developer (400ml)	Non Destructive Testing	Dye Penetrant Testing	High Temperature Testing
MR91H, High Temperature Cleaner (400ml)	Non Destructive Testing	Dye Penetrant Testing	High Temperature Testing
MR131, Magnetic Powder Concentrate (1L)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
SP10, Solvent Removable Penetrant - Red (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
SC20, Solvent Cleaner (5L)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
SD30, Non Aqueous Developer (5L)	Non Destructive Testing	Dye Penetrant Testing	Developer
D-Shield, 24hr Disinfectant Coating Spray (400ml)	MRO Consumables	Special Sprays & Liquids	NA
ATTBLIME AB6 (400ml)	3D Scanning	3D Scanning Sprays	Sublimating 
ATTBLIME AB24 (400ml)	3D Scanning	3D Scanning Sprays	Sublimating 
ATTBLIME AB2 (400ml)	3D Scanning	3D Scanning Sprays	Sublimating 
MR561, Hand Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
MR673F, Penetrant - Fluorescent Level 3; Water Removable (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Ni-Cr 1 Test Panel Twin Crack Depth 30 Micron	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
ASME Aluminum Test Panel	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
G57-3L ASME Aluminum Comparator Block	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR99 - Leak Detector (1L)	Non Destructive Testing	Leak Detection Systems	Leak Detection Dye
MR975 UV LED Lamp	Non Destructive Testing	UV Technology	Hand held Lamps
MR72 OR - White Contrast Paint (5L)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR72 OR - White Contrast Paint (1L)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR974AN UV LED Lamp	Non Destructive Testing	UV Technology	Hand held Lamps
G19A MTU No. 3 Reference block type 1 acc. EN ISO 9934-2	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
G47-6L Reference Test Block JIS Z2343 30um - 2 panels	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
TRACER 100 Leak Detector Liquid - Fluorescent (25L)	Non Destructive Testing	Leak Detection Systems	Leak Detection Dye
MR81 - Food Safe Dry Developer (1 kg)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR955 - Food Safe Penetrant (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR Chemie Sample Box	Non Destructive Testing	Promotion	Samples
MR673F, Penetrant - Fluorescent Level 3; Water Removable (1L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR673F, Penetrant - Fluorescent Level 3; Water Removable (400ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR76S AU, Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
Deca 90 Sublimating Agent	Speciality Chemicals	NA	NA
MR56 Hand Yoke 230V w/ straight poles, mounted cable con, field strength pole dist. 160mm: 60 A/cm	Non Destructive Testing	Equipment & Accessories	Yokes
Bird Repellent Gel (Bio-Degradable) (1kg)	MRO Consumables	Animal Control	Bird
Cellulose Powder	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
Cleaner B	MRO Consumables	Cleaning and Degreasing	NA
Black Die	MRO Consumables	Special Sprays & Liquids	NA
MR - SmartChoice, SD30 - Non-Aqueous Developer (280ml)	Non Destructive Testing	SmartChoice	Dye Penetrant Testing
Defender 11- A, Anti - Corrosion Coating	MRO Consumables	Corrosion Protection and Rust Prevention	NA
CLEAN -11, Remover For Defender 11-A	MRO Consumables	Cleaning and Degreasing	NA
Klyde DE-Humidifier (400ml)	MRO Consumables	Special Sprays & Liquids	NA
Piccolo-Pen MR70 Developer White Valve Pen	Non Destructive Testing	Dye Penetrant Testing	Developer
Piccolo-Pen MR85 Remover Valve Pen	Non Destructive Testing	Dye Penetrant Testing	Cleaner
Verpackungskosten Gefahrgut Luftfracht, UN-Karton fur Gebindeware, 290x210x320	Miscellaneous 	NA	NA
Student Kit - NDT (pack of 6)	Non Destructive Testing	Promotion	Samples
MR50 Hand Yoke 230 Volt	Non Destructive Testing	Equipment & Accessories	Yokes
MR111HB, ECOLINE Magnetic Powder - Fluorescent  (1Kg - Individual Pack)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR111HB, ECOLINE Magnetic Powder - Fluorescent  (1/2Kg Individual Pack)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
Aquakleen - Multipurpose Cleaner (1 Kg)	MRO Consumables	Cleaning and Degreasing	RTU
ATTBLIME ABP (400ml)	3D Scanning	3D Scanning Sprays	Non Sublimating
Calibration of Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
MR230, Dry Magnetic Powder - Red (30 Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
Aquakleen - Multipurpose Cleaner (20 Kg)	MRO Consumables	Cleaning and Degreasing	RTU
MR82, Flux Oil (AMS) (20L)	Non Destructive Testing	Magnetic Particle Testing	Carrier Media
MR70I (EZ), Developer - White, Non Aqueous (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
Technical Services - AM-3D Product R&D	Management Services	R&D Services	NA
Liquid Zinc Galvanize Paint (1L)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
CX-230 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.002"	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Magnetic Flux Indicator Strips "G Type" Burma Castrol Strips	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
CX-230 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.002"	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Klyde Rust Remover (1L)	MRO Consumables	Cleaning and Degreasing	Rust Remover
Klyde Rust Remover (5L)	MRO Consumables	Cleaning and Degreasing	Rust Remover
Klyde Zinc Metal Spray (400ml)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
Sprühkopf 3905	Miscellaneous 	NA	NA
RILUMINATI 815 Indicator film fluorescent 500 ml aerosol can	Non Destructive Testing	Riluminati	NA
RILUMINATI 816 overlay black 500 ml aerosol can	Non Destructive Testing	Riluminati	NA
Liquid Zinc Galvanize Paint (5L)	MRO Consumables	Corrosion Protection and Rust Prevention	NA
MR72 IN(R), White Contrast Paint (425 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR72 IN(R), White Contrast Paint (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
Resinwork DENTSIN Aqua 1 (White) - 1 kg	3D Printing	Resin	Dental
Resinwork DENTSIN Aqua 1 (Transparent) - 1 kg	3D Printing	Resin	Dental
Resinwork Colour CR1 - 50 ml	3D Printing	Colour	NA
Resinwork Colour CY1 - 50 ml	3D Printing	Colour	NA
Resinwork Colour CB1 - 50 ml	3D Printing	Colour	NA
Ni-Cr 1 Test Panel Twin Crack Depth 10 Micron	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Ni-Cr 1 Test Panel Twin Crack Depth 20 Micron	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Ni-Cr 1 Test Panel Twin Crack Depth 50 Micron	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (100ml)	MRO Consumables	Lubricants and Penetrating Oils	NA
Reference Test Block 2	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR955 - Food Safe Penetrant (10L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Magnetic Flux Indicator Strips “A Type” Burma Castrol Strips	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Reference Test Block Type 1 - MTU Block	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Attblime photopolymer Beige	3D Printing	Resin	NA
Attblime photopolymer White	3D Printing	Resin	NA
Attblime photopolymer Grey	3D Printing	Resin	NA
25 Messpunkte Promoboxen	3D Scanning	Dots	NA
4 Hinterrader Kinderwagen	Sample	Sample	NA
Klyde Silencer Coating Silver - High Temperature (280ml)	MRO Consumables	Automotive Care	NA
Klyde Silencer Coating Black High Temperature - 280ml	MRO Consumables	Automotive Care	NA
MR233, Dry Magnetic Powder - Yellow (30 Kg)	Non Destructive Testing	Magnetic Particle Testing	Dry Powders
MR131, Magnetic Powder Concentrate (500ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
Aquakleen - Multipurpose Cleaner (5 Kgs)	MRO Consumables	Cleaning and Degreasing	RTU
Aquakleen - Multipurpose Cleaner (210 Kgs)	MRO Consumables	Cleaning and Degreasing	RTU
MR68NF, Biodegradable Penetrant – Red & Fluorescent; Solvent & Water Removable (400ml) (Piccolo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Consolidated Old Balance FG	Non Revenue	Dummy	NA
AC/DC Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
20-0-20 Gauss Meter	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Centrifugal Tube with Stand	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Calcium Carbonate	Generic Chemical	NA	NA
UVA LED Flashlight	Non Destructive Testing	UV Technology	Hand held Lamps
Resinwork DENTSIN Pro Aqua 2 (Birch Beige) - 1 kg	3D Printing	Resin	Dental
Magnetic Field Indicator Acc to ASTM E -709(Pie Guage)	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
NA	NA	NA	NA
Penetrant Testing Flawed Specimen	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR114HB, Magnetic Powder Composition - Fluorescent 'high brilliance' (50 Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
Cellulose Powder (10 kg)	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
MR757, One Pack UT Coupling Powder (55g)	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
MR757, One Pack UT Coupling Powder (225g)	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
Tam Panel Polished	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Tam Panel Grit	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Five Star Block (Type-2)	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
EF-2Y-230V AC Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
UV LED Torch without battery	Non Destructive Testing	UV Technology	Hand held Lamps
PY -1 Permanent Magnetic Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
PY - 2 Permanent Magnetic Yoke	Non Destructive Testing	Equipment & Accessories	Yokes
Magnetic Field Strength Meter MFM 200	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Articulation piece for articulated poles, for hand yoke MR® 56, MR® 56V42 MR® 56V110, 1 set = 2 piec	Non Destructive Testing	Equipment & Accessories	Yokes
Contact pole for hand yoke MR® 56, MR® 56V42, MR® 56V110 1 set = 2 pieces	Non Destructive Testing	Equipment & Accessories	Yokes
MR56 -1	Non Destructive Testing	Equipment & Accessories	Yokes
Klyde K226 - Multi-Purpose Electrical Lubricant (500ml)	MRO Consumables	Lubricants and Penetrating Oils	
MR672F, Penetrant - Fluorescent Level 2; Solvent & Water Removable  (25L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR311-R (LD), Penetrant - Red; Solvent & Water Removable  (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR670F, Penetrant - Flourescent Level 0.5; Solvent & Water Removable (Piccolo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR72 US, White Contrast Background (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR76F US, Magnetic Powder Suspension - Fluorescent  (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR79 US, Special Remover  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR - SmartChoice, WCP40 White Contrast Background (500 ml)	Non Destructive Testing	SmartChoice	Magnetic Particle Testing
MR72 JP, White Contrast Background (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MR76S JP, Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR76F JP, Magnetic Powder Suspension - Fluorescent  (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
MR - SmartChoice, MIK80 Magnetic Ink Black (500 ml)	Non Destructive Testing	SmartChoice	Magnetic Particle Testing
MR79 JP, Special Remover  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR76S US, Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MR88; Remover (Acetone free) (Piccolo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR757 1kg OLD - DO NOT USE	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
MR757, One Pack UT Coupling Powder (1 kg)	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
MR757 Y, One Pack UT Coupling Powder (yellow) (30 kg)	Non Destructive Testing	Ultrasonic Testing Gels	Coupling Powder
Klyde Rust Wipe (25L)	Non Destructive Testing	Cleaning and Degreasing	
MR88, Remover (Acetone free) (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
Graconol Plus	MRO Consumables	CNC Coolant	
Attblime Dental Scanning spray 200ml	3D Scanning	3D Scanning Sprays	
Attblime Dental Scanning spray 200ml	3D Scanning	3D Scanning Sprays	
Attblime Dental Scanning spray 200ml	3D Scanning	3D Scanning Sprays	
Reference Block Type 2	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR® 67 Penetrant red and fluorescent(Jumbo- Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR 703 W Developer white(Jumbo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR68 C Penetrant red and fluorescent(Piccolo- Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Exhibition Material	Non Revenue	Events kit	
MRG, MR68 NF Penetrant red and fluorescent (500ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MRG, MR68 NF Penetrant red and fluorescent (5L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MRG, MR70 AMS Developer white (500ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
MRG: MR71 Paint Remover (500ml)	Non Destructive Testing	Magnetic Particle Testing	Cleaner
MRG, MR72 White Contrast Paint (500 ML)	Non Destructive Testing	Magnetic Particle Testing	Contrast Paint
MRG, MR76S Version S Magnetic powder suspension black (500ML)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Visible)
MRG, MR88 AMS Remover (500ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable (1 L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR653F, Penetrant - Flourescent Level 3; Solvent & Water Removable (5 L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Klyde Weld Kleen Anti Spatter Fluid (500ml)	MRO Consumables	Special Sprays & Liquids	Anti Spatter
TEST BODY ACC. PROF.BERTHOLD	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MR652F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (1 L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
CX-430 Quantitative Quality Indicator - Standard, flaw depth of 30% of shim thickness 0.004"	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Puffer Bulb	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
75Kva Power Source Unit (60 V Output)	Radiography Accessories & HT	RT/HT Accessories	
Ceramic Heater 60 Voil Cp10	Radiography Accessories & HT	RT/HT Accessories	
4 Way Splitter Cable - 16 Mm Square ( 1Mtr. Long|) Hofr ( Black)	Radiography Accessories & HT	RT/HT Accessories	
Triple Cable Set - 2 Core * 25Mm Sq. 25 Mtr. Long Hofr	Radiography Accessories & HT	RT/HT Accessories	
Nickel Chrome Ni/Ch 80/20 *19 Strands Mtr	Radiography Accessories & HT	RT/HT Accessories	
4 Way Splitter Cable - 16Mm Square (1 Mtr. Long Hofr (Orange)	Radiography Accessories & HT	RT/HT Accessories	
Ceramic Heater Cp12 60V	Radiography Accessories & HT	RT/HT Accessories	
Nickel 212 Wire 19 Strand (100 Mtr/Roll)	Radiography Accessories & HT	RT/HT Accessories	
300 Female Panel Mounted Connector	Radiography Accessories & HT	RT/HT Accessories	
300 Ampcamlock (Female)	Radiography Accessories & HT	RT/HT Accessories	
300 Amo Female High Temperature Sleeve	Radiography Accessories & HT	RT/HT Accessories	
300Amp Fiber Pin	Radiography Accessories & HT	RT/HT Accessories	
300 Amp Camlock (Male)	Radiography Accessories & HT	RT/HT Accessories	
300 Amp Male High Temperature Sleeve	Radiography Accessories & HT	RT/HT Accessories	
300 Amp Fiber Pin	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Camlock (Female)	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Female High Temperature Sleeves	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Fiber Pin	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Camlock (Male)	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Male High Temperature Sleeves	Radiography Accessories & HT	RT/HT Accessories	
Thermocouple Plug Type K In Yellow (Male)	Radiography Accessories & HT	RT/HT Accessories	
Thermocouple Socket Type K In Yellow (Female)	Radiography Accessories & HT	RT/HT Accessories	
Compensating Cable 14/36 (100 Mtrs)	Radiography Accessories & HT	RT/HT Accessories	
Thermocouple Wire K Type 0.71Mm (100Mtr Long) 800	Radiography Accessories & HT	RT/HT Accessories	
Strip Chart Paper	Radiography Accessories & HT	RT/HT Accessories	
Attachment Unit With Magnet& Plier ( With Battery) [230V]	Radiography Accessories & HT	RT/HT Accessories	
PVC4 Cassettes Size : 10*20Cm (Inner& Outer ) (33 Micron)	Radiography Accessories & HT	RT/HT Accessories	
PVC Cassettes Size : 10*40Cm (Inner& Outer ) (33 Micron)	Radiography Accessories & HT	RT/HT Accessories	
Lead Marker Tape - 10 Cm Spacing, 10 Mtr. Long	Radiography Accessories & HT	RT/HT Accessories	
Lead Letter A To Z Size: 7Mm*Thk.2Mm (Punching Type)	Radiography Accessories & HT	RT/HT Accessories	
Lead Letter A To Z Size: 7Mm*Thk.2Mm (Casting Type)	Radiography Accessories & HT	RT/HT Accessories	
Lead Number 0 To 9 Size: 7Mm*Thk.2Mm (Punching Type)	Radiography Accessories & HT	RT/HT Accessories	
Lead Number 0 To 9 Size: 7Mm*Thk.2Mm (Casting Type)	Radiography Accessories & HT	RT/HT Accessories	
Wire Type Pene. 6Feen (50Mm)	Radiography Accessories & HT	RT/HT Accessories	
Wire Type Pene. 10Feen (50Mm)	Radiography Accessories & HT	RT/HT Accessories	
Wire Type Pene. 13Feen (50Mm)	Radiography Accessories & HT	RT/HT Accessories	
Lead Marker Box (Plastic) Red	Radiography Accessories & HT	RT/HT Accessories	
SS Holling Channel Type Hanger - 10*40 (3In1)	Radiography Accessories & HT	RT/HT Accessories	
SS Holling Channel Type Hanger - 10*20 (3In1)	Radiography Accessories & HT	RT/HT Accessories	
Corner Cutter	Radiography Accessories & HT	RT/HT Accessories	
Lead Intensifying Screen(0.125Mm) Size: 10*40Cm (Packing In 25 Pack)	Radiography Accessories & HT	RT/HT Accessories	
Lead Intensifying Screen(0.125Mm) Size: 10*20Cm (Packing In 25 Pack)	Radiography Accessories & HT	RT/HT Accessories	
SVK-RT Machine Spares	Radiography Accessories & HT	RT/HT Accessories	
MR751 Special Ultrasonic Coupling Agent Strippable Water Soluble (250 ml)	Non Destructive Testing	Ultrasonic Testing Gels	Gel
BHEL Test Plate	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Business management services 	Management Services	General Services	
MR62 US, Penetrant - Red; Solvent Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70I US, Developer - White, Non Aqueous (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
MR311-R US, Penetrant - Red; Solvent & Water Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
EF-9Y, LIGHT WEIGHT SELECTABLE AC/HWDC MAGNETIZING MODES  230 V. 	Non Destructive Testing	Equipment & Accessories	Yokes
MR72 KR, White Contrast Background (400 ml)	Non Destructive Testing	Magnetic Particle Testing	
MR76S KR, Magnetic Powder Suspension - Black (400 ml)	Non Destructive Testing	Magnetic Particle Testing	
MR79 KR, Special Remover  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Cleaner
MR76F KR, Magnetic Powder Suspension - Fluorescent  (400 ml)	Non Destructive Testing	Magnetic Particle Testing	
MR62 KR, Penetrant - Red; Solvent Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR311-R JP AMS, Penetrant - Red; Solvent & Water Removable  (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MR70I KR, Developer - White, Non Aqueous (400 ml)	Non Destructive Testing	Dye Penetrant Testing	Developer
Klyde K40 - Multifunctional Oil & Lubricant (General Maintainence) (330ml)	MRO Consumables	Lubricants and Penetrating Oils	NA
Klyde Weld Kleen Anti Spatter Fluid (5L)	MRO Consumables	Special Sprays & Liquids	Anti Spatter
Resinwork Model 3 Aquaforge (grey) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
MR752 Special Ultrasonic Coupling Agent	Non Destructive Testing	Ultrasonic Testing Gels	Gel
Magnetis II			
Anti Spatter Fluid (white label) (5L)	MRO Consumables	Special Sprays & Liquids	Anti Spatter
MR673F, Penetrant - Flourescent Level 2; Solvent & Water Removable (Piccolo-Pen)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
MRG, MR822 Coupling Oil (500 ML)	Non Destructive Testing		
MR5-6Y AC Magnetic Yoke 230V 50-60 Hz, 1 Phase	Non Destructive Testing	Equipment & Accessories	Yokes
Resinwork Model 3 Aquaforge (grey) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (white) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)	3D Printing	Resin	Dental
Klyde Weld Kleen Anti Spatter Fluid (1L)	MRO Consumables		
UV-Contrast Control Spectacles	Non Destructive Testing	Equipment & Accessories	Accessories
MR454 UVA/Lux Check measuring instrument	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
MAGNETIC FIELD METER MP-1000	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Spray handle for Aerosols	Non Destructive Testing	Equipment & Accessories	Accessories
Pressure Pump Sprayer 1.5 L	Non Destructive Testing	Equipment & Accessories	Accessories
Safety Transformer 42-V	Radiography Accessories & HT	RT/HT Accessories	
Switch for Hand Yoke MR 56	Non Destructive Testing	Equipment & Accessories	Yokes
MR 56V42 hand yoke 42 volt	Non Destructive Testing	Equipment & Accessories	Yokes
ASTM Wire Type Pene. 1B - 11 (50mm/25mm) - Top 			
ASTM Wire Type Pene. 1C - 16 (50mm/25mm) - Top / T /B			
Wire Type Pene.  1Feen / DIN (50mm/25mm) 	Radiography Accessories & HT	RT/HT Accessories	
Resinwork Model 3 Aquaforge (Almond) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)	3D Printing	Resin	Dental
UV light attachment for MR5-6Y	Non Destructive Testing	UV Technology	Accessories
MR672F, Penetrant - Flourescent Level 2; Solvent & Water Removable  (210L)	Non Destructive Testing	Dye Penetrant Testing	Penetrant
Resinwork Model 3 Aquaforge (almond) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (almond) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (snowcream) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (snowcream) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 1 (grey) - water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 1 (beige) - water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (beige) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (beige) - IPA & Water washable 3D photopolymer resin (4 X 1 kg)	3D Printing	Resin	Dental
MR111HB, ECOLINE Magnetic Powder - Fluorescent  (30Kg)	Non Destructive Testing	Magnetic Particle Testing	Detection Media (Fluorescent)
Tangential Probe P -T2	Radiography Accessories & HT	RT/HT Accessories	
JIS Type 3 Test Panel	Non Destructive Testing	Equipment & Accessories	Guages & Test Blocks
Resinwork Model 3 Aquaforge (almond orange) - IPA & Water washable 3D photopolymer resin (6 X 1 kg)	3D Printing	Resin	Dental
Resinwork Model 3 Aquaforge (almond orange) - IPA & Water washable 3D photopolymer resin (1 kg)	3D Printing	Resin	Dental
ASTM Wire Type Pene. 1A -06  (50mm)- Top	Radiography Accessories & HT	RT/HT Accessories	
ASTM 4A 06(CU) 50mm (Top)	Radiography Accessories & HT	RT/HT Accessories	
60 Amp Fiber pin, 60 Amp Male(Pin)	Radiography Accessories & HT	RT/HT Accessories	
Lead Number 0-9 (10 mm)	Radiography Accessories & HT	RT/HT Accessories	
Lead Alphabets A-Z (10 mm)	Radiography Accessories & HT	RT/HT Accessories	
 PVC Cassettes Size: 35 X 43 cm (inner & outer)	Radiography Accessories & HT	RT/HT Accessories	
 PVC Cassettes Size: 18 X 43 cm (inner & outer)	Radiography Accessories & HT	RT/HT Accessories	
 Chart paper (Sample) 	Radiography Accessories & HT	RT/HT Accessories	
Cp 6 (Sample)	Radiography Accessories & HT	RT/HT Accessories	
 Cp 8 (Sample)	Radiography Accessories & HT	RT/HT Accessories	
Lead marker tape, 5 cm spacing 1metres	Radiography Accessories & HT	RT/HT Accessories	
Chart Paper (Sample)	Radiography Accessories & HT	RT/HT Accessories	
MR90 UV-YokeR (Mountable on MR® 50 hand yoke)	Non Destructive Testing	UV Technology	Accessories
Thermoluminescent dosimeter card	Radiography Accessories & HT	RT/HT Accessories	
MR511 Shot peening controller 500 ml aerosol can	Non Destructive Testing	Equipment & Accessories	Accessories
MR - SmartChoice, WCP40 CB White Contrast Background (400 ml)	Non Destructive Testing	SmartChoice	Magnetic Particle Testing`;

// ---- parser / normalizer ----
function normalizeLineToCols(line) {
  // Convert multiple spaces to a single tab if tabs are missing (Excel copy often has tabs already)
  // But keep commas etc. intact.
  const cleaned = line
    .replace(/\u00A0/g, " ")        // NBSP -> space
    .replace(/[ ]{2,}/g, "\t")      // 2+ spaces -> tab
    .replace(/\t{2,}/g, "\t")       // collapse multiple tabs
    .trim();

  if (!cleaned) return null;

  // Split by tabs first
  const parts = cleaned.split("\t").map(s => s.trim()).filter(Boolean);

  // If we somehow got only 1 part, keep it as Name and fill rest
  if (parts.length === 1) return [parts[0], "NA", "NA", "NA"];

  // If we got 2 parts, assume: Name, Master Category
  if (parts.length === 2) return [parts[0], parts[1], "NA", "NA"];

  // If we got 3 parts, assume: Name, Master Category, Category
  if (parts.length === 3) return [parts[0], parts[1], parts[2], "NA"];

  // If we got exactly 4, perfect
  if (parts.length === 4) return parts;

  // If more than 4, assume the LAST 3 are Master/Category/SubCategory and everything before is Name
  const sub = parts[parts.length - 1] || "NA";
  const cat = parts[parts.length - 2] || "NA";
  const master = parts[parts.length - 3] || "NA";
  const name = parts.slice(0, parts.length - 3).join(" ").trim() || "NA";
  return [name, master, cat, sub];
}

const lines = RAW.split(/\r?\n/);

// Detect & skip any junk before header
const headerIdx = lines.findIndex(l => /Name\s+Master Category\s+Category\s+Sub Category/i.test(l.replace(/\u00A0/g, " ")));
const start = headerIdx >= 0 ? headerIdx + 1 : 0;

const out = [];
out.push(["Name", "Master Category", "Category", "Sub Category"].join("\t"));

for (let i = start; i < lines.length; i++) {
  const cols = normalizeLineToCols(lines[i]);
  if (!cols) continue;

  // Optional: skip duplicate header lines if they reappear
  if (cols.join(" ").toLowerCase().includes("master category category sub category")) continue;

  // Force NA for empty strings
  const fixed = cols.map(v => (v && String(v).trim() ? String(v).trim() : "NA"));
  out.push(fixed.join("\t"));
}

process.stdout.write(out.join("\n"));
