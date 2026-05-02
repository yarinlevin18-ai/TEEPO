"""PDF text extraction with Hebrew OCR fallback. Spec §C.3 + §13."""
from __future__ import annotations

import io
import os
from dataclasses import dataclass

import pdfplumber

# pytesseract + Tesseract are optional — needed only if a page has no extractable
# text and we have to OCR it. We import lazily so the standalone exam_app can
# boot without the OCR pipeline installed.
try:
    import pytesseract  # type: ignore[import-not-found]
    from PIL import Image  # noqa: F401
    if os.environ.get("TESSERACT_PATH"):
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_PATH"]
    _OCR_AVAILABLE = True
except ImportError:
    pytesseract = None  # type: ignore[assignment]
    _OCR_AVAILABLE = False

TESSERACT_LANG = os.environ.get("TESSERACT_LANG", "heb+eng")


@dataclass
class PageText:
    page: int
    text: str
    via_ocr: bool
    confidence: float  # 0..1, ~1.0 for native text, lower for OCR


def extract(pdf_bytes: bytes) -> list[PageText]:
    out: list[PageText] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            if len(text) >= 30:
                out.append(PageText(page=i, text=text, via_ocr=False, confidence=1.0))
                continue
            if not _OCR_AVAILABLE:
                # No OCR fallback available — return what we have, mark low confidence.
                out.append(PageText(page=i, text=text, via_ocr=False, confidence=0.0))
                continue
            # Hebrew scan fallback — render to image and OCR.
            img = page.to_image(resolution=200).original
            data = pytesseract.image_to_data(img, lang=TESSERACT_LANG, output_type=pytesseract.Output.DICT)
            words = [w for w, c in zip(data["text"], data["conf"]) if w.strip() and int(c) >= 0]
            confs = [int(c) for c in data["conf"] if c not in ("-1", -1)]
            avg = (sum(confs) / len(confs) / 100) if confs else 0.0
            out.append(PageText(page=i, text=" ".join(words), via_ocr=True, confidence=avg))
    return out
