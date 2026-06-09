from flask import Flask, render_template, jsonify, request
import random
import os
import requests
from data.grade2_questions import GRADE2_QUESTIONS
from data.grade3_questions import GRADE3_QUESTIONS

app = Flask(__name__)

QUESTIONS = {
    "2": GRADE2_QUESTIONS,
    "3": GRADE3_QUESTIONS,
}

# AI 서버 설정
AI_SERVER_URL = os.environ.get("AI_SERVER_URL") or "https://namcheon-ai-server.onrender.com"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/questions/<grade>/<int:round_num>")
def get_questions(grade, round_num):
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
    try:
        data = request.json
        pdf_text = data.get("pdfText", "").strip()

        if not pdf_text:
            return jsonify({"error": "PDF text required"}), 400

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
                "rounds": data.get("rounds", 1),
                "difficulty": data.get("difficulty", "보통")
            },
            timeout=180
        )
        response.raise_for_status()
        return jsonify(response.json())

    except requests.ConnectionError:
        return jsonify({"error": "AI Server not available"}), 503
    except requests.Timeout:
        return jsonify({"error": "AI Server timeout (문제 생성이 오래 걸리고 있습니다)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ai/health")
def ai_health():
    try:
        response = requests.get(f"{AI_SERVER_URL}/health", timeout=5)
        response.raise_for_status()
        return jsonify({"ai_server": "ok"})
    except Exception as e:
        return jsonify({"ai_server": "offline", "error": str(e)}), 503

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
