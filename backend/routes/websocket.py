"""WebSocket handlers for real-time study buddy chat."""
from flask_socketio import SocketIO, emit, join_room
from orchestrator_wrapper import get_orchestrator
from services import supabase_client as db
from config import logger
import uuid
from datetime import datetime

# Conversation history per socket session
_sessions: dict = {}


def register_socket_events(socketio: SocketIO):

    @socketio.on("connect")
    def on_connect():
        sid = _get_sid()
        _sessions[sid] = {"history": [], "conv_id": None, "user_id": None}
        emit("connected", {"message": "מחובר"})

    @socketio.on("disconnect")
    def on_disconnect():
        sid = _get_sid()
        session = _sessions.pop(sid, None)

        # Save session summary to global memory if meaningful conversation happened
        if session and len(session.get("history", [])) >= 4:
            try:
                orch = get_orchestrator()
                orch.save_session_summary(
                    user_id=session.get("user_id", "anonymous"),
                    messages=session["history"],
                    course_name=session.get("course_name", ""),
                )
            except Exception as e:
                logger.debug(f"Session summary save failed: {e}")

    @socketio.on("join")
    def on_join(data):
        """Client joins with user_id + optional agent_type room.
        user_id is validated but not fully verified over WebSocket
        (JWT auth happens on HTTP requests; WS uses the ID for conversation routing)."""
        sid = _get_sid()
        user_id = str(data.get("user_id", "anonymous"))[:128]  # limit length
        agent_type = data.get("agent_type", "study_buddy")
        if agent_type not in ("study_buddy", "academic"):
            agent_type = "study_buddy"
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
        except Exception as e:
            logger.debug(f"Failed to load conversation history for {user_id}: {e}")

    @socketio.on("message")
    def on_message(data):
        sid = _get_sid()
        session = _sessions.get(sid, {})
        user_id = session.get("user_id", "anonymous")
        question: str = str(data.get("text", ""))[:5000]
        # Bumped from 10k → 150k to support NotebookLM-style grounding where
        # the client ships entire PDF text as context. Claude Sonnet 4.5 has
        # a 200k context window so this is well within limits.
        context: str = str(data.get("context", ""))[:150_000]
        agent_type: str = data.get("agent_type", "study_buddy")
        course_id: str = str(data.get("course_id", ""))[:64]
        if agent_type not in ("study_buddy", "academic"):
            agent_type = "study_buddy"

        if not question.strip():
            return

        # Emit typing indicator
        emit("typing", {"agent": agent_type})

        # Check if web search will happen and notify client
        try:
            from services.web_search import should_search
            if should_search(question):
                emit("searching", {"agent": agent_type})
        except Exception:
            pass

        orch = get_orchestrator()

        # Build course context if a course_id is provided
        course_context = ""
        notes_context = ""
        course_name = ""
        if course_id:
            try:
                client = db.get_client()
                # Get course info
                cr = client.table("courses").select("title,description").eq("id", course_id).limit(1).execute()
                if cr.data:
                    c = cr.data[0]
                    course_name = c.get('title', '')
                    course_context = f"קורס: {course_name}\nתיאור: {c.get('description', '')}"
                    # Track course name in session for summary on disconnect
                    if sid in _sessions:
                        _sessions[sid]["course_name"] = course_name

                # Get lessons
                lr = client.table("lessons").select("title,content,ai_summary").eq("course_id", course_id).order("order_index").limit(20).execute()
                if lr.data:
                    lessons_text = "\n".join([
                        f"- {l.get('title','')}" + (f": {l.get('ai_summary','')[:300]}" if l.get('ai_summary') else "")
                        for l in lr.data
                    ])
                    course_context += f"\n\nשיעורים:\n{lessons_text}"

                # Get user notes
                nr = client.table("course_notes").select("title,content").eq("course_id", course_id).eq("user_id", user_id).order("updated_at", desc=True).limit(5).execute()
                if nr.data:
                    notes_context = "\n---\n".join([
                        f"**{n.get('title','')}**\n{n.get('content','')[:500]}"
                        for n in nr.data
                    ])
            except Exception as e:
                logger.debug(f"Failed to load course context: {e}")

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
                    course_context=course_context,
                    notes_context=notes_context,
                )
                answer = result.get("answer", "")
                _sessions[sid]["history"] = result.get("history", [])

            # Persist conversation
            _save_conversation(session, user_id, agent_type, question, answer)

            emit("reply", {"text": answer, "agent": agent_type})

        except Exception as exc:
            logger.error(f"WebSocket message error (user={user_id}, agent={agent_type}): {exc}")
            emit("error", {"message": f"שגיאה: {str(exc)}"})

    # ------------------------------------------------------------------ #

    def _save_conversation(session: dict, user_id: str, agent_type: str, question: str, answer: str):
        conv_id = session.get("conv_id")
        messages = session.get("history", [])
        try:
            if conv_id:
                db.update_conversation(conv_id, {
                    "messages": messages,
                    "last_message_at": datetime.utcnow().isoformat(),
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
        except Exception as e:
            logger.warning(f"Failed to save conversation for {user_id}: {e}")


def _get_sid():
    from flask import request as _req
    return _req.sid
