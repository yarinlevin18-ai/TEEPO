"""TEEPO Exam — Flask blueprint module.

This module is part of the same Flask app as TEEPO. It registers under the
URL prefix /exam and never executes if NEXT_PUBLIC_EXAM_MODULE_ENABLED is false.
"""
from flask import Blueprint

from .routes.plan_routes import plan_bp
from .routes.practice_routes import practice_bp
from .routes.simulation_routes import simulation_bp
from .routes.group_routes import group_bp


def register(app) -> None:
    root = Blueprint("exam_prep", __name__, url_prefix="/exam")
    root.register_blueprint(plan_bp, url_prefix="/plan")
    root.register_blueprint(practice_bp, url_prefix="/practice")
    root.register_blueprint(simulation_bp, url_prefix="/simulation")
    root.register_blueprint(group_bp, url_prefix="/group")
    app.register_blueprint(root)
