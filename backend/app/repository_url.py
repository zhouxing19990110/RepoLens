from __future__ import annotations

import re
from urllib.parse import urlsplit

from .errors import RepoLensError


_OWNER = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\Z", re.ASCII)
_REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+\Z", re.ASCII)
_MESSAGE = "Enter a public GitHub repository URL."


def _invalid_url() -> RepoLensError:
    return RepoLensError("invalid_url", _MESSAGE, 422)


def parse_repository_url(url: str) -> tuple[str, str]:
    """Return normalized public GitHub owner/repository identifiers."""
    if not isinstance(url, str):
        raise _invalid_url()
    candidate = url.strip()
    if not candidate or any(ord(character) < 33 or ord(character) > 126 or character in "%\\?#" for character in candidate):
        raise _invalid_url()
    try:
        parts = urlsplit(candidate)
        if (
            parts.scheme != "https"
            or parts.hostname != "github.com"
            or "@" in parts.netloc
            or parts.netloc.endswith(":")
            or parts.port not in (None, 443)
            or parts.query
            or parts.fragment
        ):
            raise _invalid_url()
    except ValueError as exc:
        raise _invalid_url() from exc

    path = parts.path.removesuffix("/")
    segments = path.split("/")
    if len(segments) != 3 or segments[0] != "":
        raise _invalid_url()
    owner, repository = segments[1:]
    if repository.endswith(".git"):
        repository = repository[:-4]
    if (
        not _OWNER.fullmatch(owner)
        or "--" in owner
        or not _REPOSITORY.fullmatch(repository)
        or repository in (".", "..")
        or repository.endswith(".git")
    ):
        raise _invalid_url()
    return owner.lower(), repository.lower()
