from flask import Flask, render_template, jsonify, request
import random
import os
import requests
import base64
import json
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

        # 새 형식: images 배열 (base64, mediaType 포함) 또는 레거시: pdfBase64Array
        images = data.get("images", [])
        pdf_base64_array = data.get("pdfBase64Array", [])

        grade = data.get("grade", "2")
        round_num = data.get("round", "1")
        difficulty = data.get("difficulty", "보통")
        select_count = data.get("selectCount", 5)

        # 여러 이미지 또는 단일 이미지를 Claude Vision으로 분석
        if images or pdf_base64_array:
            return analyze_pdf_with_vision(images or pdf_base64_array, grade, round_num, difficulty, select_count)

        # PDF 텍스트가 충분하면 AI 서버로 전송
        if pdf_text and len(pdf_text) >= 200:
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

        return jsonify({"error": "PDF data required"}), 400

    except requests.ConnectionError:
        return jsonify({"error": "AI Server not available"}), 503
    except requests.Timeout:
        return jsonify({"error": "AI Server timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def analyze_pdf_with_vision(pdf_base64_array, grade, round_num, difficulty, select_count=5):
    """Claude Vision API를 사용해서 여러 이미지 분석"""
    try:
        if not anthropic_client:
            return jsonify({"error": "API Key not configured"}), 500

        if not pdf_base64_array:
            return jsonify({"error": "Image data required"}), 400

        prompt = f"""이 사진들은 중학교 {grade}학년 영어 기출문제입니다.

JSON 형식으로만 응답하세요. 마크다운이나 설명은 하지 마세요.

선택 문제 {select_count}개 + 서술형 5문제를 생성하세요.

응답 형식 (JSON만):
{{
  "grade": "{grade}",
  "round": "{round_num}",
  "difficulty": "{difficulty}",
  "questions": [
    {{"id": 1, "type": "mc", "question": "선택문제1", "options": ["①", "②", "③", "④"], "answer": 1, "points": 3, "topic": "어휘"}},
    {{"id": 2, "type": "mc", "question": "선택문제2", "options": ["①", "②", "③", "④"], "answer": 2, "points": 3, "topic": "문법"}},
    {{"id": {select_count + 1}, "type": "essay", "question": "서술형1", "answer": "정답", "points": 3, "explanation": "해설", "topic": "관용표현"}}
  ]
}}"""

        # 모든 이미지를 메시지 content에 추가
        content = []
        for item in pdf_base64_array:
            # 새 형식 (이미지 형식 포함): {base64, mediaType}
            if isinstance(item, dict):
                base64_data = item.get("base64", "")
                media_type = item.get("mediaType", "image/jpeg")
            # 레거시 형식: 순수 base64 문자열
            else:
                base64_data = item
                media_type = "image/jpeg"

            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64_data
                }
            })

        # 마지막에 프롬프트 추가
        content.append({
            "type": "text",
            "text": prompt
        })

        message = anthropic_client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4000,
            messages=[
                {
                    "role": "user",
                    "content": content
                }
            ]
        )

        response_text = message.content[0].text

        # JSON 파싱 및 정리
        result = json.loads(response_text)

        return jsonify({
            "success": True,
            "grade": grade,
            "round": round_num,
            "difficulty": difficulty,
            "questions": result.get("questions", []),
            "message": f"Claude Vision으로 {len(pdf_base64_array)}개 이미지 분석 완료"
        })

    except json.JSONDecodeError:
        return jsonify({
            "error": "JSON parsing failed",
            "raw_response": response_text[:500] if 'response_text' in locals() else "No response"
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
