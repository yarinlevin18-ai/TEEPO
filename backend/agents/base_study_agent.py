"""Base class for all study-specific agents."""
from abc import ABC, abstractmethod
from typing import Dict, Any
import anthropic
import os
import sys

# Try to import from existing orchestrator
_ORCHESTRATOR_PATH = os.getenv(
    "ORCHESTRATOR_PATH",
    "/c/Users/משתמש/OneDrive/Desktop/AI/Agents/Agents/orchestrator"
)
sys.path.insert(0, _ORCHESTRATOR_PATH)

try:
    from orchestrator.agents.base_agent import Agent as BaseAgent
except ImportError:
    class BaseAgent(ABC):
        name: str = ""
        description: str = ""

        @abstractmethod
        def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
            raise NotImplementedError


class BaseStudyAgent(BaseAgent):
    """
    מחלקת בסיס לכל סוכני הלמידה.
    מוסיף helper method לקריאת Claude API ישירה.
    """

    def _call_claude(self, prompt: str, system: str = "", max_tokens: int = 4096) -> str:
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
        model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
        kwargs = dict(model=model, max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
        if system:
            kwargs["system"] = system
        resp = client.messages.create(**kwargs)
        return resp.content[0].text
