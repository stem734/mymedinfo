# SystmOne Protocol Integration Guide for MyMedInfo

## Overview

The `SystmOne_MyMedInfo_Protocol.xml` template automatically detects when medications from specified therapeutic groups are prescribed in SystmOne and generates a URL to send patients MyMedInfo patient information leaflets.

## How It Works

1. **Medication Detection** — The protocol monitors for new prescriptions in five medication groups
2. **Code Assignment** — Each medication is assigned a code (101-102 for Sulfonylureas, 201-202 for SGLT2, etc.)
3. **URL Generation** — Creates a MyMedInfo URL with all relevant medication codes
4. **Patient Communication** — Sends the URL via email/SMS to the patient with their organisation name

## Medications Included

The protocol supports 5 therapeutic groups with "Started" and "Reauthorisation" variants:

| Code | Medication | Status |
|------|-----------|--------|
| 101 | Sulfonylureas | Started Treatment |
| 102 | Sulfonylureas | Reauthorisation |
| 201 | SGLT2 Inhibitors | Started Treatment |
| 202 | SGLT2 Inhibitors | Reauthorisation |
| 301 | Emolients | Started Treatment |
| 302 | Emolients | Reauthorisation |
| 401 | Insulin | Started Treatment |
| 402 | Insulin | Reauthorisation |
| 501 | Mounjaro (GLP-1 RA/GIP) | Started Treatment |
| 502 | Mounjaro (GLP-1 RA/GIP) | Reauthorisation |

## Implementation Steps

### Step 1: Create Placeholder Reports in SystmOne

The template includes placeholder reports that must be replaced with actual SystmOne reports. Before importing, create these reports in your SystmOne system or replace the placeholder IDs with your existing report IDs.

**Reports to Create/Link:**

**Medication Detection Reports (Start):**
- `SULF_START_REPORT` — Sulfonylureas started today
- `SGLT2_START_REPORT` — SGLT2 inhibitors started today
- `EMOL_START_REPORT` — Emolients started today
- `INSULIN_START_REPORT` — Insulin started today
- `MOUNJ_START_REPORT` — Mounjaro started today

**Medication Detection Reports (Reauth):**
- `SULF_REAUTH_REPORT` — Sulfonylureas reauthorised today
- `SGLT2_REAUTH_REPORT` — SGLT2 inhibitors reauthorised today
- `EMOL_REAUTH_REPORT` — Emolients reauthorised today
- `INSULIN_REAUTH_REPORT` — Insulin reauthorised today
- `MOUNJ_REAUTH_REPORT` — Mounjaro reauthorised today

**Support Reports:**
- `PATIENT_CONTACT_REPORT` — Patients with mobile number recorded
- `PATIENT_DEMOGRAPHICS_REPORT` — Has SMS or email consent recorded

### Step 2: Update Report IDs in XML

Replace placeholder IDs in the XML:

```xml
<!-- Before (placeholder) -->
<Node Uid="72" Report="SULF_START_REPORT">InReport</Node>

<!-- After (your actual report ID, e.g., 40122147) -->
<Node Uid="72" Report="40122147">InReport</Node>
```

### Step 3: Customize Communication Template

Update the communication template with your organisation's messaging:

```xml
<MsgPreset Desc="" Subject="Important information about your medication" 
           Template="-1" RecipCon="-1" RecipTeam="-1" rc="XaIvi">
Hi. &lt;title&gt; &lt;surname&gt; | NHS No &lt;nhs_number&gt;

Please see the linked information on your medication:

https://www.mymedinfo.info/patient?org=&lt;organisation_name&gt;&amp;codes=...

Kind regards,
&lt;organisation_name&gt;
</MsgPreset>
```

### Step 4: Import into SystmOne

1. In SystmOne, go to **Template Manager**
2. Select **Import Template**
3. Choose the updated `SystmOne_MyMedInfo_Protocol.xml` file
4. Review and confirm the import
5. Assign to appropriate user groups/clinicians

## Protocol Variables

The protocol uses these variables internally:

- `@Date` — Current date (for URL timestamp)
- `@MedicationCount` — Counter for selected medications
- `@SulfStart/@SulfReauth` — Sulfonylurea codes
- `@SGLT2Start/@SGLT2Reauth` — SGLT2 inhibitor codes
- `@EmolStart/@EmolReauth` — Emollient codes
- `@InsulStart/@InsulReauth` — Insulin codes
- `@MounjStart/@MounjReauth` — Mounjaro codes
- `@URLDT` — Formatted date for URL

## Generated URL Format

The protocol generates URLs in this format:

```
https://www.mymedinfo.info/patient?org=<organisation_name>&codes=<101><102><201>...<URLDT>
```

**Parameters:**
- `org` — Organisation name (from SystmOne)
- `codes` — Comma-separated medication codes detected
- `URLDT` — Date the codes were issued (timestamp format)

## Patient Journey

1. **Medication Prescribed** → SystmOne report triggers
2. **URL Generated** → Protocol builds URL with all relevant medication codes
3. **Contact Check** → Verifies patient has email/SMS on file
4. **Message Sent** → Sends communication with link
5. **Patient Views** → Opens MyMedInfo with all relevant medications displayed

## Troubleshooting

### Protocol not triggering
- ✓ Verify reports are linked to correct report IDs
- ✓ Check reports are evaluating to true when medications prescribed
- ✓ Ensure protocol is assigned to users/teams that create prescriptions

### URL not generating correctly
- ✓ Verify `@Date` variable is saving correctly
- ✓ Check medication variables are assigning correct codes
- ✓ Validate organisation name from search params is populating

### Communication not sending
- ✓ Verify patient has email/SMS recorded in demographics
- ✓ Check communication settings are configured for Resend/SMS service
- ✓ Ensure message template is valid

## Extending the Protocol

To add new medications:

1. **Add variable declarations** (e.g., `@NewMedStart`, `@NewMedReauth`)
2. **Create/link reports** for new medication detection
3. **Add code assignment nodes** (e.g., "1001" for starting treatment)
4. **Update URL generation** in communication template
5. **Link nodes** in the protocol flow

## Best Practices

1. **Test Protocol** — Test with a small group of clinicians first
2. **Monitor Delivery** — Check medication information is reaching patients
3. **Review Feedback** — Collect feedback on medication information clarity
4. **Update Regularly** — Add new medications as they're added to MyMedInfo
5. **Document Changes** — Keep track of any local customizations

## Support

For issues or questions:
- Check SystmOne Protocol Manager logs
- Review patient communication audit trail
- Verify MyMedInfo medication codes match protocol assignments
- Contact MyMedInfo support with URL examples

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-14 | 1.0 | Initial template with 5 medication groups and placeholder reports |
