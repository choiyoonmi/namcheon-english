from flask import Flask, render_template, jsonify, request
import requests
import os
import json
import random
from data.grade2_questions import GRADE2_QUESTIONS
from data.grade3_questions import GRADE3_QUESTIONS

app = Flask(__name__)

QUESTIONS = {
    "2": GRADE2_QUESTIONS,
    "3": GRADE3_QUESTIONS,
}

# AI Server config
AI_SERVER_URL = os.environ.get("AI_SERVER_URL", "http://localhost:3000")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/questions/<grade>/<int:round_num>")
def get_questions(grade, round_num):
    """기존 문제 데이터 반환"""
    if grade not in QUESTIONS:
        return jsonify({"error": "Invalid grade"}), 400
    if round_num < 1 or round_num > 5:
        return jsonify({"error": "Round must be 1-5"}), 400

    qs = [q for q in QUESTIONS[grade] if q["round"] == round_num]
    result = []
    for q in qs:
        item = dict(q)
        if item["type"] == "mc":
            indexed = list(enumerate(item["options"], 1))
            correct_text = item["options"][item["answer"] - 1]
            random.shuffle(indexed)
            new_options = [opt for _, opt in indexed]
            new_answer = new_options.index(correct_text) + 1
            item["options"] = new_options
            item["answer"] = new_answer
        result.append(item)
    return jsonify(result)

@app.route("/api/grades")
def get_grades():
    return jsonify([
        {"value": "2", "label": "2학년 영어"},
        {"value": "3", "label": "3학년 영어"},
    ])

# ===== AI 기반 문제 생성 =====

@app.route("/api/ai/generate", methods=["POST"])
def ai_generate():
    """
    AI 서버에 요청하여 새 문제 생성
    요청 본문:
    {
      "pdfText": "...",
      "grade": "2",
      "round": 1,
      "difficulty": "보통",
      "usedIdioms": [],
      "usedTypes": []
    }
    """
    try:
        data = request.json
        pdf_text = data.get("pdfText", "").strip()

        if not pdf_text:
            return jsonify({"error": "PDF text required"}), 400

        # AI 서버에 요청
        response = requests.post(
            f"{AI_SERVER_URL}/api/generate",
            json={
                "pdfText": pdf_text,
                "options": {
                    "grade": data.get("grade", "2"),
                    "round": data.get("round", 1),
                    "difficulty": data.get("difficulty", "보통"),
                    "usedIdioms": data.get("usedIdioms", []),
                    "usedTypes": data.get("usedTypes", [])
                }
            },
            timeout=30
        )
        response.raise_for_status()
        return jsonify(response.json())

    except requests.ConnectionError:
        return jsonify({"error": "AI Server not available"}), 503
    except requests.Timeout:
        return jsonify({"error": "AI Server timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ai/generate-batch", methods=["POST"])
def ai_generate_batch():
    """
    여러 회차 일괄 생성 (회차별 제약 조건 적용)
    요청 본문:
    {
      "pdfText": "...",
      "grade": "2",
      "rounds": 3,
      "difficulty": "보통"
    }
    """
    try:
        data = request.json
        pdf_text = data.get("pdfText", "").strip()

        if not pdf_text:
            return jsonify({"error": "PDF text required"}), 400

        response = requests.post(
            f"{AI_SERVER_URL}/api/generate-batch",
            json={
                "pdfText": pdf_text,
                "grade": data.get("grade", "2"),
                "rounds": data.get("rounds", 3),
                "difficulty": data.get("difficulty", "보통")
            },
            timeout=120
        )
        response.raise_for_status()
        return jsonify(response.json())

    except requests.ConnectionError:
        return jsonify({"error": "AI Server not available"}), 503
    except requests.Timeout:
        return jsonify({"error": "AI Server timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ai/health")
def ai_health():
    """AI 서버 상태 확인"""
    try:
        response = requests.get(f"{AI_SERVER_URL}/health", timeout=5)
        response.raise_for_status()
        return jsonify({"ai_server": "ok", "status": response.json()})
    except Exception as e:
        return jsonify({"ai_server": "offline", "error": str(e)}), 503

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
