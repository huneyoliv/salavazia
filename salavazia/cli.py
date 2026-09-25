"""Command Line Interface for Sala Vazia."""

import argparse
import json
import logging
import sys
from pathlib import Path

from salavazia.client import SigaaClient
from salavazia.crawler import RoomCrawler


def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
        level=level,
    )


def handle_scan(args: argparse.Namespace) -> int:
    client = SigaaClient()
    crawler = RoomCrawler(
        client=client,
        max_workers=args.workers,
        request_delay=args.delay,
    )

    print(
        f"Iniciando varredura na faixa [{args.start} -> {args.end}] com {args.workers} workers..."
    )

    def on_progress(done: int, total: int, found_count: int) -> None:
        pct = (done / total) * 100
        sys.stdout.write(
            f"\rProgresso: {done}/{total} ({pct:.1f}%) | Salas encontradas: {found_count}"
        )
        sys.stdout.flush()

    rooms = crawler.scan_range(
        start_id=args.start,
        end_id=args.end,
        on_progress=on_progress,
    )
    print("\nVarredura finalizada!")
    print(f"Total de espaços/salas válidos identificados: {len(rooms)}")

    output_dir = Path(args.output_dir)
    json_path = output_dir / "rooms.json"
    csv_path = output_dir / "rooms.csv"

    crawler.export_to_json(rooms, json_path)
    crawler.export_to_csv(rooms, csv_path)

    print(f"Salvo em JSON: {json_path}")
    print(f"Salvo em CSV:  {csv_path}")
    return 0


def handle_probe(args: argparse.Namespace) -> int:
    client = SigaaClient()
    crawler = RoomCrawler(client=client)

    ids = [int(i) for i in args.ids]
    print(f"Consultando {len(ids)} ID(s) específicos...")
    rooms = crawler.scan_specific_ids(ids)

    if not rooms:
        print("Nenhuma sala válida encontrada para os IDs informados.")
        return 0

    for room in rooms:
        print(f"\n--- Sala ID {room.id} ---")
        print(f"Nome:       {room.name}")
        print(f"Prédio:     {room.building} | Número: {room.room_number}")
        print(f"Categoria:  {room.category} | Capacidade: {room.capacity}")
        print(f"Período:    {room.academic_period} | Horários ativos: {room.has_schedule}")
        print(f"Turmas:     {len(room.courses)} | Alocações de horário: {len(room.allocations)}")
        for course in room.courses[:5]:
            print(f"  * {course.code} - {course.name}")
        if len(room.courses) > 5:
            print(f"  ... e mais {len(room.courses) - 5} turmas.")
    return 0


def handle_summary(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        print(f"Erro: arquivo '{path}' não encontrado.", file=sys.stderr)
        return 1

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    print(f"\n=== Resumo do Catálogo: {path.name} ===")
    print(f"Total de salas catalogadas: {len(data)}")

    buildings: dict[str, int] = {}
    categories: dict[str, int] = {}
    with_schedule = 0

    for item in data:
        b = item.get("building", "UNKNOWN")
        buildings[b] = buildings.get(b, 0) + 1

        c = item.get("category", "OUTRO")
        categories[c] = categories.get(c, 0) + 1

        if item.get("has_schedule"):
            with_schedule += 1

    print(f"Salas com horários ativos: {with_schedule}")
    print(f"Salas sem horários no semestre: {len(data) - with_schedule}")

    print("\nDistribuição por Prédio / Bloco:")
    for b, count in sorted(buildings.items(), key=lambda x: -x[1]):
        print(f"  - {b:15s}: {count:3d} salas")

    print("\nDistribuição por Categoria:")
    for c, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  - {c:15s}: {count:3d}")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="salavazia",
        description="SIGAA UFS Classroom Mapper and Explorer",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Ativar logs detalhados")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # scan command
    scan_parser = subparsers.add_parser("scan", help="Varre uma faixa sequencial de IDs")
    scan_parser.add_argument("--start", type=int, required=True, help="ID inicial")
    scan_parser.add_argument("--end", type=int, required=True, help="ID final")
    scan_parser.add_argument(
        "--workers", type=int, default=5, help="Número de threads simultâneas (padrão: 5)"
    )
    scan_parser.add_argument(
        "--delay", type=float, default=0.05, help="Delay entre requisições em segundos"
    )
    scan_parser.add_argument(
        "--output-dir", type=str, default="data", help="Diretório de saída (padrão: data)"
    )

    # probe command
    probe_parser = subparsers.add_parser("probe", help="Consulta IDs específicos")
    probe_parser.add_argument("--ids", nargs="+", required=True, help="Lista de IDs a consultar")

    # summary command
    summary_parser = subparsers.add_parser("summary", help="Exibe resumo do catálogo de salas")
    summary_parser.add_argument(
        "--file", type=str, default="data/rooms.json", help="Caminho do arquivo rooms.json"
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    setup_logging(args.verbose)

    if args.command == "scan":
        return handle_scan(args)
    elif args.command == "probe":
        return handle_probe(args)
    elif args.command == "summary":
        return handle_summary(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())
