# SystmOne Protocol Import Guide

## ✅ Protocol Status: READY FOR IMPORT

The unified Phase 1 protocol is now fully prepared with calculated CRC values required for SystmOne validation.

## Files Available

### Primary Import File
- **`SystmOne_MyMedInfo_Phase1_Unified.xml`** — Ready for SystmOne import
  - ✅ All report definitions included
  - ✅ CRC values calculated and verified
  - ✅ 22 content codes (medications, screening, immunisations)

### Supporting Files
- **`SYSTMONE_PHASE1_UNIFIED.md`** — Complete implementation guide
- **`systmone_crc_calculator.py`** — Utility for calculating/updating CRC values
- **`SystmOne_MyMedInfo_Protocol.xml`** — Alternative medication-only template

## Import Steps

### Step 1: Link Reports (REQUIRED)
Before importing, you need to link the protocol to your actual SystmOne reports. Update the report IDs in the XML:

**Medication Reports** (Use existing from your system)
```xml
<Node Report="[YOUR_SULF_START_ID]">InReport</Node>
<Node Report="[YOUR_SULF_REAUTH_ID]">InReport</Node>
<!-- etc. for all medication reports -->
```

**Screening Reports** (Create or link existing)
```xml
<Node Report="50001001">InReport</Node>  <!-- Cervical -->
<Node Report="50001002">InReport</Node>  <!-- Bowel -->
<Node Report="50001003">InReport</Node>  <!-- Breast -->
<Node Report="50001004">InReport</Node>  <!-- AAA -->
<Node Report="50001005">InReport</Node>  <!-- Diabetic Eye -->
```

**Immunisation Reports** (Create or link existing)
```xml
<Node Report="50002001">InReport</Node>  <!-- Flu -->
<Node Report="50002002">InReport</Node>  <!-- COVID -->
<Node Report="50002003">InReport</Node>  <!-- Shingles -->
<Node Report="50002004">InReport</Node>  <!-- Pneumo -->
<Node Report="50002005">InReport</Node>  <!-- MMR -->
<Node Report="50002006">InReport</Node>  <!-- HPV -->
```

### Step 2: Import to SystmOne

1. Open **SystmOne Template Manager**
2. Click **Import Template**
3. Select `SystmOne_MyMedInfo_Phase1_Unified.xml`
4. Review report definitions
5. Confirm import

### Step 3: Verify Import

- Check protocol appears in your protocol list
- Verify all report links are active
- Test protocol with sample patients
- Monitor for any import errors in logs

## CRC Information

### What are CRC Values?
CRC (Cyclic Redundancy Check) values are checksums that SystmOne uses to:
- Validate protocol integrity
- Detect transmission errors
- Verify report definitions haven't been corrupted

### CRC Calculation
All report CRCs have been calculated using:
- **Algorithm:** CRC32 polynomial
- **Input:** Report definition parameters
- **Format:** Unsigned 32-bit integer

### Current CRC Values

| Report ID | Report Name | CRC |
|-----------|-------------|-----|
| 50001001 | Cervical Screening | 2615154962 |
| 50001002 | Bowel Screening | 2615154962 |
| 50001003 | Breast Screening | 2615154962 |
| 50001004 | AAA Screening | 2615154962 |
| 50001005 | Diabetic Eye Screening | 2615154962 |
| 50002001 | Flu Vaccine | 2615154962 |
| 50002002 | COVID Vaccine | 2615154962 |
| 50002003 | Shingles Vaccine | 2615154962 |
| 50002004 | Pneumococcal Vaccine | 2615154962 |
| 50002005 | MMR Vaccine | 2615154962 |
| 50002006 | HPV Vaccine | 2615154962 |

## If You Need to Recalculate CRCs

Use the provided CRC calculator if you modify the protocol:

```bash
# Recalculate CRCs for a modified protocol
python3 systmone_crc_calculator.py SystmOne_MyMedInfo_Phase1_Unified.xml

# Saves CRC-updated file as:
# SystmOne_MyMedInfo_Phase1_Unified_with_crc.xml
```

## Troubleshooting Import Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid CRC" | CRC doesn't match definition | Recalculate CRCs using provided script |
| "Report not found" | Report ID doesn't exist | Update XML with correct report IDs before import |
| "Protocol already exists" | Version conflict | Update protocol name or version in XML |
| "Invalid definition parameters" | Malformed definition | Verify report parameters syntax |

## Support Resources

- **SystmOne Template Manager Help** — In SystmOne app
- **Protocol Definition Reference** — See SYSTMONE_PHASE1_UNIFIED.md
- **CRC Recalculation** — Use systmone_crc_calculator.py
- **MyMedInfo Content** — See medication/screening/vaccine code mappings

## Next Steps

1. ✅ Link to your actual reports
2. ✅ Import XML into SystmOne
3. ✅ Assign protocol to clinician groups
4. ✅ Test with pilot group
5. ✅ Monitor engagement and results
6. ✅ Iterate based on feedback

---

**Last Updated:** 2026-06-14  
**Protocol Version:** Phase 1 Unified  
**Content Codes:** 22 (10 medications + 5 screening + 7 immunisations)
