"""
Project Z - ADMS Payload Parser
Parses ZKTeco ADMS HTTP push protocol payloads.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ADMSAttendanceRecord:
    """Parsed attendance record from ADMS payload."""
    user_id: str
    timestamp: datetime
    status: int  # 0=check-in, 1=check-out, 2=break-out, 3=break-in, 4=OT-in, 5=OT-out
    verify_type: int  # 0=password, 1=fingerprint, 2=card, 9=face
    work_code: str = ""
    reserved1: str = ""
    reserved2: str = ""


def parse_adms_attlog(body: str) -> list[ADMSAttendanceRecord]:
    """
    Parse ADMS ATTLOG payload body.

    Standard ZKTeco format — each line is tab-separated:
    {user_id}\t{timestamp}\t{status}\t{verify_type}\t{work_code}\t{reserved1}\t{reserved2}

    Rodasoft variants handled:
    - Header lines beginning with "ATTLOG:", "USERPIC:", "USER:", etc. are skipped
    - Lines beginning with "#" or "//" are skipped (comment lines)
    - Single-space delimiter fallback when tab count < 2
    - Trailing \r stripped from every field

    Example:
    1\t2024-01-15 08:30:45\t0\t1\t0\t0\t0
    """
    records = []

    if not body or not body.strip():
        return records

    for line in body.strip().splitlines():
        line = line.strip()
        if not line:
            continue

        # Skip known header/directive lines sent by some Rodasoft/ZKTeco firmware
        upper = line.upper()
        if (
            upper.startswith("ATTLOG:")
            or upper.startswith("USERPIC:")
            or upper.startswith("USER:")
            or upper.startswith("OPERLOG:")
            or upper.startswith("#")
            or upper.startswith("//")
        ):
            logger.debug(f"ADMS parser: skipping header/directive line: {line!r}")
            continue

        try:
            # Primary delimiter: tab. Fallback: multiple spaces or single space.
            if "\t" in line:
                parts = [p.strip() for p in line.split("\t")]
            else:
                # Some firmware versions use space as delimiter
                parts = line.split()

            if len(parts) < 2:
                logger.warning(
                    f"ADMS parser: skipping malformed line "
                    f"(expected ≥2 fields, got {len(parts)}): {line!r}"
                )
                continue

            user_id = parts[0]
            timestamp_str = parts[1]

            # Parse timestamp — handle various formats
            timestamp = _parse_timestamp(timestamp_str)
            if not timestamp:
                logger.warning(
                    f"ADMS parser: unparseable timestamp {timestamp_str!r} "
                    f"in line: {line!r}"
                )
                continue

            status = int(parts[2]) if len(parts) > 2 else 0
            verify_type = int(parts[3]) if len(parts) > 3 else 1
            work_code = parts[4] if len(parts) > 4 else ""
            reserved1 = parts[5] if len(parts) > 5 else ""
            reserved2 = parts[6] if len(parts) > 6 else ""

            records.append(
                ADMSAttendanceRecord(
                    user_id=user_id,
                    timestamp=timestamp,
                    status=status,
                    verify_type=verify_type,
                    work_code=work_code,
                    reserved1=reserved1,
                    reserved2=reserved2,
                )
            )
        except (ValueError, IndexError) as e:
            logger.error(f"ADMS parser: error on line {line!r}: {e}")
            continue

    if not records:
        logger.warning(
            f"ADMS parser: produced 0 records from body "
            f"({len(body)} bytes). First 300 chars: {body[:300]!r}"
        )

    return records


def _parse_timestamp(ts: str) -> Optional[datetime]:
    """Parse timestamp from various ZKTeco formats."""
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            continue
    return None


def map_verify_type(code: int) -> str:
    """Map ZKTeco verify type code to human-readable string."""
    mapping = {
        0: "password",
        1: "fingerprint",
        2: "card",
        9: "face",
    }
    return mapping.get(code, "other")


def map_punch_status(status: int) -> str:
    """Map ZKTeco status code to punch direction."""
    # 0=check-in, 1=check-out, 2=break-out, 3=break-in, 4=OT-in, 5=OT-out
    if status in (0, 3, 4):
        return "in"
    elif status in (1, 2, 5):
        return "out"
    return "unknown"


def generate_adms_options_response(serial_number: str) -> str:
    """
    Generate ADMS GET options response for device handshake.

    Critical settings:
    - Realtime=1: push each scan immediately (not batched)
    - TransInterval=1: minimum interval between pushes (seconds)
    - Delay=1: polling interval in seconds
    - TransFlag: which data types to transmit
    - Time: syncs device clock (many ZKTeco devices lose time on power loss)
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    time_str = now.strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"GET OPTION FROM: {serial_number}\r\n"
        f"Time={time_str}\r\n"
        "ATTLOGStamp=None\r\n"
        "OPERLOGStamp=None\r\n"
        "ATTPHOTOStamp=None\r\n"
        "ErrorDelay=30\r\n"
        "Delay=1\r\n"
        "TransTimes=00:00;23:59\r\n"
        "TransInterval=1\r\n"
        "TransFlag=TransData AttLog\r\n"
        "Realtime=1\r\n"
        "Duplicate=1\r\n"
        "DUPKICK=0\r\n"
        "Encrypt=0\r\n"
        "ServerVer=2.4.1\r\n"
        "PushProtVer=2.4.1\r\n"
        "PushOptionsFlag=1\r\n"
    )
