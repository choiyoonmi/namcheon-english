# 남천중학교 영어 예상기출문제 웹앱

**2026학년도 1학기 중간고사 대비** — 2·3학년 영어 24문항 × 5회차 예상문제 자동 생성 시스템

## 📋 프로젝트 구조

```
namcheon-english/
├── app.py                    # Flask 앱 (기존 문제 제공)
├── app-with-ai.py           # Flask + AI 통합 버전
├── requirements.txt
├── Procfile
├── render.yaml              # Render 배포 설정
│
├── ai-server/               # Node.js AI 문제 생성 서버
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── static/
│   ├── style.css
│   ├── script.js
│   └── ai-script.js        # AI 통합 UI
│
├── templates/
│   └── index.html           # 메인 페이지
│
└── data/
    ├── grade2_questions.py  # 2학년 120문제 데이터셋
    └── grade3_questions.py  # 3학년 120문제 데이터셋
```

## 🚀 로컬 실행 (AI 통합)

### 1. AI 서버 실행

```bash
cd ai-server
npm install
cp .env.example .env
# .env에서 ANTHROPIC_API_KEY 설정
npm start
# 실행 중: http://localhost:3000
```

### 2. Flask 웹앱 실행 (다른 터미널)

```bash
pip install flask requests
python app-with-ai.py
# 실행 중: http://localhost:5000
```

### 3. 브라우저 접속

- **메인 페이지**: http://localhost:5000
- **기존 문제**: 학년/회차 선택 → 인쇄/정답 확인
- **AI 생성** (별도 UI): PDF 텍스트 업로드 → 자동 문제 생성

## 🤖 AI 문제 생성 API

### 단일 생성

```bash
curl -X POST http://localhost:5000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{
    "pdfText": "...",
    "grade": "2",
    "round": 1,
    "difficulty": "보통"
  }'
```

### 일괄 생성 (5회차)

```bash
curl -X POST http://localhost:5000/api/ai/generate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "pdfText": "...",
    "grade": "2",
    "rounds": 5,
    "difficulty": "보통"
  }'
```

### 응답 형식

```json
{
  "analysis": {
    "passages": ["지문 제목"],
    "grammar_points": ["to부정사", "동명사"],
    "idioms": [],
    "has_dialogue": true,
    "difficulty_detected": "중상"
  },
  "questions": [
    {
      "id": 1,
      "type": "독해·내용일치",
      "passage_title": "지문명",
      "question": "다음 글의 내용과 일치하는 것은?",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "answer": 3,
      "points": 3,
      "explanation": "해설 텍스트"
    }
  ]
}
```

## 📦 Render 배포

### 1. GitHub 저장소 생성

```bash
git remote add origin https://github.com/[계정]/namcheon-english.git
git push -u origin main
```

### 2. AI 서버 배포

Render 대시보드:
1. **New → Web Service**
2. GitHub 연결 → `namcheon-english` 선택
3. 빌드 명령어:
   ```bash
   cd ai-server && npm install
   ```
4. 시작 명령어:
   ```bash
   cd ai-server && npm start
   ```
5. **Environment Variables**:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxx...
   NODE_ENV=production
   PORT=3000
   ```
6. **Deploy** 클릭
7. URL 메모 (예: `https://namcheon-ai-server.onrender.com`)

### 3. Flask 웹앱 배포

Render 대시보드:
1. **New → Web Service**
2. GitHub 연결 → 같은 레포
3. 빌드 명령어:
   ```bash
   pip install -r requirements.txt
   ```
4. 시작 명령어:
   ```bash
   gunicorn app-with-ai:app
   ```
5. **Environment Variables**:
   ```
   AI_SERVER_URL=https://namcheon-ai-server.onrender.com
   ```
6. **Deploy** 클릭

## 📚 기능

### 기존 문제 (Flask)
- ✅ 2·3학년 각 120문항 (5회차)
- ✅ 객관식 + 정답 표시
- ✅ 정답표 생성
- ✅ A4 인쇄 최적화

### AI 문제 생성 (Claude 3.5 Sonnet)
- ✅ PDF 교과서 텍스트 분석
- ✅ 자동 유형 분류 (독해/어법/어휘/서논술)
- ✅ 회차별 제약 조건 (중복 방지)
- ✅ 난이도 자동 조정
- ✅ 일괄 5회차 생성

## 🔧 설정

### Flask 앱 (app-with-ai.py)

```python
AI_SERVER_URL = os.environ.get("AI_SERVER_URL", "http://localhost:3000")
```

### AI 서버 (server.js)

```javascript
model: 'claude-opus-4-8'    // Claude 3.5 Sonnet
max_tokens: 8000            // 문제당 ~300-400 토큰
```

## 💰 비용 추정

| 항목 | 비용 |
|------|------|
| **Claude API** (회차당) | ~$0.10-0.20 |
| **Render** (무료 플랜) | 월 750시간 제한 |
| **월별 추정** | $20-50 (문제 생성 빈도에 따라) |

## 📝 라이선스 & 주의사항

- **용도**: 남천중학교 학습용 (교내 배포만)
- **저작권**: 교과서 원문은 출판사 저작권 보호
- **API키 보안**: `.env` 파일은 Git에 커밋하지 말 것

## 🆘 문제 해결

### AI 서버 오프라인

```bash
# 상태 확인
curl http://localhost:5000/api/ai/health

# 로그 확인
tail -f ai-server.log
```

### API 키 오류

```
Error: API key not found
→ .env에서 ANTHROPIC_API_KEY 확인
```

### 문제 생성 시간 초과

- 긴 텍스트는 분할 업로드 권장
- 타임아웃: 30초 (단일), 120초 (일괄)

## 📞 지원

- **문제**: GitHub Issues 또는 학교 담당자
- **Claude API 문서**: https://docs.anthropic.com
- **Render 문서**: https://render.com/docs
