"""Unit tests for the SIGAA HTML parser."""

from salavazia.parser import normalize_room_metadata, parse_room_page

SAMPLE_VALID_ROOM_HTML = """
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<form id="j_id">
    <span style="font-weight: bold;">Ano/Per&iacute;odo: </span>2026/2<br/>
    <span style="font-weight: bold;">Capacidade M&aacute;xima: </span>50<br/>
    <span style="font-weight: bold;">Capacidade Dispon&iacute;vel(%): </span>40 (80%)<br/>
</form>
<h1>SALA DE AULA - DID 6 - 106</h1>
<table class="listagem horario" name="tabHorarios" id=1008644>
    <tr><td align="center"><span id="1008644_5_2_1"></span></td></tr>
</table>
<script type="text/javascript">
    var elem = document.getElementById('1008644_5_2_1');
    if (elem){
        if(elem.innerHTML=='') elem.innerHTML= elem.innerHTML + 'COMSO0294-01';
        else elem.innerHTML =  elem.innerHTML+ '<br>COMSO0294-01';
    }
</script>
<table class="listagem">
    <tr>
        <th>Código da Turma</th>
        <th>Disciplina</th>
    </tr>
    <tr class="linhaPar">
        <td>COMSO0294-01</td>
        <td>INTRODUÇÃO À SOCIOLOGIA</td>
    </tr>
</table>
</body>
</html>
"""

SAMPLE_NO_SCHEDULE_HTML = """
<html>
<body>
<form id="j_id">
    <span style="font-weight: bold;">Ano/Per&iacute;odo: </span>2026/2<br/>
    <span style="font-weight: bold;">Capacidade M&aacute;xima: </span>30<br/>
    <span style="font-weight: bold;">Capacidade Dispon&iacute;vel(%): </span>30 (100%)<br/>
</form>
<h1 style="color: Red;">Não foram encontrados horários para o físico selecionado.</h1>
</body>
</html>
"""

SAMPLE_NONEXISTENT_HTML = """
<html>
<body>
<h1 style="color: Red;">Não foram encontrados dados para o espaço físico selecionado.</h1>
</body>
</html>
"""


def test_normalize_room_metadata() -> None:
    category, building, number = normalize_room_metadata("SALA DE AULA - DID 6 - 106")
    assert category == "SALA DE AULA"
    assert building == "DID 6"
    assert number == "106"

    category, building, number = normalize_room_metadata(
        "DCC - LAB. DE CONTABILIDADE - DID 1 - 014"
    )
    assert category == "LABORATORIO"
    assert building == "DID 1"
    assert number == "014"

    category, building, number = normalize_room_metadata("DCOS - SALA DE PROJEÇÃO - DID 6 SALA 101")
    assert category == "PROJECAO"
    assert building == "DID 6"
    assert number == "101"

    category, building, number = normalize_room_metadata(
        "DMA - LABORATORIO ENSINO MATEMATICA - 001"
    )
    assert category == "LABORATORIO"
    assert building == "DMA"
    assert number == "001"

    category, building, number = normalize_room_metadata("SALA DE AULA - DMO - 001")
    assert category == "SALA DE AULA"
    assert building == "DMO"
    assert number == "001"

    category, building, number = normalize_room_metadata("BLOCO C SALA - 104")
    assert category == "SALA DE AULA"
    assert building == "BLOCO C"
    assert number == "104"

    category, building, number = normalize_room_metadata("SALA DE AULA 01 - DEF - 001")
    assert category == "SALA DE AULA"
    assert building == "DEF"
    assert number == "001"


def test_parse_valid_room() -> None:
    room = parse_room_page(1008644, SAMPLE_VALID_ROOM_HTML)
    assert room is not None
    assert room.id == 1008644
    assert room.name == "SALA DE AULA - DID 6 - 106"
    assert room.building == "DID 6"
    assert room.room_number == "106"
    assert room.category == "SALA DE AULA"
    assert room.capacity == 50
    assert room.academic_period == "2026/2"
    assert room.has_schedule is True
    assert room.status == "active"

    assert len(room.courses) == 1
    assert room.courses[0].code == "COMSO0294-01"
    assert "INTRODUÇÃO À SOCIOLOGIA" in room.courses[0].name

    assert len(room.allocations) == 1
    alloc = room.allocations[0]
    assert alloc.day_of_week == 5
    assert alloc.shift == 2
    assert alloc.slot_index == 1
    assert alloc.class_code == "COMSO0294-01"


def test_parse_no_schedule_room() -> None:
    room = parse_room_page(1008645, SAMPLE_NO_SCHEDULE_HTML)
    assert room is not None
    assert room.id == 1008645
    assert room.capacity == 30
    assert room.has_schedule is False
    assert room.status == "no_schedule"
    assert len(room.courses) == 0
    assert len(room.allocations) == 0


def test_parse_nonexistent_room() -> None:
    room = parse_room_page(9999999, SAMPLE_NONEXISTENT_HTML)
    assert room is None


def test_parse_malformed_html() -> None:
    room = parse_room_page(12345, "<html><body>Invalid empty content</body></html>")
    assert room is None
