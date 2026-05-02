"""Plan routes: build, fetch, update, advance day. Spec §3.2."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..agents import plan_builder, topic_extractor

plan_bp = Blueprint("plan", __name__)


@plan_bp.post("/topics")
def extract_topics():
    """Phase 1 of plan creation: extract topic candidates from course materials."""
    body = request.get_json(force=True)
    topics = topic_extractor.extract(
        course_name=body["course_name"],
        exam_type=body["exam_type"],
        materials=body["materials"],
    )
    return jsonify({"topics": topics})


@plan_bp.post("/build")
def build_plan():
    """Phase 2: with confirmed topics + ratings, generate the day-by-day plan."""
    body = request.get_json(force=True)
    plan = plan_builder.build(
        days_available=body["days_available"],
        daily_minutes=body["daily_minutes"],
        available_days_of_week=body["available_days"],
        topics_with_ratings=body["topics"],
        calendar_conflicts=body.get("calendar_conflicts", []),
    )
    return jsonify(plan)


@plan_bp.post("/<plan_id>/day/<date>/complete")
def complete_day(plan_id: str, date: str):
    """Mark a day completed and trigger plan rebalancing if needed."""
    body = request.get_json(force=True)
    # body: {"completion": "all|partial|none", "note": "..."}
    # TODO: persist to Drive DB, rebalance subsequent days based on completion + practice perf.
    return jsonify({"plan_id": plan_id, "date": date, "rebalanced": False})
