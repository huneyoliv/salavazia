"""HTTP Client for interacting with SIGAA UFS public space endpoints."""

import logging
import threading
from typing import cast

import requests
from urllib3.util import Retry

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

BASE_ROOM_URL = "https://www.sigaa.ufs.br/sigaa/public/espaco_fisico/impressao_salas"


class SigaaClient:
    """Manages HTTP session and requests to SIGAA UFS."""

    def __init__(
        self,
        base_url: str = BASE_ROOM_URL,
        user_agent: str = DEFAULT_USER_AGENT,
        max_retries: int = 3,
        backoff_factor: float = 0.5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self._thread_local = threading.local()
        self._sessions: list[requests.Session] = []
        self._lock = threading.Lock()

    def _get_session(self) -> requests.Session:
        if not hasattr(self._thread_local, "session"):
            session = requests.Session()
            session.headers.update(
                {
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                }
            )
            adapter = requests.adapters.HTTPAdapter(
                max_retries=Retry(
                    total=self.max_retries,
                    backoff_factor=self.backoff_factor,
                    status_forcelist=[500, 502, 503, 504],
                )
            )
            session.mount("https://", adapter)
            session.mount("http://", adapter)
            self._thread_local.session = session
            with self._lock:
                self._sessions.append(session)
        return cast(requests.Session, self._thread_local.session)

    @property
    def session(self) -> requests.Session:
        """Return the session for the current thread."""
        return self._get_session()

    def fetch_room_html(self, id_sala: int, timeout: float = 12.0) -> str | None:
        """Fetch the HTML response for a given physical space ID.

        Follows HTTP 302 redirects automatically and preserves session cookies.
        """
        url = f"{self.base_url}/{id_sala}"
        try:
            session = self._get_session()
            response = session.get(url, timeout=timeout, allow_redirects=True)
            response.raise_for_status()
            # SIGAA pages typically use ISO-8859-1 / Latin-1 encoding
            response.encoding = response.apparent_encoding or "latin-1"
            return response.text
        except requests.RequestException as exc:
            logger.warning("Failed to fetch room ID %d: %s", id_sala, exc)
            return None

    def close(self) -> None:
        """Close all opened sessions across threads."""
        with self._lock:
            for s in self._sessions:
                try:
                    s.close()
                except Exception:
                    pass
            self._sessions.clear()

    def __enter__(self) -> "SigaaClient":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        self.close()
