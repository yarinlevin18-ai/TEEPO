"""WebSocket handlers for real-time study buddy chat."""
from flask_socketio import SocketIO, emit, join_room
from orchestrator_wrapper import get_orchestrator
from services import supabase_client as db
import uuid

# Conversation history per socket session
_sessions: dict = {}


def register_socket_events(socketio: SocketIO):

    @socketio.on("connect")
    def on_connect():
        sid = _get_sid()
        _sessions[sid] = {"history": [], "conv_id": None, "user_id": None}
        emit("connected", {"message": "מחובר לעוזר הלימוד"})

    @socketio.on("disconnect")
    def on_disconnect():
        sid = _get_sid()
        _sessions.pop(sid, None)

    @socketio.on("join")
    def on_join(data):
        """Client joins with user_id + optional agent_type room."""
        sid = _get_sid()
        user_id = data.get("user_id", "anonymous")
        agent_type = data.get("agent_type", "study_buddy")
        if sid in _sessions:
            _sessions[sid]["user_id"] = user_id
        join_room(f"{user_id}:{agent_type}")

        # Load previous conversation
        try:
            res = db.get_conversations(user_id, agent_type)
            if res.data:
                conv = res.data[0]
                _sessions[sid]["conv_id"] = conv["id"]
                _sessions[sid]["history"] = conv.get("messages", [])
                emit("history_loaded", {"messages": _sessions[sid]["history"]})
        except Exception:
            pass

    @socketio.on("message")
    def on_message(data):
        sid = _get_sid()
        session = _sessions.get(sid, {})
        user_id = session.get("user_id", "anonymous")
        question: str = data.get("text", "")
        context: str = data.get("context", "")  # Optional lesson context
        agent_type: str = data.get("agent_type", "study_buddy")

        if not question.strip():
            return

        # Emit typing indicator
        emit("typing", {"agent": agent_type})

        orch = get_orchestrator()

        try:
            if agent_type == "academic":
                result = orch.get_bgu_advice(
                    course_name=context,
                    major=data.get("major", ""),
                )
                answer = result.get("advice") or result.get("answer", "")
            else:
                result = orch.answer_question(
                    question=question,
                    context=context,
                    history=list(session.get("history", [])),
                )
                answer = result.get("answer", "")
                _sessions[sid]["history"] = result.get("history", [])

            # Persist conversation
            _save_conversation(session, user_id, agent_type, question, answer)

            emit("reply", {"text": answer, "agent": agent_type})

        except Exception as exc:
            emit("error", {"message": f"שגיאה: {str(exc)}"})

    # ------------------------------------------------------------------ #

    def _save_conversation(session: dict, user_id: str, agent_type: str, question: str, answer: str):
        conv_id = session.get("conv_id")
        messages = session.get("history", [])
        try:
            if conv_id:
                db.update_conversation(conv_id, {
                    "messages": messages,
                    "last_message_at": "now()",
                })
            else:
                conv_id = str(uuid.uuid4())
                session["conv_id"] = conv_id
                db.save_conversation({
                    "id": conv_id,
                    "user_id": user_id,
                    "agent_type": agent_type,
                    "messages": messages,
                })
        except Exception:
            pass


def _get_sid():
    from flask import request as _req
    return _req.sid
