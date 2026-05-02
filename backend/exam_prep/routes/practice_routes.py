"""Practice generation + grading. Spec §3.3."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..agents import answer_evaluator, question_generator

practice_bp = Blueprint("practice", __name__)


@practice_bp.post("/generate")
def generate():
    """Generate a practice session of the requested type."""
    body = request.get_json(force=True)
    kind = body["type"]  # mcq | open | flashcard
    topic = body["topic"]
    sources = body["sources"]
    n = body.get("n", 8)
    difficulty = body.get("difficulty", "medium")

    if kind == "mcq":
        out = question_generator.generate_mcq(topic, sources, n=n, difficulty=difficulty)
    elif kind == "open":
        out = question_generator.generate_open(topic, sources, n=n, difficulty=difficulty)
    elif kind == "flashcard":
        out = question_generator.generate_flashcards(topic, sources, n=n)
    else:
        return jsonify({"error": f"unknown type: {kind}"}), 400

    return jsonify(out)


@practice_bp.post("/evaluate")
def evaluate_open():
    """Grade a single open-question answer."""
    body = request.get_json(force=True)
    result = answer_evaluator.evaluate(
        question=body["question"],
        reference_answer=body.get("reference_answer"),
        course_snippets=body.get("course_snippets", []),
        student_answer=body["student_answer"],
    )
    return jsonify(result)
