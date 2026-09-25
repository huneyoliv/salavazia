"""HTML parser for SIGAA UFS room schedule and physical space pages."""

import html
import re

from bs4 import BeautifulSoup

from salavazia.models import Course, Room, SlotAllocation


def normalize_room_metadata(raw_title: str) -> tuple[str, str, str]:
    """Extract category, building, and room number from a SIGAA room title.

    Examples:
        'SALA DE AULA - DID 6 - 106' -> ('SALA DE AULA', 'DID 6', '106')
        'DCC - LAB. DE CONTABILIDADE - DID 1 - 014' -> ('LABORATORIO', 'DID 1', '014')
        'DMA - LABORATORIO ENSINO MATEMATICA - 001' -> ('LABORATORIO', 'DMA', '001')
        'DCOS - SALA DE PROJEÇÃO - DID 6 SALA 101' -> ('PROJECAO', 'DID 6', '101')
    """
    clean_title = html.unescape(raw_title).strip()
    upper = clean_title.upper()

    # Determine category
    category = "OUTRO"
    if "LAB" in upper:
        category = "LABORATORIO"
    elif "AUDIT" in upper:
        category = "AUDITORIO"
    elif "PROJE" in upper:
        category = "PROJECAO"
    elif "GABINETE" in upper:
        category = "GABINETE"
    elif "SALA" in upper:
        category = "SALA DE AULA"

    # Match common Didática pattern (e.g., DID 6 - 106, DID 1 - 014, DID 6 SALA 101)
    did_match = re.search(r"\b(DID\s*\d+)\s*(?:-|SALA)?\s*([0-9A-Z]+)\b", upper)
    if did_match:
        building = re.sub(r"\s+", " ", did_match.group(1)).strip()
        room_number = did_match.group(2).strip()
        return category, building, room_number

    # Match Bloco pattern (e.g. BLOCO C SALA - 104, BLOCO D SALA - 106)
    bloco_match = re.search(r"\b(BLOCO\s+[A-Z])\b", upper)
    tokens = [t.strip() for t in clean_title.split("-") if t.strip()]
    if bloco_match:
        building = bloco_match.group(1).strip()
        room_number = tokens[-1] if tokens else clean_title
        return category, building, room_number

    # Match department pattern (e.g. DMA - ... - 001, SALA DE AULA 01 - DEF - 001)
    dept_prefixes = ("SALA DE AULA", "LABORATORIO", "AUDITORIO")
    if len(tokens) >= 3:
        first_upper = tokens[0].upper()
        if any(first_upper.startswith(p) for p in dept_prefixes):
            building = tokens[1]
        else:
            building = tokens[0]
        room_number = tokens[-1]
        return category, building, room_number
    elif len(tokens) == 2:
        first_upper = tokens[0].upper()
        if any(first_upper.startswith(p) for p in dept_prefixes):
            building = "UNKNOWN"
            room_number = tokens[1]
        else:
            building = tokens[0]
            room_number = tokens[1]
        return category, building, room_number

    return category, "UNKNOWN", clean_title


def parse_room_page(id_sala: int, page_html: str) -> Room | None:
    """Parse SIGAA room HTML page into a structured Room object.

    Returns None if the space ID does not exist in SIGAA.
    Returns a Room with has_schedule=False if the space exists but has no active schedule.
    """
    unescaped_html = html.unescape(page_html)

    # 1. Check for non-existent physical space
    if "Não foram encontrados dados para o espaço físico" in unescaped_html:
        return None

    # 2. Extract academic period and capacity
    period_match = re.search(
        r"Ano/Per[ií]odo:\s*</span>\s*([^<\n\r]+)",
        unescaped_html,
        re.IGNORECASE,
    )
    academic_period = period_match.group(1).strip() if period_match else ""

    capacity_match = re.search(
        r"Capacidade M[aá]xima:\s*</span>\s*(\d+)",
        unescaped_html,
        re.IGNORECASE,
    )
    capacity = int(capacity_match.group(1)) if capacity_match else 0

    capacity_avail_match = re.search(
        r"Capacidade Dispon[ií]vel\(%\):\s*</span>\s*(\d+)",
        unescaped_html,
        re.IGNORECASE,
    )
    capacity_pct = int(capacity_avail_match.group(1)) if capacity_avail_match else 0

    # 3. Check if space exists but has no schedules in current period
    has_no_schedules_msg = "Não foram encontrados horários para o físico" in unescaped_html

    soup = BeautifulSoup(page_html, "html.parser")

    # Find the room title (ignore error message headers)
    room_title = ""
    for h1 in soup.find_all("h1"):
        h1_text = h1.get_text(strip=True)
        if "não foram encontrados" not in h1_text.lower():
            room_title = h1_text
            break

    if not room_title:
        if has_no_schedules_msg:
            # Physical space exists but is either unassigned or has no title rendered
            category, building, room_number = "OUTRO", "UNKNOWN", str(id_sala)
            return Room(
                id=id_sala,
                name=f"ESPACO_{id_sala}",
                building=building,
                room_number=room_number,
                category=category,
                capacity=capacity,
                available_capacity_pct=capacity_pct,
                academic_period=academic_period,
                has_schedule=False,
                status="no_schedule",
                courses=[],
                allocations=[],
            )
        return None

    category, building, room_number = normalize_room_metadata(room_title)

    if has_no_schedules_msg:
        return Room(
            id=id_sala,
            name=room_title,
            building=building,
            room_number=room_number,
            category=category,
            capacity=capacity,
            available_capacity_pct=capacity_pct,
            academic_period=academic_period,
            has_schedule=False,
            status="no_schedule",
            courses=[],
            allocations=[],
        )

    # 4. Extract courses table (usually the second table with class 'listagem')
    courses: list[Course] = []
    course_tables = soup.find_all("table", class_="listagem")
    for tbl in course_tables:
        header_th = tbl.find_all("th")
        if any(
            "Código da Turma" in th.get_text() or "C&oacute;digo da Turma" in th.get_text()
            for th in header_th
        ):
            for row in tbl.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) >= 2:
                    code = cols[0].get_text(strip=True)
                    name = cols[1].get_text(strip=True)
                    courses.append(Course(code=code, name=name))

    # 5. Extract slot allocations injected via JavaScript
    # Pattern: var elem = document.getElementById('{id}_{dia}_{turno}_{horario}');
    # followed by elem.innerHTML = elem.innerHTML + '{codigo_turma}';
    allocations: list[SlotAllocation] = []
    js_blocks = re.findall(
        r"document\.getElementById\('(\d+)_(\d+)_(\d+)_(\d+)'\);[\s\S]*?elem\.innerHTML\s*\+\s*'([^']+)'",
        page_html,
    )
    for block in js_blocks:
        slot_room_id, day, shift, slot_idx, raw_code = block
        clean_code = raw_code.replace("<br>", "").strip()
        allocations.append(
            SlotAllocation(
                slot_id=f"{slot_room_id}_{day}_{shift}_{slot_idx}",
                day_of_week=int(day),
                shift=int(shift),
                slot_index=int(slot_idx),
                class_code=clean_code,
            )
        )

    return Room(
        id=id_sala,
        name=room_title,
        building=building,
        room_number=room_number,
        category=category,
        capacity=capacity,
        available_capacity_pct=capacity_pct,
        academic_period=academic_period,
        has_schedule=len(allocations) > 0 or len(courses) > 0,
        status="active" if (len(allocations) > 0 or len(courses) > 0) else "no_schedule",
        courses=courses,
        allocations=allocations,
    )
