"""Simulation upload, run, analyze. Spec §3.4."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..agents import simulation_analyzer
from ..services import exam_pdf_parser

simulation_bp = Blueprint("simulation", __name__)


@simulation_bp.post("/parse")
def parse_pdf():
    """Extract structured questions from an uploaded past-exam PDF."""
    if "file" not in request.files:
        return jsonify({"error": "missing file"}), 400
    parsed = exam_pdf_parser.parse(request.files["file"].read())
    return jsonify(parsed)


@simulation_bp.post("/<sim_id>/submit")
def submit(sim_id: str):
    """Submit answers; trigger AI analysis."""
    body = request.get_json(force=True)
    analysis = simulation_analyzer.analyze(
        questions_and_answers=body["qa"],
        topic_mapping=body["topic_mapping"],
    )
    return jsonify({"simulation_id": sim_id, "analysis": analysis})
