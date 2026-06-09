from flask import Flask, render_template, jsonify, request
import random
import os
import requests
import base64
import anthropic
from data.grade2_questions import GRADE2_QUESTIONS
from data.grade3_questions import GRADE3_QUESTIONS

app = Flask(__name__)

# Anthropic 클라이언트 초기화
api_key = os.environ.get("ANTHROPIC_API_KEY")
anthropic_client = anthropic.Anthropic(api_key=api_key) if api_key else None

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

@app.route("/api/analyze-exam", methods=["POST"])
def analyze_exam():
    try:
        data = request.json
        pdf_text = data.get("pdfText", "").strip()
        pdf_base64 = data.get("pdfBase64", "")
        grade = data.get("grade", "2")
        round_num = data.get("round", "1")
        difficulty = data.get("difficulty", "보통")

        # PDF가 이미지 기반이거나 텍스트가 짧으면 Claude Vision으로 분석
        if not pdf_text or len(pdf_text) < 200:
            if not pdf_base64:
                return jsonify({"error": "PDF data required"}), 400

            # Claude Vision으로 PDF 분석
            return analyze_pdf_with_vision(pdf_base64, grade, round_num, difficulty)

        # PDF 텍스트가 충분하면 AI 서버로 전송
        response = requests.post(
            f"{AI_SERVER_URL}/api/analyze-exam",
            json={
                "pdfText": pdf_text,
                "grade": grade,
                "round": round_num,
                "difficulty": difficulty
            },
            timeout=180
        )
        response.raise_for_status()
        return jsonify(response.json())

    except requests.ConnectionError:
        return jsonify({"error": "AI Server not available"}), 503
    except requests.Timeout:
        return jsonify({"error": "AI Server timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def analyze_pdf_with_vision(pdf_base64, grade, round_num, difficulty):
    """Claude Vision API를 사용해서 이미지 분석"""
    try:
        if not anthropic_client:
            return jsonify({"error": "API Key not configured"}), 500
        prompt = f"""이 사진은 중학교 {grade}학년 영어 기출문제입니다.

회차 {round_num}의 필수 서술형 5문항을 생성해주세요.

[필수 유형]
1. 관용표현 영작 (3점)
2. 조건영작 - 조건 3개 (4점)
3. to부정사/수량 (3점)
4. 복합조건 (4점) x2

[응답 형식]
순수 JSON만 (마크다운 블록 없음):
{{
  "grade": "{grade}",
  "round": "{round_num}",
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "id": 번호,
      "type": "essay",
      "question": "문제",
      "answer": "정답",
      "points": 점수,
      "explanation": "해설",
      "topic": "유형"
    }}
  ]
}}"""

        message = anthropic_client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": pdf_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        )

        response_text = message.content[0].text

        # JSON 파싱 및 정리
        import json
        result = json.loads(response_text)

        return jsonify({
            "success": True,
            "grade": grade,
            "round": round_num,
            "difficulty": difficulty,
            "questions": result.get("questions", []),
            "message": "Claude Vision으로 PDF 분석 완료"
        })

    except json.JSONDecodeError:
        return jsonify({
            "error": "JSON parsing failed",
            "raw_response": response_text[:500]
        }), 500
    except Exception as e:
        return jsonify({"error": f"Vision analysis failed: {str(e)}"}), 500

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
