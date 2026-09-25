"""Unit tests for the SigaaClient HTTP client."""

from unittest.mock import MagicMock, patch

import requests

from salavazia.client import SigaaClient


def test_client_fetch_room_html_success() -> None:
    with patch.object(requests.Session, "get") as mock_get:
        mock_response = MagicMock()
        mock_response.text = "<html><h1>SALA</h1></html>"
        mock_response.apparent_encoding = "latin-1"
        mock_get.return_value = mock_response

        client = SigaaClient()
        html = client.fetch_room_html(1008644)
        assert html == "<html><h1>SALA</h1></html>"
        mock_get.assert_called_once()


def test_client_fetch_room_html_network_failure() -> None:
    with patch.object(requests.Session, "get") as mock_get:
        mock_get.side_effect = requests.RequestException("Connection error")

        client = SigaaClient()
        html = client.fetch_room_html(1008644)
        assert html is None
