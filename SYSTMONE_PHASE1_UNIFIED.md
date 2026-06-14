# SystmOne Phase 1 Unified Protocol - Complete Guide

## Overview

The Phase 1 Unified Protocol (`SystmOne_MyMedInfo_Phase1_Unified.xml`) is a comprehensive SystmOne protocol that detects and combines **medications, screening programs, and immunisations** in a single patient communication.

When triggered, it automatically generates a MyMedInfo URL containing all relevant content for the patient's care across three domains.

## Content Types Included

### 1. MEDICATIONS (5 Groups)

| Code | Medication | Variant |
|------|-----------|---------|
| **101** | Sulfonylureas | Starting Treatment |
| **102** | Sulfonylureas | Reauthorisation |
| **201** | SGLT2 Inhibitors | Starting Treatment |
| **202** | SGLT2 Inhibitors | Reauthorisation |
| **301** | Emolients & Skin Care | Starting Treatment |
| **302** | Emolients & Skin Care | Reauthorisation |
| **401** | Insulin Therapy | Starting Treatment |
| **402** | Insulin Therapy | Reauthorisation |
| **501** | Mounjaro (GLP-1/GIP) | Starting Treatment |
| **502** | Mounjaro (GLP-1/GIP) | Reauthorisation |

### 2. SCREENING (5 Programs)

| Code | Screening Program | Target Population |
|------|------------------|-------------------|
| **CS1** | Cervical Screening | Women 25-65 |
| **BS1** | Bowel Screening (FOBT) | Adults 50+ |
| **BR1** | Breast Screening (Mammography) | Women 50-74 |
| **AAA1** | Abdominal Aortic Aneurysm (AAA) | Men 65+ |
| **DE1** | Diabetic Eye Screening | People with Diabetes |

### 3. IMMUNISATIONS (7 Vaccines)

| Code | Vaccine | Patient Groups |
|------|---------|----------------|
| **IM1** | Flu Vaccine | Seasonal/annual |
| **IM2** | COVID-19 Vaccine | Primary + boosters |
| **IM3** | Shingles (Shingrix) | Adults 50+ |
| **IM4** | Pneumococcal (PCV/PPSV) | Adults 65+, risk groups |
| **IM6** | MMR | Catch-up, travel |
| **IM7** | HPV | Young adults |

**Total: 22 content codes in unified protocol**

## How the Protocol Works

```
1. DETECT ─→ 2. ASSIGN ─→ 3. COUNT ─→ 4. GENERATE ─→ 5. SEND
Medication,  Codes to  Medications   URL with all    Patient
Screening,   variables found        detected codes   communication
Immunisation
```

### Step-by-Step Flow

1. **Medication Detection**
   - Checks for Sulfonylureas, SGLT2i, Emolients, Insulin, Mounjaro
   - Assigns codes (101/102, 201/202, etc.)

2. **Screening Detection**
   - Checks for eligible/overdue screening programs
   - Assigns codes (CS1, BS1, BR1, AAA1, DE1)

3. **Immunisation Detection**
   - Checks for eligible/overdue vaccines
   - Assigns codes (IM1-IM7)

4. **URL Generation**
   - Combines all detected codes into single URL
   - Includes organisation name and date timestamp
   - Example:
   ```
   https://www.mymedinfo.info/patient?org=NHS%20Trust&codes=101,201,CS1,BS1,IM1,IM2@URLDT
   ```

5. **Patient Communication**
   - Sends email/SMS with comprehensive care information URL
   - Contains information on all medications, screenings, and vaccines in one message

## Configuration

### Report Linking

The protocol includes placeholder report IDs that must be linked to your actual SystmOne reports:

**Medication Reports** (Use existing/create)
- `40122147` — Sulfonylureas Started Today
- `40122156` — Sulfonylureas Reauthorised Today
- `40283413` — Insulin Started Today
- `40283412` — Insulin Reauthorised Today
- `40282682` — Emolients Started Today
- `40282681` — Emolients Reauthorised Today
- `40597360` — Mounjaro Started Today
- `40597355` — Mounjaro Reauthorised Today
- `40283418` — SGLT2 Started Today
- `40283417` — SGLT2 Reauthorised Today

**Screening Reports** (Create or link existing)
- `50001001` — Cervical Screening Eligible/Overdue
- `50001002` — Bowel Screening Eligible/Overdue
- `50001003` — Breast Screening Eligible/Overdue
- `50001004` — AAA Screening Eligible/Overdue
- `50001005` — Diabetic Eye Screening Eligible/Overdue

**Immunisation Reports** (Create or link existing)
- `50002001` — Flu Vaccine Eligible/Overdue
- `50002002` — COVID-19 Vaccine Eligible/Overdue
- `50002003` — Shingles Vaccine Eligible/Overdue
- `50002004` — Pneumococcal Vaccine Eligible/Overdue
- `50002005` — MMR Vaccine Eligible/Overdue
- `50002006` — HPV Vaccine Eligible/Overdue

### Message Customisation

Edit the communication template to match your organisation's branding:

```xml
<MsgPreset Subject="Important information about your medication">
Hi. <title> <surname> | NHS No <nhs_number>

Please see the linked information on your care:
https://www.mymedinfo.info/patient?org=<organisation_name>&codes=...

Kind regards,
<organisation_name>
</MsgPreset>
```

## URL Format

Generated URLs follow this pattern:

```
https://www.mymedinfo.info/patient?org=<org_name>&codes=<code1>,<code2>,...@<timestamp>
```

**Example with mixed content:**
```
https://www.mymedinfo.info/patient?org=Example%20Health%20Trust&codes=101,201,CS1,BS1,IM1,IM2@20260614
```

**Codes in URL:**
- Medications: 101-102, 201-202, 301-302, 401-402, 501-502
- Screenings: CS1, BS1, BR1, AAA1, DE1
- Immunisations: IM1-IM7
- Timestamp: @URLDT (date issued)

## Patient Experience

### Patient Journey

1. **Medications Prescribed/Reauthorised** ← Triggers protocol
2. **Screening Due** ← Adds CS1, BS1, etc.
3. **Vaccines Eligible** ← Adds IM1, IM2, etc.
4. **Unified URL Generated** ← Combines all codes
5. **Single Communication Sent** ← Patient receives comprehensive care info
6. **Patient Clicks Link** ← Views all medications, screenings, vaccines together
7. **Informed Decisions** ← Better understanding of complete care plan

### What Patient Sees

When patient opens the MyMedInfo URL, they see a unified view:

- **Medications** — All relevant drugs with dosing, side effects, monitoring
- **Screenings** — Information about eligible screening programs
- **Immunisations** — Vaccine information and schedules
- **Resources** — Links to NHS resources, practice information

## Implementation Checklist

- [ ] Create/identify screening reports in SystmOne (5 reports)
- [ ] Create/identify immunisation reports in SystmOne (7 reports)
- [ ] Update XML with actual report IDs
- [ ] Customise communication template
- [ ] Assign protocol to clinician groups
- [ ] Test with pilot group
- [ ] Monitor patient engagement
- [ ] Collect feedback
- [ ] Refine messaging based on feedback

## Phase 2 Considerations

Future phases could add:
- **Long-term Conditions** — Diabetes, COPD, Asthma management
- **Care Plans** — Individualised management plans
- **Risk Stratification** — Targeted interventions
- **Medication Reviews** — Scheduled medication optimisation
- **Preventive Care** — Cardiovascular, renal, bone health screening

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Protocol not triggering | Verify reports exist and evaluate to true |
| Missing codes in URL | Check variables assigned correctly in protocol |
| Patient not receiving | Verify contact details recorded; check communication settings |
| Wrong organisation name | Check `<organisation_name>` parameter is populating from SystmOne |
| Duplicate codes | Verify reports aren't evaluated twice; check report joins |

## Best Practices

1. **Phased Rollout** — Test with small group first
2. **Monitor Delivery** — Check emails/SMS are being sent
3. **Track Engagement** — Monitor MyMedInfo visit rates
4. **Gather Feedback** — Ask patients about usefulness
5. **Review Results** — Track whether screening/vaccine uptake improves
6. **Document Changes** — Keep local customisations documented
7. **Update Content** — Keep MyMedInfo content current
8. **Audit Trail** — Monitor protocol activity logs

## Support Resources

- **MyMedInfo URL Documentation** — How to construct manual URLs
- **MyMedInfo Medication Codes** — Complete medication reference
- **SystmOne Protocol Manager** — Creating/editing reports
- **Patient Communication Template** — Email/SMS guidelines

## Version Information

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-14 | 1.0 | Initial unified protocol: 10 medications + 5 screenings + 7 vaccines |

## Contact & Support

For questions on:
- **SystmOne Integration** → Your SystmOne supplier/administrator
- **MyMedInfo Content** → MyMedInfo clinical team
- **Protocol Logic** → MyMedInfo technical team
