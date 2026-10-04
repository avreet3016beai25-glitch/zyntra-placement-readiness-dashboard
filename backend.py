"""Zyntra's dependency-free Python readiness analysis service.

Run with: python backend.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def number(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def readiness_analysis(profile: dict[str, Any]) -> dict[str, Any]:
    """Produce a transparent readiness score and its contributing factors."""
    skills = profile.get("skills") if isinstance(profile.get("skills"), list) else []
    tasks = profile.get("tasks") if isinstance(profile.get("tasks"), list) else []
    sessions = profile.get("focusSessions") if isinstance(profile.get("focusSessions"), list) else []
    now = datetime.now(timezone.utc)
    recent_minutes = 0.0
    for session in sessions:
        try:
            completed_at = datetime.fromisoformat(str(session.get("completedAt", "")).replace("Z", "+00:00"))
            if completed_at >= now - timedelta(days=7):
                recent_minutes += number(session.get("minutes"))
        except (AttributeError, ValueError):
            continue

    solved, streak = number(profile.get("dsaSolved")), number(profile.get("dsaStreak"))
    completed_tasks = sum(bool(task.get("done")) for task in tasks if isinstance(task, dict))
    task_rate = completed_tasks / len(tasks) if tasks else 0
    project_present = bool(profile.get("currentProject") or profile.get("projects"))
    dimensions = [
        ("Problem solving", min(35, round(solved / 200 * 35)), 35, f"{int(solved)} of 200 practice problems"),
        ("Consistency", min(20, round(streak / 30 * 20)), 20, f"{int(streak)}-day practice streak"),
        ("Technical profile", min(15, round(len(skills) / 6 * 15)), 15, f"{len(skills)} skills added"),
        ("Execution", min(15, round(task_rate * 15)), 15, f"{completed_tasks} of {len(tasks)} tasks complete"),
        ("Portfolio", 10 if profile.get("resume") and project_present else (5 if profile.get("resume") or project_present else 0), 10, "Resume and project evidence"),
        ("Recent focus", min(5, round(recent_minutes / 180 * 5)), 5, f"{int(recent_minutes)} minutes this week"),
    ]
    score = min(100, sum(item[1] for item in dimensions))
    level = "Job-ready" if score >= 85 else "Interview-ready" if score >= 70 else "Developing foundation" if score >= 50 else "Getting started"
    priorities = []
    if solved < 150: priorities.append(f"Solve {max(1, int(150 - solved))} more DSA problems to strengthen interview coverage.")
    if streak < 7: priorities.append("Build a 7-day practice streak; consistency is the quickest score improvement.")
    if len(skills) < 4: priorities.append("Add your strongest technical skills and the tools used in each project.")
    if not profile.get("resume"): priorities.append("Add a resume link so recruiters can verify your profile quickly.")
    if recent_minutes < 120: priorities.append("Schedule 120 focused minutes this week and log the sessions here.")
    if not priorities: priorities.append("Your signals are balanced. Keep logging deliberate practice and applications.")
    return {"score": score, "level": level,
            "dimensions": [{"name": name, "points": points, "maxPoints": maximum, "detail": detail, "percent": round(points / maximum * 100)} for name, points, maximum, detail in dimensions],
            "priorities": priorities[:3], "weeklyFocusMinutes": int(recent_minutes), "generatedAt": now.isoformat()}


def hiring_readiness(profile: dict[str, Any], answers: dict[str, Any]) -> dict[str, Any]:
    """Assess signals employers commonly review before an entry-level hire."""
    profile_score = readiness_analysis(profile)["score"]
    question_groups = {
        "interview": ("Interview preparation", ["mockInterview", "communication"], 20),
        "portfolio": ("Portfolio evidence", ["projects", "resumeQuality"], 20),
        "workplace": ("Workplace readiness", ["teamwork", "applications"], 20),
    }
    dimensions = [("Technical foundation", round(profile_score * 0.4), 40, "Based on your tracked DSA, skills, focus, and profile")]
    for _, (name, fields, maximum) in question_groups.items():
        average = sum(min(4, max(0, number(answers.get(field)))) for field in fields) / len(fields)
        points = round(average / 4 * maximum)
        dimensions.append((name, points, maximum, "Based on your assessment responses"))
    score = sum(item[1] for item in dimensions)
    gaps = [item for item in dimensions if item[1] < item[2] * 0.65]
    recommendations = [f"Improve {name.lower()}: {detail.lower()}." for name, _, _, detail in gaps]
    if not recommendations:
        recommendations = ["Your hiring signals are well-balanced. Start targeting roles that match your strongest skills."]
    return {"score": score, "label": "Strong candidate" if score >= 80 else "Near interview-ready" if score >= 60 else "Building hiring signals",
            "dimensions": [{"name": name, "points": points, "maxPoints": maximum, "detail": detail, "percent": round(points / maximum * 100)} for name, points, maximum, detail in dimensions],
            "recommendations": recommendations[:3]}


class RequestHandler(BaseHTTPRequestHandler):
    def send_json(self, status: int, data: dict[str, Any]) -> None:
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None: self.send_json(HTTPStatus.NO_CONTENT, {})
    def do_GET(self) -> None:
        self.send_json(HTTPStatus.OK, {"status": "ok", "service": "zyntra-python-analysis"}) if self.path.rstrip("/") == "/api/health" else self.send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found."})
    def do_POST(self) -> None:
        if self.path.rstrip("/") not in {"/api/readiness-analysis", "/api/hiring-readiness"}:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found."}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 100_000: raise ValueError("Request is too large.")
            data = json.loads(self.rfile.read(length) or b"{}")
            profile = data.get("profile", data)
            if not isinstance(profile, dict): raise ValueError("Profile must be an object.")
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)}); return
        result = hiring_readiness(profile, data.get("answers", {})) if self.path.rstrip("/") == "/api/hiring-readiness" else readiness_analysis(profile)
        self.send_json(HTTPStatus.OK, result)
    def log_message(self, format: str, *args: Any) -> None: print(f"[python-analysis] {format % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_API_PORT", "8000"))
    print(f"Python analysis API running at http://localhost:{port}")
    ThreadingHTTPServer(("", port), RequestHandler).serve_forever()
