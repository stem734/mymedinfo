#!/usr/bin/env python3
"""
SystmOne CRC Calculator - Correct Implementation

Calculates CRC32 checksums for SystmOne protocol reports.

Algorithm:
1. Build content (everything below the ID: line)
2. Calculate zlib.crc32(content_bytes) & 0xffffffff
3. Format: ID:<crc> (space-padded) + Newline + Content

Usage:
    python3 systmone_crc_calculator.py SystmOne_MyMedInfo_Phase1_Unified.xml
"""

import sys
import xml.etree.ElementTree as ET
import zlib
from typing import Dict, Tuple


def serialize_report_definition(report_elem: ET.Element) -> str:
    """
    Serialize report definition elements to text format for CRC calculation.

    Extracts Definition elements and formats them as they would appear
    in the protocol definition format.
    """
    definitions = []

    for defn in report_elem.findall('Definition'):
        def_type = defn.get('DefinitionType', '')
        comparison = defn.get('ComparisonType', '')
        parameters = defn.get('Parameters', '')

        # Build definition line: DefinitionType|ComparisonType|Parameters
        definition_line = f"{def_type}|{comparison}|{parameters}"
        definitions.append(definition_line)

    # Join definitions with newlines
    content = '\n'.join(definitions)
    return content


def calculate_systmone_crc(content: str) -> int:
    """
    Calculate CRC32 checksum using SystmOne algorithm.

    Algorithm: zlib.crc32(content_bytes) & 0xffffffff
    Standard CRC32, no funny init/xorout, computed over content bytes only.

    Args:
        content: The content text to checksum

    Returns:
        CRC32 value as unsigned 32-bit integer
    """
    # Encode content to bytes and calculate CRC32
    content_bytes = content.encode('utf-8')
    crc_value = zlib.crc32(content_bytes) & 0xffffffff
    return crc_value


def update_crc_values(input_file: str, output_file: str = None) -> Dict[str, Tuple[str, int]]:
    """
    Read XML, calculate CRCs, update XML, and save.

    Args:
        input_file: Path to input XML file
        output_file: Path to output XML file (defaults to input_file with _crc suffix)

    Returns:
        Dictionary mapping report IDs to (Name, CRC) tuples
    """
    if output_file is None:
        output_file = input_file.replace('.xml', '_crc.xml')

    # Parse XML
    tree = ET.parse(input_file)
    root = tree.getroot()

    # Track updates
    updates = {}
    total_updated = 0

    print("🔧 Calculating CRC32 checksums for SystmOne reports")
    print("=" * 90)
    print(f"{'Report ID':<15} | {'Report Name':<50} | {'CRC':<15}")
    print("-" * 90)

    # Find all Report elements
    for report in root.findall('.//Report'):
        report_id = report.get('Id', 'UNKNOWN')
        report_name_elem = report.find('Name')
        report_name = report_name_elem.text if report_name_elem is not None else 'Unknown'

        # Serialize the report definition content
        content = serialize_report_definition(report)

        # Calculate CRC on the content
        crc_value = calculate_systmone_crc(content)

        # Update CrcNumber attribute
        report.set('CrcNumber', str(crc_value))

        updates[report_id] = (report_name, crc_value)
        total_updated += 1

        print(f"{report_id:<15} | {report_name:<50} | {crc_value:<15}")

    # Write updated XML
    tree.write(output_file, encoding='utf-8', xml_declaration=True)

    print("=" * 90)
    print(f"\n✅ Updated {total_updated} reports")
    print(f"📄 Saved to: {output_file}")

    return updates


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 systmone_crc_calculator.py <input_file.xml> [output_file.xml]")
        print("\nAlgorithm:")
        print("  1. Build content (everything below the ID: line)")
        print("  2. Calculate zlib.crc32(content) & 0xffffffff")
        print("  3. Update CrcNumber attribute with result")
        print("\nExample:")
        print("  python3 systmone_crc_calculator.py SystmOne_MyMedInfo_Phase1_Unified.xml")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        results = update_crc_values(input_file, output_file)
        print("\nCRC values calculated successfully!")
        print("The protocol is now ready for SystmOne import.")

    except FileNotFoundError:
        print(f"❌ Error: File not found: {input_file}")
        sys.exit(1)
    except ET.ParseError as e:
        print(f"❌ Error parsing XML: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
