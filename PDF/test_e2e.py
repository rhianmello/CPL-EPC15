"""Testes ponta a ponta do módulo PDF.

Executar na raiz do repositório:
  pip install pytest playwright pypdf
  python -m playwright install chromium
  pytest -q PDF/test_e2e.py

É necessário acesso às CDNs das bibliotecas. Nenhum PDF de teste é enviado à rede.
"""
import hashlib
import http.server
import socketserver
import threading
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def url():
    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
    handler = lambda *args, **kw: http.server.SimpleHTTPRequestHandler(
        *args, directory=str(ROOT), **kw
    )
    with Server(("127.0.0.1", 0), handler) as srv:
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        yield f"http://127.0.0.1:{srv.server_address[1]}/PDF/"
        srv.shutdown()
        thread.join(timeout=3)


@pytest.fixture
def browser():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        yield browser
        browser.close()


def fixture_pdf(path, width=595, height=842, encrypted=False):
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    if encrypted:
        writer.encrypt("senha-de-teste")
    with path.open("wb") as output:
        writer.write(output)
    return path


def load(page, url):
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_function("window.PDFLib && window.pdfjsLib", timeout=30000)


def add(page, paths):
    page.locator("#input").set_input_files([str(p) for p in paths])
    page.wait_for_function(
        "(n) => document.querySelectorAll('#files .file').length === n",
        arg=len(paths), timeout=30000
    )


def download(page, tmp_path):
    with page.expect_download(timeout=45000) as d:
        page.locator("#generate").click()
    result = d.value
    path = tmp_path / result.suggested_filename
    result.save_as(path)
    return path


def test_archive_preserves_sha256(browser, url, tmp_path):
    originals = [
        fixture_pdf(tmp_path / "horizontal.pdf", 842, 595),
        fixture_pdf(tmp_path / "vertical.pdf", 595, 842),
    ]
    page = browser.new_page(accept_downloads=True)
    load(page, url)
    add(page, originals)
    assert page.locator("input[value='archive']").is_checked()
    result = download(page, tmp_path)
    assert "SHA-256 conferidos" in page.locator("#result").inner_text()
    attachments = PdfReader(str(result)).attachments
    for i, original in enumerate(originals, 1):
        name = f"{i:03}_{original.name}"
        assert name in attachments
        payload = attachments[name]
        if isinstance(payload, list):
            payload = payload[0]
        assert hashlib.sha256(payload).hexdigest() == hashlib.sha256(original.read_bytes()).hexdigest()
        assert payload == original.read_bytes()
    assert "RELATORIO_SHA256.json" in attachments
    page.close()


def test_merge_continuous_pages(browser, url, tmp_path):
    originals = [
        fixture_pdf(tmp_path / "a.pdf", 842, 595),
        fixture_pdf(tmp_path / "b.pdf", 595, 842),
    ]
    page = browser.new_page(accept_downloads=True)
    load(page, url)
    add(page, originals)
    page.locator("input[value='merge']").check()
    assert "não conserva as assinaturas" in page.locator("#notice").inner_text()
    result = download(page, tmp_path)
    reader = PdfReader(str(result))
    assert len(reader.pages) == 2
    assert abs(float(reader.pages[0].mediabox.width) - 842) < 1
    assert abs(float(reader.pages[1].mediabox.width) - 595) < 1
    page.close()


def test_encrypted_pdf_archived_without_decryption(browser, url, tmp_path):
    secret = fixture_pdf(tmp_path / "protegido.pdf", encrypted=True)
    regular = fixture_pdf(tmp_path / "normal.pdf")
    page = browser.new_page(accept_downloads=True)
    load(page, url)
    add(page, [secret, regular])
    result = download(page, tmp_path)
    payload = PdfReader(str(result)).attachments["001_protegido.pdf"]
    if isinstance(payload, list):
        payload = payload[0]
    assert payload == secret.read_bytes()
    page.locator("input[value='merge']").check()
    page.locator("#generate").click()
    page.wait_for_function("document.querySelector('#result').classList.contains('error')")
    assert "protegido" in page.locator("#result").inner_text().lower()
    page.close()
