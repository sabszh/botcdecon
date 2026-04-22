from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List, Sequence

from backend.app.services.chat_formatting import shorten
from backend.app.services.local_retrieval import LocalCorpus
from backend.app.settings import settings


DEFAULT_QUERIES: Sequence[str] = (
    "empathy",
    "Berlin",
    "peace",
    "care",
    "species on this planet",
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect the local retriever from the terminal."
    )
    parser.add_argument(
        "queries",
        nargs="*",
        help="Queries to run. If omitted, a small demo set is used unless --interactive is set.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Open a simple prompt so you can type queries one at a time.",
    )
    parser.add_argument(
        "--data",
        default=settings.data_json_path,
        help="Path to the JSON corpus file used by the retriever.",
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Override the repository root used to resolve relative data paths.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Number of documents to print per query.",
    )
    parser.add_argument(
        "--index-name",
        default="local-source",
        help="Index name to use for the bot corpus path.",
    )
    parser.add_argument(
        "--chat-index-name",
        default="local-session",
        help="Index name that switches the retriever into chat-session mode.",
    )
    parser.add_argument(
        "--excluded-session-id",
        default=None,
        help="Session id to exclude when testing chat retrieval.",
    )
    return parser


def _repo_root_from_args(repo_root: str | None) -> Path:
    if repo_root:
        return Path(repo_root).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def _doc_surface_tokens(doc: dict) -> List[str]:
    metadata = doc.get("metadata") or {}
    surface = " ".join(
        str(part or "")
        for part in (
            doc.get("text"),
            metadata.get("slug"),
            metadata.get("title"),
            metadata.get("name"),
            metadata.get("location"),
            metadata.get("date"),
        )
    )
    return LocalCorpus.tokenize(surface)


def _format_overlap(query_tokens: Iterable[str], doc_tokens: Iterable[str]) -> str:
    overlap = sorted(set(query_tokens) & set(doc_tokens))
    return ", ".join(overlap) if overlap else "-"


def _print_result(query: str, docs: List[dict]) -> None:
    query_tokens = LocalCorpus.tokenize(query)
    print()
    print(f"Query: {query}")
    print(f"Tokens: {', '.join(query_tokens) if query_tokens else '-'}")
    if not docs:
        print("No hits.")
        return

    for idx, doc in enumerate(docs, start=1):
        metadata = doc.get("metadata") or {}
        text = str(doc.get("text") or "")
        text_tokens = LocalCorpus.tokenize(text)
        surface_tokens = _doc_surface_tokens(doc)
        score = float(doc.get("score") or 0.0)
        slug = str(metadata.get("slug") or doc.get("id") or "")
        name = str(metadata.get("name") or "") or "-"
        location = str(metadata.get("location") or "") or "-"
        date = str(metadata.get("date") or "") or "-"
        print(f"[{idx}] score={score:.4f} slug={slug}")
        print(f"    name={name} | location={location} | date={date}")
        print(f"    text: {shorten(text, 260)}")
        print(f"    text matches: {_format_overlap(query_tokens, text_tokens)}")
        print(f"    surface matches: {_format_overlap(query_tokens, surface_tokens)}")


def _run_queries(corpus: LocalCorpus, args: argparse.Namespace, queries: Sequence[str]) -> None:
    for query in queries:
        docs = corpus.retrieve(
            query,
            index_name=args.index_name,
            chat_index_name=args.chat_index_name,
            excluded_session_id=args.excluded_session_id,
            k=args.k,
        )
        _print_result(query, docs)


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    repo_root = _repo_root_from_args(args.repo_root)
    corpus = LocalCorpus(args.data, repo_root=repo_root)
    print(f"Loaded {corpus.entry_count} corpus entries from {args.data}")
    print(f"Repository root: {repo_root}")

    if corpus.entry_count <= 0:
        raise SystemExit("No corpus entries were loaded. Check --data and the repo root.")

    if args.interactive:
        print('Interactive mode. Type a query and press Enter. Type "quit" or "exit" to stop.')
        while True:
            try:
                query = input("query> ").strip()
            except EOFError:
                print()
                break
            if not query or query.lower() in {"quit", "exit"}:
                break
            _run_queries(corpus, args, [query])
        return

    queries = args.queries or list(DEFAULT_QUERIES)
    _run_queries(corpus, args, queries)


if __name__ == "__main__":
    main()