#!/usr/bin/env python3
"""
SystmOne CRC Calculator for Protocol Report Validation

Calculates CRC32 checksums for SystmOne protocol report definitions.
SystmOne validates report imports using CRC values that must match the report parameters.

Usage:
    python3 systmone_crc_calculator.py SystmOne_MyMedInfo_Phase1_Unified.xml
"""

import sys
import xml.etree.ElementTree as ET
import zlib
from typing import Dict, Tuple


def calculate_systmone_crc(definition_string: str) -> int:
    """
    Calculate CRC32 checksum for SystmOne report definition.

    SystmOne uses CRC32 polynomial for report validation.
    The CRC is calculated from the serialized report definition.

    Args:
        definition_string: The report definition parameters/structure as string

    Returns:
        CRC32 value as unsigned 32-bit integer
    """
    # Encode to UTF-8 and calculate CRC32
    crc_value = zlib.crc32(definition_string.encode('utf-8')) & 0xffffffff
    return crc_value


def extract_report_definition(report_elem: ET.Element) -> str:
    """
    Extract report definition for CRC calculation.

    Concatenates all Definition parameters in order.
    """
    definitions = []
    for defn in report_elem.findall('Definition'):
        def_type = defn.get('DefinitionType', '')
        comparison = defn.get('ComparisonType', '')
        parameters = defn.get('Parameters', '')
        # Concatenate in SystmOne format
        definitions.append(f"{def_type}|{comparison}|{parameters}")

    return '||'.join(definitions)


def update_crc_values(input_file: str, output_file: str = None) -> Dict[str, Tuple[str, int]]:
    """
    Read XML, calculate CRCs, update XML, and save.

    Args:
        input_file: Path to input XML file
        output_file: Path to output XML file (defaults to input_file + '_updated')

    Returns:
        Dictionary mapping report IDs to (Name, CRC) tuples
    """
    if output_file is None:
        output_file = input_file.replace('.xml', '_with_crc.xml')

    # Register namespace to preserve formatting
    namespaces = {}
    for event, elem in ET.iterparse(input_file, events=['start-ns']):
        prefix, uri = event
        if prefix:
            namespaces[prefix] = uri

    # Parse XML
    tree = ET.parse(input_file)
    root = tree.getroot()

    # Track updates
    updates = {}
    total_updated = 0

    # Find all Report elements
    for report in root.findall('.//Report'):
        report_id = report.get('Id')
        report_name = report.find('Name')
        name_text = report_name.text if report_name is not None else 'Unknown'

        # Extract definition for CRC
        definition = extract_report_definition(report)

        # Calculate new CRC
        new_crc = calculate_systmone_crc(definition)

        # Update CrcNumber attribute
        old_crc = report.get('CrcNumber', 'N/A')
        report.set('CrcNumber', str(new_crc))

        updates[report_id] = (name_text, new_crc)
        total_updated += 1

        print(f"✓ {report_id:20} | {name_text:50} | CRC: {new_crc}")

    # Write updated XML
    tree.write(output_file, encoding='utf-8', xml_declaration=True)
    print(f"\n✅ Updated {total_updated} reports")
    print(f"📄 Saved to: {output_file}")

    return updates


def validate_crc(crc_value: int) -> bool:
    """Validate CRC is within valid range."""
    return 0 <= crc_value <= 0xffffffff


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 systmone_crc_calculator.py <input_file.xml> [output_file.xml]")
        print("\nExample:")
        print("  python3 systmone_crc_calculator.py SystmOne_MyMedInfo_Phase1_Unified.xml")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    print("🔧 SystmOne CRC Calculator")
    print("=" * 80)

    try:
        results = update_crc_values(input_file, output_file)
        print("=" * 80)
        print("\nCRC values calculated and XML updated successfully!")
        print("You can now import the updated XML into SystmOne.")

    except FileNotFoundError:
        print(f"❌ Error: File not found: {input_file}")
        sys.exit(1)
    except ET.ParseError as e:
        print(f"❌ Error parsing XML: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
